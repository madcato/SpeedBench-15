# SpeedBench-15 Methodology

## 1. Test Environment Assumptions

- **Hardware**: Results will vary by CPU/GPU type, VRAM capacity, and system RAM. Always report hardware specs alongside benchmark results.
- **Software**: Inference engine version (llama.cpp, Ollama, vLLM, etc.) and model quantization level (F16, Q8_0, Q4_K_M, etc.) must be documented.
- **System load**: Benchmark should be run with no other CPU- or GPU-heavy processes active. Close background applications that compete for memory bandwidth.
- **Thermal state**: Allow the system to reach thermal equilibrium before starting. On laptops, plug in to prevent thermal throttling.

## 2. Prompt Construction

Prompts are drawn from fixed files in `lib/prompts/` to ensure reproducibility across runs and environments:

| File | Target length | Purpose |
|------|--------------|---------|
| `short.txt` | ~5 tokens | Minimal cold-start baseline |
| `medium.txt` | ~500 tokens | Standard TTFT and cache tests |
| `long.txt` | ~4000 tokens | Long-context and stress tests |
| `conversation.json` | ~2000 tokens total | Multi-turn KV cache test |

Prompts are **not randomized**. Using fixed prompts ensures that differences in results reflect model/hardware performance rather than prompt variance.

## 3. Warming Strategy

- **Category 1–3 and 5**: Single cold run per scenario. No explicit warm-up. The cold-start behavior is itself the metric for TTFT scenarios.
- **Category 4 (KV Cache)**: Two runs per scenario:
  1. **Cold run**: Populates the KV cache.
  2. **Warm run**: Measured with the cache populated.
  
  The speedup ratio is `cold_total_latency / warm_total_latency`. A ratio of 1.0 indicates no cache benefit; 2.0 indicates the cached run was twice as fast.

## 4. Statistical Handling

- **Single repetition by default**: Each scenario runs once to keep total benchmark time reasonable (typically under 10 minutes for a mid-size local model).
- **Outlier handling**: No outlier removal is applied in the default configuration. Users running repeated trials should inspect the raw log for anomalies (e.g., a first run that is anomalously slow due to model loading).
- **Timing precision**: All timers use `performance.now()` (sub-millisecond resolution). Network overhead is included in TTFT because it is present in real inference usage.

## 5. Cache Testing Protocol

Cache scenarios assume the inference engine maintains a KV cache between requests within the same process session. Behavior depends on the engine:

- **Ollama / llama.cpp**: Cache is maintained in-process between requests to the same model. No explicit cache eviction API is called; the benchmark relies on natural cache reuse.
- **vLLM / TGI**: These engines have their own caching strategies. Results reflect whatever caching the engine applies.

Between cache and non-cache scenarios, no explicit cache flush is attempted (such an API does not exist universally). Instead, scenarios are designed so that non-cache scenarios use different prompts, minimizing unintended cache hits.

## 6. Normalization and Scoring

Each scenario produces a raw score on a 0–100 scale according to these rules:

| Metric | Higher is better | Formula |
|--------|-----------------|---------|
| TTFT (ms) | Lower is better | `max(0, 100 - ttft_ms / 10)` |
| TGS (tok/s) | Higher is better | `min(100, tgs * 2)` |
| Cache speedup | Higher is better | `min(100, speedup * 50)` |

Category scores are the unweighted average of the three scenario scores within each category. The overall score is the unweighted average of the five category scores.

These normalization constants are calibrated for typical consumer-grade GPU inference (15–50 tok/s TGS, 100–1000ms TTFT). Results above the normalization ceiling will saturate at 100; this is expected for high-end hardware.

## 7. Metric Definitions

| Metric | Definition | Unit |
|--------|-----------|------|
| TTFT | `first_token_time − request_start` | ms |
| TGS | `generated_tokens / (completion_time − first_token_time)` | tokens/s |
| PP | `prompt_tokens / (ttft_ms / 1000)` | tokens/s |
| Total Latency | `completion_time − request_start` | ms |
| Cache Speedup | `cold_total_latency / warm_total_latency` | ratio |
| Cache Hit Rate | `1 − (warm_ttft / cold_ttft)` | 0–1 |

Token counts for TGS use the number of streaming chunks received, which approximates (but may not exactly equal) the model's internal token count due to tokenizer differences.
