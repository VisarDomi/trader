# Arena optimization loop

Keep the TypeScript agent SDK easy to program against. Optimize the engine under it without changing
strategy source hashes, orders, accounting, history, leverage tiers or recorded-tick fidelity.

## October 26 measurements

The original live process used 19.9% of one core over a 60-second sample, with 47.0% one-second maximum
and 38.0% p95, receiving 2,221 quotes. A separate 40-second perf sample attributed 54% of sampled cycles
to JavaScriptCore HeapHelper threads. Hardware counters also showed substantial cache misses. This
identifies heap work as a target, not proof that all future bursts have one cause.

Fixed workload: an offline snapshot of all 4,561 production runs, real restored positions, 4,794 archived
quotes across 20 instruments, three trials per backend. Trials freeze the snapshot clock and shift the
same two-minute tape after it, preserving source/arrival offsets. This compares workloads; it does not
reconstruct accounts at the original tape date. Forecasts, Capital requests and broker orders are
disabled. Quotes are decoded in memory from the canonical compressed archive, without raw tick files.

| Backend | Median tick CPU | Median per-quote p95 | Result digest |
|---|---:|---:|---|
| Original 69433f2 | 801.6 ms | 0.231 ms | identical |
| Optimized TypeScript | 522.4 ms | 0.146 ms | identical |
| Optimized TypeScript + Rust risk batch | 569.6 ms | 0.158 ms | identical |

Selected path: **35% less replay CPU, 37% lower p95 quote time**. Rust is about 9% slower than optimized
TypeScript including its language boundary, so it remains **opt-in**. Earlier single trials varied more;
use repeated, unprofiled trials. Full snapshot/trade/equity/log digest across all nine final trials:
`141fd5912267353d6a5d08081e709a4e4ab17804ad72ba891c47bef73d74bfec`.

Production changes:

- Mark one instrument dirty per quote; defer run-ID lookups to the persistence pass.
- Skip empty order queues before consulting rules/clocks.
- Dispatch tick callbacks only to agents that declare them. All runs still receive every tick's
  account/risk checks; bar and recording cadence are unchanged.
- Compute stop prices without allocating an object per open position/tick.
- Cache the pure funding-day result for the exact timestamp shared by runs on the same quote.

Results are unchanged, so historical cache/engine-version gates remain valid. Do not reset forward
records for a performance-only change.

## Rust implementation and research

`native/` is a Cargo-locked Node-API module. It ports long/short mark-to-market, peak/drawdown,
fixed/trailing stop priority, profit targets, margin checks and trailing anchors. It owns no accounts,
broker sessions, files, timers or threads. Funding transitions, pending commands, scheduled/session
exits, callbacks, validation and persistence retain the reference implementation.

Reusable instrument-local contiguous buffers use 88 input bytes and 32 output bytes per slot: roughly
24 KB for 200 runs, close to this CPU's 32 KB L1 data cache. Changed positions refresh slots; steady
ticks update numeric slots in Rust. One synchronous call per instrument; no per-position JSON/IPC,
allocation, locks or worker scheduling. Small batches keep JS. Cache-line padding would enlarge rows;
do not apply it without measuring the tradeoff.

The first prototype repacked every position on every quote and lost to JS. Sparse updates improved
it but did not eliminate boundary cost. Direct Float64Array mutation failed under the installed Bun
while passing under Node; Buffer views fixed that measured incompatibility. Startup checks ABI and
actual mutation with a canary. The boundary refuses empty/oversized/short/overlapping/misaligned
buffers. The engine supplies private, non-shared ArrayBuffers, borrowed only during the synchronous
call, with no JS re-entry. Differential tests cover callbacks, funding, DST, pending orders, restore,
removal and protections, comparing full engine results.

Release uses opt-level 3, thin LTO, one codegen unit, generic CPU compatibility and profiling line
tables. No fast-math, FMA relaxation, hand-written SIMD, unchecked indexing, CPU-specific instructions,
Rayon, huge pages or alternative allocator is enabled without evidence. Float operation reordering
can change a stop or liquidation; isolated kernel throughput is insufficient.

Primary references:

- [Bun Node-API](https://bun.com/docs/runtime/node-api) and
  [FFI guidance](https://bun.com/docs/runtime/ffi): prefer Node-API; FFI remains experimental.
- [NAPI-RS buffer/typed-array lifetimes](https://napi.rs/docs/concepts/typed-array): synchronous views
  avoid serialization but require ownership, aliasing and synchronization discipline.
- [Rust Performance Book: allocations](https://nnethercote.github.io/perf-book/heap-allocations.html)
  and [type sizes](https://nnethercote.github.io/perf-book/type-sizes.html): reduce allocation and memory
  traffic; keep hot data small; measure before adding indirection or alignment.
- [Cargo profiles](https://doc.rust-lang.org/cargo/reference/profiles.html): optimization and LTO are
  measured choices; higher optimization levels are not universally faster.

## Live heap work

The first post-deploy live minute did not reproduce the unpaced replay improvement: 24.1% of one
core versus the earlier 19.9%, at slightly different quote rates. A subsequent per-thread sample
attributed 9.48 CPU seconds/minute to HeapHelper threads and 5.01 seconds to the main thread. This
is why an isolated replay win alone was insufficient to close the live CPU investigation.

A separate paced workload restores the same 4,561-run snapshot, feeds 800 archived quotes with
25 ms sleeps, and performs four sets of persistence/dashboard reads. All configurations produced
the same full-state digest. Total measured CPU was 5,075.8 ms with the runtime default, 4,735.2 ms
with two GC markers, and 4,022.5 ms with one. Quote p95 was essentially unchanged (0.808/0.768/0.809 ms).
Final RSS was 251/298/372 MB respectively. One marker was selected for a live trial: about 21% lower
CPU in this workload, trading about 120 MB RAM for less parallel heap scanning/cache contention.
The repeat one-marker JS trial used 4,302.2 ms and 371 MB; the paced native trial used 4,130.6 ms
and 361 MB, with worse quote p95 (0.879 ms). Those CPU differences are within trial variation;
there is still no demonstrated end-to-end Rust win over the selected JS path.

Only the arena receives BUN_JSC_numberOfGCMarkers=1, via the committed performance drop-in. The
shared slice/resource hold is untouched. Full engine/native tests pass under that configuration.
Watch RSS and event-loop latency; the replay result does not replace a post-change live sample.
The flag can be reverted by removing only that environment override and restarting the arena.
[JavaScriptCore's options](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/OptionsList.h)
and [processor-dependent defaults](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/Options.cpp)
are the primary reference for the marker setting; the measurements above are specific to this app.

Post-change live validation (two consecutive 60-second windows):

| Metric | Original live sample | One marker, minute 1 | One marker, minute 2 |
|---|---:|---:|---:|
| Mean CPU, one core | 19.94% | 3.15% | 3.30% |
| One-second p95 CPU | 37.99% | 12.00% | 10.00% |
| One-second maximum CPU | 46.98% | 21.99% | 19.99% |
| Received quotes | 2,221 | 1,840 | 1,834 |
| Final RSS | 170 MB | 258 MB | 271 MB |

That is about **80–81% less CPU per received quote** in these short live samples. Event-loop p95 was
1 ms, no HeapHelper CPU threads remained, and account/recorder checks passed. This is evidence of the
live improvement, not a guarantee for every future bar burst. Watch the higher RSS as history grows.

## Reproduce and continue

Build, replay and profiling jobs run inside trader.slice. The October 26 request authorizes scoped
optimization work; the model/nightly resource hold stays active. This does not resume unrelated jobs
or admission backtests.

1. Sample live CPU, quote counts, queue health and event-loop latency, including normal minutes and
   bar boundaries. CPU percent refers to one core, not the whole PC.
2. Make a consistent temporary SQLite snapshot (`sqlite3 live.db '.backup /private/snapshot.db'`).
   Choose an archived window of at most five minutes. Do not export raw tick history.
3. Run `bun run build-native`, `bun run test-native`, then alternate repeated trials:

   ```sh
   TRADER_RISK_BACKEND=js bun run benchmark-ticks --snapshot /private/snapshot.db --from EPOCH_MS --end EPOCH_MS
   TRADER_RISK_BACKEND=native bun run benchmark-ticks --snapshot /private/snapshot.db --from EPOCH_MS --end EPOCH_MS
   ```

   To include paced delivery, persistence and real dashboard read handlers, add
   `--pace-ms 25 --limit 800 --dashboard-every 200`. Compare GC settings in separate processes using
   `BUN_JSC_numberOfGCMarkers=1` (or `2`); omit it for the runtime default. The temporary HTTP server
   binds only loopback on an ephemeral port and closes in finally. It never contacts the broker.

   Require matching digests; separate profiling from timed trials. Working DB copies are cleaned in
   finally. Delete the input snapshot after comparison.
4. Typecheck/test and deploy through ops/server/deploy-arena.sh. It builds/checks the optional native
   artifact from committed sources before upload. Default is JS; TRADER_RISK_BACKEND=native requires
   the artifact and canary. Execution status reports the actual riskBackend.
5. Confirm run IDs, hashes, assignments and recording journal survive, quantify the restart gap, and
   compare CPU normalized by quote rate. Repeat if activity differs materially. Record losses too.

Next Rust candidate: own dense account/position state and scan it without visiting JS objects every
tick, returning sparse fills/stop events. Preserve TypeScript strategy callbacks at the SDK boundary.
Build a differential stream runner before expanding that port; include state transfer, exceptional
paths, restart recovery, memory and whole-process CPU. Profiles should decide whether that larger
port, persistence, or API/GC work deserves the next iteration.
