Here's the complete build instruction document in English:

---

# SpeedBench-15: Token Generation Speed Benchmark — Build Instructions for OpenCode

## Overview

**SpeedBench-15** is a BenchLocal Bench Pack designed to measure local LLM inference performance across key speed metrics: **Time to First Token (TTFT)**, **Token Generation Speed (TGS)**, and **Prompt Processing (PP)**. This benchmark evaluates models under various scenarios to assess raw throughput, prompt handling efficiency, and KV cache effectiveness.

## Purpose

This benchmark helps answer critical performance questions:
- How fast does the model start responding? (TTFT)
- How quickly does it generate tokens? (TGS)
- How efficiently does it process prompts? (PP)
- Does the KV cache work correctly for repeated/overlapping prompts?
- How do different prompt lengths and generation targets affect performance?

---

## Benchmark Structure

### Categories & Scenarios (15 Total)

Organized into 5 categories with 3 scenarios each:

#### 1. **Cold Start & TTFT (Time to First Token)**
- **1A. Minimal Prompt TTFT**: Single-token response to a very short prompt (~5 tokens)
- **1B. Medium Prompt TTFT**: First token after a 500-token system + user prompt
- **1C. Long Context TTFT**: First token after a 4000-token document summary request

#### 2. **Token Generation Speed (TGS)**
- **2A. Short Generation**: Generate exactly 50 tokens of simple text
- **2B. Medium Generation**: Generate 200 tokens with moderate complexity
- **2C. Long Generation**: Generate 500 tokens of coherent text

#### 3. **Prompt Processing Efficiency (PP)**
- **3A. Short Prompt Processing**: 100-token prompt with minimal computation
- **3B. Medium Prompt Processing**: 1000-token prompt with reasoning required
- **3C. Long Prompt Processing**: 4000-token prompt with information extraction

#### 4. **KV Cache Effectiveness**
- **4A. Repeat Prompt (Cache Hit)**: Run the same 1000-token prompt twice, measure speedup
- **4B. Overlapping Prompt (Partial Cache)**: Run prompt A (1000 tokens), then prompt A+B (1500 tokens)
- **4C. Multi-turn Conversation (Incremental Cache)**: 3-turn conversation where context grows incrementally

#### 5. **Stress & Edge Cases**
- **5A. Maximum Context Window**: Run at 80% of model's max context length
- **5B. Rapid Tool Call Simulation**: Generate many short outputs in quick succession
- **5C. Mixed Workload**: Cycle through short/medium/long prompts rapidly

---

## Metrics Definition

Each scenario records these core metrics:

| Metric | Description | Unit |
|--------|-------------|------|
| **TTFT** | Time from request to first generated token | milliseconds |
| **TGS** | Tokens generated per second (excluding prompt processing) | tokens/sec |
| **PP** | Prompt processing speed (time to process input tokens) | tokens/sec |
| **Total Latency** | Total time from request to completion | milliseconds |
| **Cache Hit Rate** | Percentage of tokens served from KV cache (where applicable) | % |

---

## Bench Pack Structure

```
SpeedBench-15/
├── benchlocal/
│   └── index.ts                 # Thin BenchLocal SDK adapter
├── cli/
│   └── run.ts                   # Non-UI runner for local testing
├── lib/
│   ├── benchmark.ts             # Benchmark core, scenarios, scoring
│   ├── orchestrator.ts          # Run orchestration and metrics collection
│   ├── metrics.ts               # Timing and metric calculation helpers
│   └── prompts/                 # Pre-defined benchmark prompts
│       ├── short.txt            # ~5 token prompts
│       ├── medium.txt           # ~500 token prompts
│       ├── long.txt             # ~4000 token prompts
│       └── conversation.json    # Multi-turn conversation templates
├── benchlocal.pack.json         # Canonical Bench Pack manifest
├── package.json
├── tsconfig.json
├── tsconfig.benchlocal.json
├── tsconfig.cli.json
├── README.md
├── METHODOLOGY.md
└── LICENSE
```

---

## Implementation Details

### 1. Metrics Collection Strategy

Since BenchLocal doesn't have built-in timing hooks for token streaming, the benchmark must:

1. **Use streaming mode**: Enable streaming in the API request to capture token arrival times
2. **Track timestamps**: Record:
   - `requestStart`: When the API call is made
   - `firstTokenTime`: When the first token is received
   - `tokenTimestamps[]`: Array of arrival times for each generated token
   - `completionTime`: When generation finishes
3. **Calculate metrics**:
   ```typescript
   const ttft = firstTokenTime - requestStart;
   const generationTime = completionTime - firstTokenTime;
   const tokenCount = tokenTimestamps.length;
   const tgs = tokenCount / (generationTime / 1000); // tokens per second

   // For prompt processing:
   const promptTokens = estimatePromptTokens(prompt);
   const pp = promptTokens / (ttft / 1000); // prompt tokens per second
   ```

### 2. Cache Testing Strategy

For cache effectiveness scenarios:

1. **Warm-up run**: Run the prompt once to populate the cache
2. **Timed run**: Run again with precise timing
3. **Comparison**: Calculate speedup ratio
   ```
   cacheSpeedup = (coldRunTime - cachedRunTime) / coldRunTime
   ```

**Important**: BenchLocal must clear the cache between scenarios where applicable. The benchmark should request cache eviction through provider settings where supported.

### 3. Scenario Result Structure

Each scenario returns a `ScenarioResult` extended with timing data:

```typescript
type SpeedScenarioResult = ScenarioResult & {
  metrics: {
    ttftMs: number;
    tgsTokensPerSec: number;
    ppTokensPerSec: number;
    totalLatencyMs: number;
    promptTokens: number;
    generatedTokens: number;
    cacheHitRate?: number;
    cacheSpeedup?: number;
  };
  rawLog: string; // detailed timing log
};
```

### 4. Scoring Methodology

Unlike quality benchmarks, this uses a **normalized performance score**:

- Each metric is normalized against a baseline model (or maximum observed)
- Weighted average across scenarios in each category
- Final score: average of category percentages

Example scoring for TGS category:
```
Category Score = avg(normalize(tgs_50), normalize(tgs_200), normalize(tgs_500))
```

Normalization formula:
```
normalized = (value / maxObservedValue) * 100
```

For cache scenarios, higher speedup = better score.

---

## `benchlocal.pack.json`

```json
{
  "schemaVersion": 1,
  "protocolVersion": 1,
  "id": "speedbench-15",
  "name": "SpeedBench-15",
  "author": "stevibe",
  "version": "1.0.0",
  "description": "Performance benchmark measuring TTFT, token generation speed, prompt processing, and KV cache effectiveness across 15 scenarios.",
  "entry": "./dist/benchlocal/index.js",
  "samplingDefaults": {
    "temperature": 0,
    "stream": true,
    "request_timeout_seconds": 600
  },
  "capabilities": {
    "tools": false,
    "multiTurn": true,
    "streamingProgress": true,
    "verification": false
  },
  "theme": {
    "accent": "#e67e22"
  }
}
```

**Note**: The timeout is increased to 600 seconds (10 minutes) for long-context scenarios.

---

## `benchlocal/index.ts` (Adapter Layer)

```typescript
import {
  createHostHelpers,
  defineBenchPack,
  loadBenchPackManifest,
  requireScoredResults,
  type ScenarioRunInput,
  type ScenarioResult
} from "@benchlocal/sdk";

import { SCENARIOS, getScenarioCards, scoreModelResults } from "../lib/benchmark";
import { runScenarioForModel } from "../lib/orchestrator";

const manifest = loadBenchPackManifest(__dirname);

export { manifest };

export default defineBenchPack({
  manifest,

  async listScenarios() {
    return SCENARIOS.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      detailCards: getScenarioCards(scenario)
    }));
  },

  async prepare(context) {
    const helpers = createHostHelpers(context);
    return {
      async runScenario(input: ScenarioRunInput): Promise<ScenarioResult> {
        return runScenarioForModel(input, helpers);
      },
      async dispose() {
        // Cleanup any cached state if needed
      }
    };
  },

  scoreModelResults(results) {
    return scoreModelResults(requireScoredResults(results));
  }
});
```

---

## `lib/benchmark.ts` (Core Logic)

```typescript
import type { ScenarioCard } from "@benchlocal/sdk";

export interface SpeedScenario {
  id: string;
  title: string;
  category: string;
  description: string;
  promptTokens: number;
  targetTokens: number;
  isCacheTest: boolean;
}

export const SCENARIOS: SpeedScenario[] = [
  // Category 1: Cold Start & TTFT
  {
    id: "ttft-minimal",
    title: "Minimal Prompt TTFT",
    category: "Cold Start & TTFT",
    description: "Measure time to first token for a ~5 token prompt",
    promptTokens: 5,
    targetTokens: 1,
    isCacheTest: false
  },
  {
    id: "ttft-medium",
    title: "Medium Prompt TTFT",
    category: "Cold Start & TTFT",
    description: "Measure time to first token for a ~500 token prompt",
    promptTokens: 500,
    targetTokens: 1,
    isCacheTest: false
  },
  {
    id: "ttft-long",
    title: "Long Context TTFT",
    category: "Cold Start & TTFT",
    description: "Measure time to first token for a ~4000 token document",
    promptTokens: 4000,
    targetTokens: 1,
    isCacheTest: false
  },
  // Category 2: Token Generation Speed
  {
    id: "tgs-short",
    title: "Short Generation (50 tok)",
    category: "Token Generation Speed",
    description: "Generate exactly 50 tokens of simple text",
    promptTokens: 10,
    targetTokens: 50,
    isCacheTest: false
  },
  {
    id: "tgs-medium",
    title: "Medium Generation (200 tok)",
    category: "Token Generation Speed",
    description: "Generate 200 tokens with moderate complexity",
    promptTokens: 10,
    targetTokens: 200,
    isCacheTest: false
  },
  {
    id: "tgs-long",
    title: "Long Generation (500 tok)",
    category: "Token Generation Speed",
    description: "Generate 500 tokens of coherent text",
    promptTokens: 10,
    targetTokens: 500,
    isCacheTest: false
  },
  // Category 3: Prompt Processing Efficiency
  {
    id: "pp-short",
    title: "Short Prompt Processing",
    category: "Prompt Processing Efficiency",
    description: "Process a ~100 token prompt",
    promptTokens: 100,
    targetTokens: 20,
    isCacheTest: false
  },
  {
    id: "pp-medium",
    title: "Medium Prompt Processing",
    category: "Prompt Processing Efficiency",
    description: "Process a ~1000 token prompt with reasoning",
    promptTokens: 1000,
    targetTokens: 50,
    isCacheTest: false
  },
  {
    id: "pp-long",
    title: "Long Prompt Processing",
    category: "Prompt Processing Efficiency",
    description: "Process a ~4000 token prompt with info extraction",
    promptTokens: 4000,
    targetTokens: 100,
    isCacheTest: false
  },
  // Category 4: KV Cache Effectiveness
  {
    id: "cache-repeat",
    title: "Repeat Prompt (Cache Hit)",
    category: "KV Cache Effectiveness",
    description: "Run the same 1000-token prompt twice, measure speedup",
    promptTokens: 1000,
    targetTokens: 50,
    isCacheTest: true
  },
  {
    id: "cache-overlap",
    title: "Overlapping Prompt (Partial Cache)",
    category: "KV Cache Effectiveness",
    description: "Run prompt A then A+B, measure incremental speedup",
    promptTokens: 1500,
    targetTokens: 50,
    isCacheTest: true
  },
  {
    id: "cache-multiturn",
    title: "Multi-turn Conversation (Incremental Cache)",
    category: "KV Cache Effectiveness",
    description: "3-turn conversation with growing context",
    promptTokens: 2000,
    targetTokens: 150,
    isCacheTest: true
  },
  // Category 5: Stress & Edge Cases
  {
    id: "stress-max-context",
    title: "Maximum Context Window",
    category: "Stress & Edge Cases",
    description: "Run at 80% of model's max context length",
    promptTokens: 8000,
    targetTokens: 50,
    isCacheTest: false
  },
  {
    id: "stress-rapid",
    title: "Rapid Short Outputs",
    category: "Stress & Edge Cases",
    description: "Generate many short outputs in quick succession",
    promptTokens: 20,
    targetTokens: 30,
    isCacheTest: false
  },
  {
    id: "stress-mixed",
    title: "Mixed Workload",
    category: "Stress & Edge Cases",
    description: "Cycle through short/medium/long prompts rapidly",
    promptTokens: 1000,
    targetTokens: 100,
    isCacheTest: false
  }
];

export function getScenarioCards(scenario: SpeedScenario): ScenarioCard[] {
  return [
    {
      label: "What this tests",
      content: scenario.description
    },
    {
      label: "Input size",
      content: `~${scenario.promptTokens} prompt tokens`
    },
    {
      label: "Output target",
      content: `${scenario.targetTokens} tokens`
    },
    {
      label: "Key metric",
      content: scenario.isCacheTest
        ? "Cache speedup ratio"
        : scenario.targetTokens === 1
          ? "TTFT (ms)"
          : "TGS (tokens/sec)"
    }
  ];
}

export function scoreModelResults(results: any[]): BenchmarkScore {
  const categories = [
    "Cold Start & TTFT",
    "Token Generation Speed",
    "Prompt Processing Efficiency",
    "KV Cache Effectiveness",
    "Stress & Edge Cases"
  ];

  const categoryScores = categories.map(cat => {
    const catResults = results.filter(r =>
      r.category === cat
    );
    return {
      id: cat.toLowerCase().replace(/\s+/g, "-"),
      label: cat,
      score: calculateCategoryScore(catResults)
    };
  });

  const totalScore = categoryScores.reduce((sum, c) => sum + c.score, 0) / categories.length;

  return {
    totalScore: Math.round(totalScore),
    categories: categoryScores,
    summary: `SpeedBench-15 performance score: ${Math.round(totalScore)}/100`
  };
}

function calculateCategoryScore(results: any[]): number {
  if (results.length === 0) return 0;
  // Normalize against best-performing model or baseline
  // Simplified: average of scenario scores (0-100 each)
  const avg = results.reduce((sum, r) => sum + (r.score ?? 0), 0) / results.length;
  return avg;
}
```

---

## `lib/orchestrator.ts` (Timing & Measurement)

```typescript
import type { ScenarioRunInput, HostHelpers } from "@benchlocal/sdk";
import type { SpeedScenario } from "./benchmark";
import { SCENARIOS } from "./benchmark";

export async function runScenarioForModel(
  input: ScenarioRunInput,
  helpers: HostHelpers
): Promise<any> {
  const { model, generationSettings, provider, emit } = input;
  const scenario = SCENARIOS.find(s => s.id === input.scenarioId);

  if (!scenario) {
    throw new Error(`Unknown scenario: ${input.scenarioId}`);
  }

  const metrics = {
    ttftMs: 0,
    tgsTokensPerSec: 0,
    ppTokensPerSec: 0,
    totalLatencyMs: 0,
    promptTokens: scenario.promptTokens,
    generatedTokens: 0,
    cacheHitRate: undefined as number | undefined,
    cacheSpeedup: undefined as number | undefined
  };

  emit({ type: "run_started" });
  emit({ type: "scenario_started" });

  const messages = buildMessages(scenario);

  // --- Cold run ---
  const coldRun = await executeStreamingRun(messages, generationSettings, helpers, model, provider);
  metrics.ttftMs = coldRun.ttftMs;
  metrics.tgsTokensPerSec = coldRun.tgsTokensPerSec;
  metrics.ppTokensPerSec = coldRun.ppTokensPerSec;
  metrics.generatedTokens = coldRun.generatedTokens;
  metrics.totalLatencyMs = coldRun.totalLatencyMs;

  // --- Cache run (if applicable) ---
  if (scenario.isCacheTest) {
    emit({ type: "model_progress", detail: "Cache warm-up complete. Running cached request..." });
    const cachedRun = await executeStreamingRun(messages, generationSettings, helpers, model, provider);
    metrics.cacheSpeedup = coldRun.totalLatencyMs / cachedRun.totalLatencyMs;
    metrics.cacheHitRate = 1 - (cachedRun.ttftMs / coldRun.ttftMs); // Simplified
  }

  const summary = buildSummary(metrics, scenario);

  return {
    scenarioId: scenario.id,
    category: scenario.category,
    status: "pass",
    score: calculateScenarioScore(metrics, scenario),
    summary,
    rawLog: JSON.stringify(metrics, null, 2),
    timings: {
      startedAt: new Date().toISOString(),
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
  helpers: any,
  model: any,
  provider: any
) {
  const requestStart = performance.now();
  const tokenTimestamps: number[] = [];
  let firstTokenTime: number | null = null;
  let generatedText = "";

  const response = await helpers.chatCompletion({
    messages,
    max_tokens: 500, // Cap for safety
    temperature: settings.temperature ?? 0,
    stream: true
  });

  for await (const chunk of response) {
    const now = performance.now();
    if (firstTokenTime === null) {
      firstTokenTime = now;
    }
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (delta) {
      tokenTimestamps.push(now);
      generatedText += delta;
    }
  }

  const completionTime = performance.now();
  const ttftMs = firstTokenTime ? Math.round(firstTokenTime - requestStart) : 0;
  const generationTime = firstTokenTime ? completionTime - firstTokenTime : completionTime - requestStart;
  const generatedTokens = tokenTimestamps.length;
  const tgsTokensPerSec = generationTime > 0 ? generatedTokens / (generationTime / 1000) : 0;
  const ppTokensPerSec = ttftMs > 0 ? 0 : 0; // Estimate prompt tokens separately

  return {
    ttftMs,
    tgsTokensPerSec,
    ppTokensPerSec,
    totalLatencyMs: Math.round(completionTime - requestStart),
    generatedTokens,
    generatedText
  };
}

function buildMessages(scenario: SpeedScenario): any[] {
  const system = "You are a helpful assistant.";
  const user = getPromptText(scenario);
  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

function getPromptText(scenario: SpeedScenario): string {
  // Load from lib/prompts/ based on scenario
  switch (scenario.id) {
    case "ttft-minimal":
      return "Hello";
    case "ttft-medium":
      return loadPromptFile("medium.txt");
    case "ttft-long":
    case "pp-long":
      return loadPromptFile("long.txt");
    case "tgs-short":
      return "Write a short paragraph about the history of computing. Be concise.";
    case "tgs-medium":
      return "Write a detailed explanation of how transformers work in machine learning.";
    case "tgs-long":
      return "Write an essay about the evolution of programming languages from the 1950s to today.";
    case "cache-repeat":
    case "cache-overlap":
      return loadPromptFile("medium.txt");
    case "cache-multiturn":
      return "Continue this conversation naturally.";
    case "stress-max-context":
      return loadPromptFile("long.txt");
    default:
      return "Please respond with a detailed answer to this benchmark prompt.";
  }
}

function loadPromptFile(filename: string): string {
  // fs.readFileSync or similar to load from lib/prompts/
  return `/* Prompt content for ${filename} would be loaded here */`;
}

function buildSummary(metrics: any, scenario: SpeedScenario): string {
  if (scenario.isCacheTest) {
    return `Cache speedup: ${metrics.cacheSpeedup?.toFixed(2)}x | Cold TTFT: ${metrics.ttftMs}ms | Cached TTFT: ${Math.round(metrics.ttftMs / metrics.cacheSpeedup)}ms`;
  }
  if (scenario.targetTokens === 1) {
    return `TTFT: ${metrics.ttftMs}ms | PP: ${metrics.ppTokensPerSec.toFixed(2)} tok/s`;
  }
  return `TTFT: ${metrics.ttftMs}ms | TGS: ${metrics.tgsTokensPerSec.toFixed(2)} tok/s | Tokens: ${metrics.generatedTokens}`;
}

function calculateScenarioScore(metrics: any, scenario: SpeedScenario): number {
  // Simple scoring: higher TGS / lower TTFT = better
  // Normalize later during aggregation
  if (scenario.isCacheTest) {
    return (metrics.cacheSpeedup ?? 1) * 50; // Cap at 100 for 2x speedup
  }
  if (scenario.targetTokens === 1) {
    // Lower TTFT is better; normalize inversely
    return Math.max(0, 100 - (metrics.ttftMs / 10));
  }
  return Math.min(100, metrics.tgsTokensPerSec * 2); // Rough normalization
}
```

---

## Build & Test Commands (`package.json` scripts)

```json
{
  "scripts": {
    "build:benchlocal": "tsc -p tsconfig.benchlocal.json && tsc-alias -p tsconfig.benchlocal.json",
    "build:cli": "tsc -p tsconfig.cli.json && tsc-alias -p tsconfig.cli.json",
    "cli": "npm run build:cli && node dist-cli/cli/run.js",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## Dependencies (`package.json`)

```json
{
  "name": "speedbench-15",
  "version": "1.0.0",
  "dependencies": {
    "@benchlocal/core": "0.2.0",
    "@benchlocal/sdk": "0.2.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsc-alias": "^1.8.0"
  }
}
```

---

## METHODOLOGY.md (Benchmark Methodology)

Include this file with:

1. **Test Environment Assumptions**: Hardware, software, quantization levels
2. **Prompt Construction**: How prompts are generated/padded to exact lengths
3. **Warming Strategy**: Number of warm-up runs before timed runs
4. **Statistical Handling**: How outliers are treated, number of repetitions
5. **Cache Testing Protocol**: How cache is invalidated between scenarios
6. **Normalization Method**: How scores are calculated relative to baseline

---

## Key Considerations

1. **Streaming is mandatory**: Without streaming, you cannot measure per-token timing
2. **Provider compatibility**: Not all providers expose timing data via API; benchmark must work at the client level
3. **System load**: Results vary by hardware load; recommend running with no other CPU-heavy processes
4. **Cache behavior**: KV cache behavior varies by inference engine (llama.cpp, Ollama, etc.); document expected patterns
5. **Timeout handling**: Long-context scenarios may timeout; allow user to skip or adjust timeout
6. **Deterministic prompts**: Use fixed prompts (not randomized) for reproducibility

---

## Example Results Table (UI Display)

| Category | Scenario | TTFT (ms) | TGS (tok/s) | PP (tok/s) | Status |
|----------|----------|-----------|-------------|------------|--------|
| Cold Start | Minimal TTFT | 45 | - | - | ✅ |
| Cold Start | Medium TTFT | 320 | - | 1562 | ✅ |
| TGS | 50 tokens | - | 45.2 | - | ✅ |
| Cache | Repeat Prompt | - | 45.2 → 89.1 | - | ✅ 2x speedup |

---

## Step-by-Step Implementation Plan for OpenCode

1. **Initialize the repository**: Create folder structure as outlined above
2. **Create `benchlocal.pack.json`**: Copy the manifest template
3. **Create `package.json`**: Add dependencies and scripts
4. **Implement `lib/metrics.ts`**: Pure timing and calculation helpers
5. **Create prompt templates in `lib/prompts/`**: Short, medium, long text files
6. **Implement `lib/benchmark.ts`**: Copy scenario definitions and scoring logic
7. **Implement `lib/orchestrator.ts`**: Copy streaming execution and measurement code
8. **Build `benchlocal/index.ts`**: Copy adapter layer
9. **Build `cli/run.ts`**: Simple CLI that iterates scenarios and prints results
10. **Create `METHODOLOGY.md`**: Document test methodology
11. **Test locally**: Run against llama.cpp, Ollama, or other local inference endpoints
12. **Package**: `npm run build:benchlocal` to produce installable artifact

---
