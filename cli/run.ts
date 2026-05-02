import { SCENARIOS, scoreModelResults } from "../lib/benchmark";
import { runScenario } from "../lib/orchestrator";
import type { SpeedScenario } from "../lib/benchmark";

async function main() {
  const baseUrl = process.env.OPENAI_BASE_URL ?? "http://localhost:11434/v1";
  const apiKey = process.env.OPENAI_API_KEY ?? "local";
  const model = process.env.BENCH_MODEL ?? "llama3";

  const inferenceConfig = { baseUrl, apiKey, model };

  console.log("SpeedBench-15 — Local CLI Runner");
  console.log("=".repeat(50));
  console.log(`Endpoint : ${baseUrl}`);
  console.log(`Model    : ${model}`);
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

  const results: any[] = [];

  for (const scenario of toRun) {
    process.stdout.write(`[${scenario.category}] ${scenario.title} ... `);
    try {
      const result = await runScenario(
        scenario.id,
        inferenceConfig,
        { temperature: 0 },
        (msg) => process.stdout.write(`\n  → ${msg} `)
      );
      results.push({ ...result, category: scenario.category });
      console.log(`✓  ${result.summary}`);
    } catch (err: any) {
      console.log(`✗  ERROR: ${err.message}`);
      results.push({
        scenarioId: scenario.id,
        category: scenario.category,
        status: "fail",
        score: 0,
        summary: `Error: ${err.message}`,
        rawLog: err.stack ?? err.message
      });
    }
  }

  console.log("");
  console.log("=".repeat(50));
  console.log("RESULTS SUMMARY");
  console.log("=".repeat(50));

  const scored = scoreModelResults(results);
  console.log(`Token Generation Speed : ${scored.totalScore.toFixed(1)} tok/s`);
  console.log("");

  for (const cat of scored.categories) {
    const value = cat.unit === "ms"
      ? `${cat.score.toFixed(0)} ms`
      : cat.unit === "×"
        ? `${cat.score.toFixed(2)} ×`
        : `${cat.score.toFixed(1)} ${cat.unit}`;
    console.log(`  ${cat.label.padEnd(38)} ${value}`);
  }

  console.log("");
  if (scored.summary) console.log(scored.summary);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
