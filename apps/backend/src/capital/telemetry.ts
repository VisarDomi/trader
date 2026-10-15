/** Bounded, payload-only telemetry. No credentials, bodies, account IDs or deal IDs are retained. */
const WINDOW = 2048;
const TIMEOUT_MS = 30_000;
const samples: { ms: number; status: number }[] = [];
let requests = 0,
  sentBytes = 0,
  receivedBytes = 0,
  paceMs = 0,
  streamBytes = 0;
export function recordPace(ms: number): void {
  paceMs += ms;
}
export function recordStream(bytes: number): void {
  streamBytes += bytes;
}
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]! * 100) / 100;
}
export async function measuredFetch(url: string, init: RequestInit): Promise<Response> {
  const started = performance.now();
  requests++;
  sentBytes += new TextEncoder().encode(String(init.body ?? '')).byteLength;
  let status = 0;
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = response.status;
    const body = await response.text();
    receivedBytes += new TextEncoder().encode(body).byteLength;
    return new Response(body || null, {
      status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    samples.push({ ms: performance.now() - started, status });
    if (samples.length > WINDOW) samples.shift();
  }
}
export function networkStats() {
  return {
    requests,
    sentPayloadBytes: sentBytes,
    receivedPayloadBytes: receivedBytes,
    streamPayloadBytes: streamBytes,
    paceWaitMs: Math.round(paceMs),
    sampleSize: samples.length,
    requestP50Ms: percentile(
      samples.map(s => s.ms),
      0.5,
    ),
    requestP95Ms: percentile(
      samples.map(s => s.ms),
      0.95,
    ),
    errorsInWindow: samples.filter(s => s.status === 0 || s.status >= 400).length,
  };
}
