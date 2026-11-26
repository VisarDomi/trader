# Arena optimization loop

Keep the TypeScript agent SDK easy to program against. Optimize the engine under it without changing
strategy source hashes, orders, accounting, history, leverage tiers or recorded-tick fidelity.

## Replay measurements (2026-10-26)

Before these optimizations the live process used 19.9% of one core over a 60-second sample, with 47.0% one-second maximum
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
| Baseline f36825e | 801.6 ms | 0.231 ms | identical |
| Optimized TypeScript | 522.4 ms | 0.146 ms | identical |
| Optimized TypeScript + Rust risk batch | 569.6 ms | 0.158 ms | identical |

Selected path: **35% less replay CPU, 37% lower p95 quote time**. Rust is about 9% slower than optimized
TypeScript including its language boundary, so it is **opt-in**. Single trials vary more; use repeated,
unprofiled trials. Full snapshot/trade/equity/log digest across all nine final trials:
`141fd5912267353d6a5d08081e709a4e4ab17804ad72ba891c47bef73d74bfec`.

What the optimized path does:

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

Repacking every position on every quote loses to JS, and sparse updates still pay the boundary cost.
Direct Float64Array mutation fails under the installed Bun (it passes under Node), so the module uses
Buffer views. Startup checks ABI and
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

An unpaced replay win alone does not carry over to the live process: with the default GC settings a
per-thread sample attributed 9.48 CPU seconds/minute to HeapHelper threads and 5.01 seconds to the main
thread, so heap marking, not the risk loop, dominated live CPU.

A separate paced workload restores the same 4,561-run snapshot, feeds 800 archived quotes with
25 ms sleeps, and performs four sets of persistence/dashboard reads. All configurations produced
the same full-state digest. Total measured CPU was 5,075.8 ms with the runtime default, 4,735.2 ms
with two GC markers, and 4,022.5 ms with one. Quote p95 was essentially unchanged (0.808/0.768/0.809 ms).
Final RSS was 251/298/372 MB respectively. One marker gives about 21% lower CPU in this workload,
trading about 120 MB RAM for less parallel heap scanning/cache contention.
The repeat one-marker JS trial used 4,302.2 ms and 371 MB; the paced native trial used 4,130.6 ms
and 361 MB, with worse quote p95 (0.879 ms). Those CPU differences are within trial variation;
there is still no demonstrated end-to-end Rust win over the selected JS path.

Only the arena receives BUN_JSC_numberOfGCMarkers=1, via the committed performance drop-in. The
shared slice/resource hold is untouched. Full engine/native tests pass under that configuration.
Watch RSS and event-loop latency. Removing that environment override and restarting the arena returns
to the runtime default.
[JavaScriptCore's options](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/OptionsList.h)
and [processor-dependent defaults](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/Options.cpp)
are the primary reference for the marker setting; the measurements above are specific to this app.

Live validation of one marker (two consecutive 60-second windows):

| Metric | Default GC markers | One marker, minute 1 | One marker, minute 2 |
|---|---:|---:|---:|
| Mean CPU, one core | 19.94% | 3.15% | 3.30% |
| One-second p95 CPU | 37.99% | 12.00% | 10.00% |
| One-second maximum CPU | 46.98% | 21.99% | 19.99% |
| Received quotes | 2,221 | 1,840 | 1,834 |
| Final RSS | 170 MB | 258 MB | 271 MB |

That is about **80–81% less CPU per received quote** in these short live samples. Event-loop p95 was
1 ms, no HeapHelper CPU threads remained, and account/recorder checks passed. This is evidence of the
live improvement, not a guarantee for every future bar burst. Watch the higher RSS as history grows.

## Read-path measurements (2026-11-25)

Commits `1f37459` and `a8b5178`. Single API requests froze the arena for up to 22.9 s; the dashboard
gives up on the arena after 15 s, so the iPhone app showed "Offline".

Cause: every evidence refresh ran `costTotals()`, which summed costs over all 1,112,224 rows of `trades`
(568 MB) with ten `json_extract()` calls per row. The arena is one Bun thread, so every request, quote and
candle poll waited behind that query. Agent screens added to it: one tap fetched each live run in full
(2,000 trades, equity curve, logs), one spark call per run, and both full leaderboards (3.3 MB + 2.2 MB) to
show one agent's rows; the agent list sent all 4,276 virtual runs to a screen that shows none.

What the read path does:

- `run_costs` holds one row of cost totals per run. `appendTrade`, `attachExecution` and `saveBacktest`
  update it in the same transaction; existing databases are backfilled once. `costTotals()` reads it.
  `api.test.ts` checks that it stays exact across new, replaced and measured trades and backtest archival.
- `/api/agents?runs=none` for lists, `/api/agent-bundle/*id` (one call, scoped to one agent, no equity
  curve, logs or source), batch `/sparks?ids=` on the inspector and `/api/broker?deals=0`. Run lists skip
  `:delay=` comparison runs in SQL.
- The dashboard's native loader uses these endpoints, with stale-while-revalidate caches cleared on every
  stage change.
- Daily clocks read a run's equity in one range scan, not one lookup per weekday. Backtest and Capital cash
  hold comparisons are cached. The arena fills its evidence caches once at startup; without that, the first
  agent-bundle request after a restart took 4.0 s.

Method: the live PC arena on loopback, `arena.db` 1.59 GB (13,358 runs). Query rows are timed with
Python `sqlite3` on a read-only connection to the live database: the old aggregate over `trades` before,
the `run_costs` join after. Endpoint rows are timed with Python `urllib`: single calls before (on the
code just before `1f37459`, 20:31–20:34 CET; a range is several such calls), three calls each after
`a8b5178` was deployed and had pre-warmed (21:46–21:47 CET), reported as the fastest with the first and the
mean in brackets. Stall rows are the arena's own per-handler maximum (`/api/execution` → `cpuParts`)
since process start: a 35-minute window before, about two minutes after a restart. Before times include waiting behind the frozen API, so the
endpoint ratios are larger than the cost of each request alone. The 804× is one query, not the whole app.

| Measurement | Before | After |
|---|---:|---:|
| `costTotals('backtest')`, 2,927 runs | 15,678.8 ms | 19.5 ms |
| Arena `api` longest single handler | 22,896 ms | 153 ms |
| Arena `quotes` / `candidates` longest call | 205 ms / 1,003 ms | 2 ms / 40 ms |
| iPhone Agents list (`/api/agents`, then `?runs=none`) | 252–396 ms, 4,730 KB | 2.7 ms (first 33.9, mean 13.3), 107 KB |
| Agent screen `visar-night/full-day-200` | 304–313 ms, + 5.5 MB leaderboards | 7.9 ms (14.1, 10.0), 25.6 KB |
| Agent screen `tsmom/20d` (11 markets) | 298–12,795 ms, + 5.5 MB leaderboards | 21.4 ms (30.7, 26.0) + 10.5 ms batch sparks |
| Backtest leaderboard | 5,719 ms | 74.6 ms (163.8, 109.9) |
| Capital demo leaderboard | 670.7 ms | 82.3 ms (122.3, 99.9) |
| Web `/agents` | 1,059 ms, 4.22 MB | 250 ms, 930 KB |
| Web `/agents/visar-night/full-day-200` | 323 ms | 39.5 ms |

`deploy-arena.sh` ran the backend suite before both deploys: 256 pass, and the 2 native tests skipped there
pass in the native build step.

## Reproduce and continue

Build, replay and profiling jobs run inside trader.slice. Respect any heavy-resource hold
(`~/.local/share/heavy-resources/user-pause.json`); optimization work does not resume held jobs.

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
