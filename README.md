# What

A repo that is a framework about trading agents and how they can backtest and also do actual plays in demo accounts and, one agent at a time, in a real account

# Why

It was easier to create a framework from scratch than to find a suitable framework and then suit it to my use-cases.

# How

Each agent is one TypeScript file in `apps/backend/agents/`. Agents are backtested on 1-minute candles
(2024 onwards) and then trade forward on live Capital.com **demo** prices, each instrument and leverage
(1:1 … 1:200) as its own run. Runs picked by hand are mirrored as real orders on nine demo accounts,
and one run at a time can trade a real USD account through a separate locked-down service on the
server ([Real account](apps/backend/ARCHITECTURE.md#real-account)). Claude
looks after the arena on scheduled visits: it retires agents that lose, adds new ones and keeps a journal.
The owner sets the visit schedule from the results: up to once a day when the last visit found bugs, down
to once a week after a quiet period.

# setup
[setup.md](./setup.md)
