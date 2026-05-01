import * as fs from "fs";
import * as path from "path";
import type { ScenarioRunInput, HostHelpers } from "@benchlocal/sdk";
import type { SpeedScenario } from "./benchmark";
import { SCENARIOS } from "./benchmark";
import { computeMetrics, computeCacheMetrics, type TimingRecord } from "./metrics";

interface RunResult {
  ttftMs: number;
  tgsTokensPerSec: number;
  ppTokensPerSec: number;
  totalLatencyMs: number;
  generatedTokens: number;
  generatedText: string;
}

export async function runScenarioForModel(
  input: ScenarioRunInput,
  helpers: HostHelpers
): Promise<any> {
  const { generationSettings, emit } = input;
  const scenario = SCENARIOS.find(s => s.id === input.scenarioId);

  if (!scenario) {
    throw new Error(`Unknown scenario: ${input.scenarioId}`);
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

  emit({ type: "run_started" });
  emit({ type: "scenario_started" });

  const messages = buildMessages(scenario);

  const coldRun = await executeStreamingRun(
    messages,
    generationSettings,
    helpers,
    scenario.promptTokens,
    scenario.targetTokens
  );

  metrics.ttftMs = coldRun.ttftMs;
  metrics.tgsTokensPerSec = coldRun.tgsTokensPerSec;
  metrics.ppTokensPerSec = coldRun.ppTokensPerSec;
  metrics.generatedTokens = coldRun.generatedTokens;
  metrics.totalLatencyMs = coldRun.totalLatencyMs;

  if (scenario.isCacheTest) {
    emit({ type: "model_progress", detail: "Cache warm-up complete. Running cached request..." });
    const cachedRun = await executeStreamingRun(
      messages,
      generationSettings,
      helpers,
      scenario.promptTokens,
      scenario.targetTokens
    );
    const cacheMetrics = computeCacheMetrics(coldRun, cachedRun);
    metrics.cacheSpeedup = cacheMetrics.cacheSpeedup;
    metrics.cacheHitRate = cacheMetrics.cacheHitRate;
  }

  const summary = buildSummary(metrics, scenario);
  const startedAt = new Date().toISOString();

  return {
    scenarioId: scenario.id,
    category: scenario.category,
    status: "pass",
    score: calculateScenarioScore(metrics, scenario),
    summary,
    rawLog: JSON.stringify(metrics, null, 2),
    timings: {
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: metrics.totalLatencyMs
    },
    output: {
      text: coldRun.generatedText
    }
  };
}

async function executeStreamingRun(
  messages: any[],
  settings: any,
  helpers: HostHelpers,
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

  const response = await helpers.chatCompletion({
    messages,
    max_tokens: maxTokens,
    temperature: settings?.temperature ?? 0,
    stream: true
  });

  for await (const chunk of response) {
    const now = performance.now();
    if (timing.firstTokenTime === null) {
      timing.firstTokenTime = now;
    }
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (delta) {
      timing.tokenTimestamps.push(now);
      generatedText += delta;
    }
  }

  timing.completionTime = performance.now();

  const computed = computeMetrics(timing, promptTokens);

  return {
    ...computed,
    generatedText
  };
}

function buildMessages(scenario: SpeedScenario): any[] {
  if (scenario.id === "cache-multiturn") {
    return buildMultiturnMessages();
  }

  const system = "You are a helpful assistant.";
  const user = getPromptText(scenario);
  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

function buildMultiturnMessages(): any[] {
  const convPath = path.join(__dirname, "prompts", "conversation.json");
  try {
    const raw = fs.readFileSync(convPath, "utf-8");
    return JSON.parse(raw);
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
      return loadPromptFile("short.txt") + " Explain the concept briefly.";

    case "stress-rapid":
      return "List three facts about space exploration.";

    case "stress-mixed":
      return loadPromptFile("medium.txt");

    default:
      return "Please respond with a detailed answer to this benchmark prompt.";
  }
}

function loadPromptFile(filename: string): string {
  const filePath = path.join(__dirname, "prompts", filename);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return `Benchmark prompt (${filename} not found).`;
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

function calculateScenarioScore(metrics: any, scenario: SpeedScenario): number {
  if (scenario.isCacheTest) {
    // 1x speedup = 50, 2x speedup = 100
    return Math.min(100, (metrics.cacheSpeedup ?? 1) * 50);
  }
  if (scenario.targetTokens === 1) {
    // Lower TTFT is better; 0ms = 100, 1000ms = 0
    return Math.max(0, 100 - (metrics.ttftMs / 10));
  }
  // Higher TGS is better; rough normalization: 50 tok/s = 100
  return Math.min(100, metrics.tgsTokensPerSec * 2);
}
