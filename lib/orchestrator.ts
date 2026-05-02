import * as fs from "fs";
import * as path from "path";
import type { ScenarioResult } from "@benchlocal/sdk";
import type { SpeedScenario } from "./benchmark";
import { SCENARIOS } from "./benchmark";
import { computeMetrics, computeCacheMetrics, type TimingRecord } from "./metrics";

export interface InferenceConfig {
  baseUrl: string;
  authMode?: "none" | "bearer";
  apiKey?: string;
  model: string;
}

type GenerationOptions = {
  temperature?: number;
  top_p?: number;
};

interface RunResult {
  ttftMs: number;
  tgsTokensPerSec: number;
  ppTokensPerSec: number;
  totalLatencyMs: number;
  generatedTokens: number;
  generatedText: string;
}

export async function runScenario(
  scenarioId: string,
  inferenceConfig: InferenceConfig,
  generation: GenerationOptions,
  onProgress?: (msg: string) => void
): Promise<ScenarioResult> {
  const scenario = SCENARIOS.find(s => s.id === scenarioId);
  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioId}`);
  }

  const metrics: {
    ttftMs: number;
    tgsTokensPerSec: number;
    ppTokensPerSec: number;
    totalLatencyMs: number;
    promptTokens: number;
    generatedTokens: number;
    cacheHitRate?: number;
    cacheSpeedup?: number;
  } = {
    ttftMs: 0,
    tgsTokensPerSec: 0,
    ppTokensPerSec: 0,
    totalLatencyMs: 0,
    promptTokens: scenario.promptTokens,
    generatedTokens: 0
  };

  const messages = buildMessages(scenario);

  const coldRun = await executeStreamingRun(
    messages,
    inferenceConfig,
    generation,
    scenario.promptTokens,
    scenario.targetTokens
  );

  metrics.ttftMs = coldRun.ttftMs;
  metrics.tgsTokensPerSec = coldRun.tgsTokensPerSec;
  metrics.ppTokensPerSec = coldRun.ppTokensPerSec;
  metrics.generatedTokens = coldRun.generatedTokens;
  metrics.totalLatencyMs = coldRun.totalLatencyMs;

  if (scenario.isCacheTest) {
    onProgress?.("Cache warm-up complete. Running cached request...");
    const cachedRun = await executeStreamingRun(
      messages,
      inferenceConfig,
      generation,
      scenario.promptTokens,
      scenario.targetTokens
    );
    const cacheMetrics = computeCacheMetrics(coldRun, cachedRun);
    metrics.cacheSpeedup = cacheMetrics.cacheSpeedup;
    metrics.cacheHitRate = cacheMetrics.cacheHitRate;
  }

  return {
    scenarioId: scenario.id,
    status: "pass",
    score: calculateScenarioScore(metrics, scenario),
    summary: buildSummary(metrics, scenario),
    rawLog: JSON.stringify(metrics, null, 2),
    timings: {
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: metrics.totalLatencyMs
    },
    output: {
      finalAnswer: coldRun.generatedText,
      assistantMessages: [coldRun.generatedText]
    }
  };
}

async function executeStreamingRun(
  messages: Array<{ role: string; content: string }>,
  config: InferenceConfig,
  generation: GenerationOptions,
  promptTokens: number,
  maxTokens: number
): Promise<RunResult> {
  const timing: TimingRecord = {
    requestStart: performance.now(),
    firstTokenTime: null,
    tokenTimestamps: [],
    completionTime: 0
  };

  let generatedText = "";

  // Normalize: strip trailing slash and any trailing /v1 so we always control the full path
  const base = config.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if ((config.authMode ?? "bearer") === "bearer" && config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const resp = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
      // Add 2048 headroom so thinking models don't exhaust the budget before generating content
      max_tokens: maxTokens + 2048,
      temperature: generation.temperature ?? 0,
      stream: true
    })
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  }

  for await (const chunk of sseStream(resp)) {
    const now = performance.now();
    if (timing.firstTokenTime === null) {
      timing.firstTokenTime = now;
    }
    const deltaObj = chunk.choices?.[0]?.delta ?? {};
    const content: string = deltaObj.content ?? "";
    // Capture thinking tokens under both common field names (vLLM: "reasoning", OpenAI-compat: "reasoning_content")
    const reasoning: string = deltaObj.reasoning ?? deltaObj.reasoning_content ?? "";
    const token = content || reasoning;
    if (token) {
      timing.tokenTimestamps.push(now);
      generatedText += content;
    }
  }

  timing.completionTime = performance.now();
  const computed = computeMetrics(timing, promptTokens);

  return { ...computed, generatedText };
}

async function* sseStream(resp: Response): AsyncGenerator<any> {
  if (!resp.body) return;
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      try { yield JSON.parse(data); } catch { /* skip malformed */ }
    }
  }
}

function buildMessages(scenario: SpeedScenario): Array<{ role: string; content: string }> {
  if (scenario.id === "cache-multiturn") {
    return buildMultiturnMessages();
  }
  return [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: getPromptText(scenario) }
  ];
}

function buildMultiturnMessages(): Array<{ role: string; content: string }> {
  const convPath = path.resolve(__dirname, "../../lib/prompts/conversation.json");
  try {
    return JSON.parse(fs.readFileSync(convPath, "utf-8"));
  } catch {
    return [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Tell me about machine learning." },
      { role: "assistant", content: "Machine learning is a branch of artificial intelligence..." },
      { role: "user", content: "How does deep learning differ from traditional ML?" }
    ];
  }
}

function getPromptText(scenario: SpeedScenario): string {
  switch (scenario.id) {
    case "ttft-minimal":
      return loadPromptFile("short.txt") || "Hello";

    case "ttft-medium":
    case "cache-repeat":
    case "cache-overlap":
    case "pp-medium":
      return loadPromptFile("medium.txt");

    case "ttft-long":
    case "pp-long":
    case "stress-max-context":
      return loadPromptFile("long.txt");

    case "tgs-short":
      return "Write a short paragraph about the history of computing. Be concise.";

    case "tgs-medium":
      return "Write a detailed explanation of how transformers work in machine learning.";

    case "tgs-long":
      return "Write an essay about the evolution of programming languages from the 1950s to today.";

    case "pp-short":
      return "Explain the concept of object-oriented programming briefly.";

    case "stress-rapid":
      return "List three facts about space exploration.";

    case "stress-mixed":
      return loadPromptFile("medium.txt");

    default:
      return "Please respond with a detailed answer to this benchmark prompt.";
  }
}

function loadPromptFile(filename: string): string {
  // Prompts live at project-root/lib/prompts/. Compiled output is 2 dirs deep (dist/lib/ or dist-cli/lib/).
  const filePath = path.resolve(__dirname, "../../lib/prompts", filename);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    // Fallback: try sibling prompts/ dir (running from source)
    const srcPath = path.resolve(__dirname, "prompts", filename);
    try {
      return fs.readFileSync(srcPath, "utf-8");
    } catch {
      return `(prompt file ${filename} not found)`;
    }
  }
}

function buildSummary(metrics: Record<string, any>, scenario: SpeedScenario): string {
  if (scenario.isCacheTest) {
    const speedup = metrics.cacheSpeedup ?? 1;
    const cachedTtft = speedup > 0 ? Math.round(metrics.ttftMs / speedup) : metrics.ttftMs;
    return `Cache speedup: ${speedup.toFixed(2)}x | Cold TTFT: ${metrics.ttftMs}ms | Cached TTFT: ${cachedTtft}ms`;
  }
  if (scenario.targetTokens === 1) {
    return `TTFT: ${metrics.ttftMs}ms | PP: ${metrics.ppTokensPerSec.toFixed(2)} tok/s`;
  }
  return `TTFT: ${metrics.ttftMs}ms | TGS: ${metrics.tgsTokensPerSec.toFixed(2)} tok/s | Tokens: ${metrics.generatedTokens}`;
}

function calculateScenarioScore(metrics: Record<string, any>, scenario: SpeedScenario): number {
  if (scenario.isCacheTest) {
    return Math.round((metrics.cacheSpeedup ?? 1) * 100) / 100; // speedup ratio (×)
  }
  if (scenario.targetTokens === 1) {
    return metrics.ttftMs; // TTFT in ms
  }
  return Math.round(metrics.tgsTokensPerSec * 10) / 10; // tok/s
}
