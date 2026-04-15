# Trader Backend

Agent runner framework for automated trading against Capital.com.

## Read on demand

- `DESIGN.md`
- `WORKFLOW.md`
- `DECISIONS.md`
- No-magic-strings rule:
  `~/Documents/memory/no-magic-strings.md`

## Rules

- Default to Bun instead of Node.js.
- Prefer `Bun.serve()`, `Bun.sql`, built-in `WebSocket`, and `Bun.file` where they fit.
- Log notable backend changes in `CHANGELOG.md` under `## Unreleased` before considering the task done.
