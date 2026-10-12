# What

A repo that is a framework about trading agents and how they can backtest and also do actual plays in demo accounts

# Why

It was easier to create a framework from scratch than to find a suitable framework and then suit it to my use-cases.

# How

Each agent is one TypeScript file in `apps/backend/agents/`. Agents are backtested on 1-minute candles
(2024 onwards) and then trade forward on live Capital.com **demo** prices, each instrument and leverage
(1:1 … 1:200) as its own run; the best runs are mirrored as real orders on nine demo accounts. Claude
looks after the arena twice a week: it retires agents that lose, adds new ones and keeps a journal.
Dashboard: <https://trader.veron3.space>.

# setup
[setup.md](./setup.md)
