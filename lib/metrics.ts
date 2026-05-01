export interface TimingRecord {
  requestStart: number;
  firstTokenTime: number | null;
  tokenTimestamps: number[];
  completionTime: number;
}

export interface ComputedMetrics {
  ttftMs: number;
  tgsTokensPerSec: number;
  ppTokensPerSec: number;
  totalLatencyMs: number;
  generatedTokens: number;
}

export function computeMetrics(timing: TimingRecord, promptTokens: number): ComputedMetrics {
  const { requestStart, firstTokenTime, tokenTimestamps, completionTime } = timing;

  const ttftMs = firstTokenTime != null
    ? Math.round(firstTokenTime - requestStart)
    : Math.round(completionTime - requestStart);

  const generationTime = firstTokenTime != null
    ? completionTime - firstTokenTime
    : 0;

  const generatedTokens = tokenTimestamps.length;
  const tgsTokensPerSec = generationTime > 0
    ? generatedTokens / (generationTime / 1000)
    : 0;

  // Prompt processing speed: how fast the model ingested the prompt (tokens/sec)
  // Approximated as promptTokens / TTFT
  const ppTokensPerSec = ttftMs > 0
    ? promptTokens / (ttftMs / 1000)
    : 0;

  const totalLatencyMs = Math.round(completionTime - requestStart);

  return { ttftMs, tgsTokensPerSec, ppTokensPerSec, totalLatencyMs, generatedTokens };
}

export function computeCacheMetrics(
  coldMetrics: ComputedMetrics,
  warmMetrics: ComputedMetrics
): { cacheSpeedup: number; cacheHitRate: number } {
  const cacheSpeedup = coldMetrics.totalLatencyMs > 0
    ? coldMetrics.totalLatencyMs / warmMetrics.totalLatencyMs
    : 1;

  // Simplified hit rate: fraction of TTFT saved
  const cacheHitRate = coldMetrics.ttftMs > 0
    ? Math.max(0, 1 - warmMetrics.ttftMs / coldMetrics.ttftMs)
    : 0;

  return { cacheSpeedup, cacheHitRate };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
