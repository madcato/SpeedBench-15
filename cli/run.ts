import * as path from "path";
import * as readline from "readline";
import { SCENARIOS, scoreModelResults } from "../lib/benchmark";
import type { SpeedScenario } from "../lib/benchmark";

// Minimal stub helpers for local CLI testing (no BenchLocal host required)
function createCliHelpers() {
  return {
    async chatCompletion(params: any): Promise<any> {
      const baseUrl = process.env.OPENAI_BASE_URL ?? "http://localhost:11434/v1";
      const apiKey = process.env.OPENAI_API_KEY ?? "local";
      const model = process.env.BENCH_MODEL ?? "llama3";

      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: params.messages,
          max_tokens: params.max_tokens,
          temperature: params.temperature ?? 0,
          stream: true
        })
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      }

      // Return an async iterable that yields SSE chunks as OpenAI-style objects
      return sseToAsyncIterable(resp);
    }
  };
}

async function* sseToAsyncIterable(resp: Response): AsyncIterable<any> {
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
      try {
        yield JSON.parse(data);
      } catch {
        // skip malformed lines
      }
    }
  }
}

function emit(event: any) {
  // No-op for CLI; progress is printed separately
}

async function runAllScenarios() {
  const helpers = createCliHelpers();
  const results: any[] = [];

  console.log("SpeedBench-15 — Local CLI Runner");
  console.log("=".repeat(50));
  console.log(`Endpoint : ${process.env.OPENAI_BASE_URL ?? "http://localhost:11434/v1"}`);
  console.log(`Model    : ${process.env.BENCH_MODEL ?? "llama3"}`);
  console.log("");

  const scenarioIds = process.argv.slice(2);
  const toRun: SpeedScenario[] = scenarioIds.length > 0
    ? SCENARIOS.filter(s => scenarioIds.includes(s.id))
    : SCENARIOS;

  if (toRun.length === 0) {
    console.error("No matching scenarios found. Available IDs:");
    SCENARIOS.forEach(s => console.error(`  ${s.id}`));
    process.exit(1);
  }

  for (const scenario of toRun) {
    process.stdout.write(`[${scenario.category}] ${scenario.title} ... `);

    try {
      const { runScenarioForModel } = await import("../lib/orchestrator");
      const result = await runScenarioForModel(
        {
          scenarioId: scenario.id,
          generationSettings: { temperature: 0, stream: true },
          emit
        } as any,
        helpers as any
      );

      results.push(result);
      console.log(`✓  ${result.summary}`);
    } catch (err: any) {
      console.log(`✗  ERROR: ${err.message}`);
      results.push({
        scenarioId: scenario.id,
        category: scenario.category,
        status: "error",
        score: 0,
        summary: `Error: ${err.message}`
      });
    }
  }

  console.log("");
  console.log("=".repeat(50));
  console.log("RESULTS SUMMARY");
  console.log("=".repeat(50));

  const scored = scoreModelResults(results);
  console.log(`Total Score: ${scored.totalScore}/100`);
  console.log("");

  for (const cat of scored.categories) {
    console.log(`  ${cat.label.padEnd(35)} ${cat.score.toFixed(1)}/100`);
  }

  console.log("");
  console.log(scored.summary);
}

runAllScenarios().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
