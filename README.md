# Trader

A test bench for trading strategies on live Capital.com prices.

Each agent is one TypeScript file in `apps/backend/agents/`. Agents are backtested on 1-minute candles
(2024 onwards) and then trade forward on live Capital.com **demo** prices, each instrument and leverage
(1:1 … 1:200) as its own run. Runs picked by hand are mirrored as real orders on nine demo accounts,
and one run at a time can trade a real USD account through a separate locked-down service on the
server ([Real account](apps/backend/ARCHITECTURE.md#real-account)). Claude
looks after the arena on scheduled visits: it retires agents that lose, adds new ones and keeps a journal.
The owner sets the visit schedule from the results: up to once a day when the last visit found bugs, down
to once a week after a quiet period.

What makes it hard:

- One tick engine runs the backtests and the live runs, with bid and ask prices and the broker's
  costs. Two backtests of one strategy give identical trades ([ARCHITECTURE.md](apps/backend/ARCHITECTURE.md)).
- Each demo trade has a virtual twin from the same decision. Every day the system compares them, and a
  gap of more than one spread is a bug until a check proves otherwise ([LIFECYCLE.md](apps/backend/agents/LIFECYCLE.md)).
- A strategy is judged by statistics, not by its return: its t-statistic must beat every random
  strategy on the same market ([policy.ts](apps/backend/src/engine/policy.ts)).
- Performance work is measured: a Rust port lost to optimized TypeScript, and a per-run cost table cut
  one query from 15.7 s to 19.5 ms ([PERFORMANCE.md](apps/backend/PERFORMANCE.md)).

# setup
[setup.md](./setup.md)
