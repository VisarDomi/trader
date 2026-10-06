# Development workflow

Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md). Writing agents: [`agents/GUIDE.md`](agents/GUIDE.md).

## Git

Feature branches from `main`, merged back with `--ff-only` when green. Pushing
`main` deploys the dashboard (veron3 watcher); the arena is deployed explicitly
with `ops/server/deploy-arena.sh` so a dashboard tweak never restarts live runs.

Commit messages: `type(scope): description`, types `feat fix refactor docs test chore`,
scopes `sdk engine lab arena agents ui forecaster ops`.

## Everyday commands (from `apps/backend`)

```bash
bun test                                   # engine tests
bun run typecheck
bun run check-agent agents/my-agent.ts     # quick sanity check (seconds)
bun run backtest my-agent                  # full backtest, pushes to the arena
bun run backtest --epic US100,GOLD --force # re-run selected instruments
bun run forecasts                          # TimesFM tables for forecast agents (GPU)
bun run ingest                             # refresh 1-minute candles (resumable)
```

Run heavy jobs inside the lab's resource cap:

```bash
systemd-run --user --slice=trader.slice --wait --pipe -p WorkingDirectory=$PWD -E PATH=$PATH bun run backtest
```

## Adding an agent end to end

1. `cp agents/_template.ts agents/my-idea.ts`, edit (see GUIDE.md).
2. `bun run check-agent agents/my-idea.ts` until it passes.
3. If it declares `forecast`, run `bun run forecasts` first.
4. `bun run backtest my-idea` — look at the backtest, but do not tune it to death.
5. Commit, then `ops/server/deploy-arena.sh`. The arena warms the agent up on
   history and starts its demo record on the next bar.
6. Judge it on the demo leaderboard after enough trades.

Editing a deployed agent's file restarts its demo record (new code hash). To try
a variation without losing a record, create a new file or add a variant.

## Environment

`apps/backend/.env` (see `.env.template`): Capital.com demo login, `ARENA_URL`,
`ARENA_TOKEN`, `FORECASTER_URL`, and `PG_*` variables for the lab PostgreSQL.
