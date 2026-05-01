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

export interface BenchmarkScore {
  totalScore: number;
  categories: Array<{ id: string; label: string; score: number }>;
  summary: string;
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
    const catResults = results.filter(r => r.category === cat);
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
  const avg = results.reduce((sum, r) => sum + (r.score ?? 0), 0) / results.length;
  return avg;
}
