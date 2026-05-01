# SpeedBench-15

A [BenchLocal](https://github.com/stevibe/BenchLocal) Bench Pack for measuring local LLM inference performance across 15 scenarios.

## What it measures

| Metric | Description |
|--------|-------------|
| **TTFT** | Time to first token (ms) |
| **TGS** | Token generation speed (tokens/sec) |
| **PP** | Prompt processing speed (tokens/sec) |
| **Cache Speedup** | KV cache effectiveness ratio |

## Scenarios (15 total)

| # | Category | Scenario | Key Metric |
|---|----------|----------|------------|
| 1A | Cold Start & TTFT | Minimal Prompt (~5 tok) | TTFT |
| 1B | Cold Start & TTFT | Medium Prompt (~500 tok) | TTFT |
| 1C | Cold Start & TTFT | Long Context (~4000 tok) | TTFT |
| 2A | Token Generation Speed | 50 tokens | TGS |
| 2B | Token Generation Speed | 200 tokens | TGS |
| 2C | Token Generation Speed | 500 tokens | TGS |
| 3A | Prompt Processing | ~100 tok prompt | PP |
| 3B | Prompt Processing | ~1000 tok prompt | PP |
| 3C | Prompt Processing | ~4000 tok prompt | PP |
| 4A | KV Cache | Repeat prompt (1000 tok) | Speedup |
| 4B | KV Cache | Overlapping prompts (1500 tok) | Speedup |
| 4C | KV Cache | Multi-turn conversation | Speedup |
| 5A | Stress | Maximum context window | TGS |
| 5B | Stress | Rapid short outputs | TGS |
| 5C | Stress | Mixed workload | TGS |

## Usage

### Via BenchLocal

Import this pack into BenchLocal using the archive URL published automatically on every release:

```
https://github.com/madcato/SpeedBench-15/releases/latest/download/speedbench-15.tar.gz
```

**Steps:**

1. Open BenchLocal and go to **Packs → Import Pack**.
2. Select **From URL** and paste the URL above.
3. BenchLocal will download and install the pack automatically.
4. Select **SpeedBench-15** from the pack list and run your benchmark.

### CLI (local testing)

```bash
# Against Ollama (default: http://localhost:11434/v1)
BENCH_MODEL=llama3 npm run cli

# Against a custom OpenAI-compatible endpoint
OPENAI_BASE_URL=http://localhost:8080/v1 BENCH_MODEL=mistral npm run cli

# Run specific scenarios only
BENCH_MODEL=llama3 npm run cli ttft-minimal tgs-short cache-repeat
```

### Build

```bash
npm install
npm run build:benchlocal   # produces dist/ for BenchLocal
npm run build:cli          # produces dist-cli/ for local testing
npm run typecheck          # type-check without emitting
```

## Requirements

- Node.js 18+
- An OpenAI-compatible inference endpoint (Ollama, llama.cpp server, vLLM, LM Studio, etc.)
- Streaming support enabled on the endpoint (`stream: true`)

## Scoring

Scores are normalized 0–100 per scenario, averaged by category, then averaged across categories. See [METHODOLOGY.md](METHODOLOGY.md) for full details.

## License

MIT
