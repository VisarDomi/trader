# Trader Backend

Agent runner framework for automated trading against Capital.com.

## Architecture

See `DESIGN.md` for full architecture and all design decisions.
See `WORKFLOW.md` for git strategy and development workflow.
See `DECISIONS.md` for API limits, constraints, and design rationale.

- Agent contract types: `src/core/agent/types.ts`
- Agents are `.ts` files dropped in `agents/`
- Example agent: `agents/.example/ema-crossover.ts`

## Bun

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## Bun APIs

- `Bun.serve()` for HTTP + WebSocket server. Don't use `express`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile.

## Testing

```ts
import { test, expect } from "bun:test";

test("example", () => {
  expect(1).toBe(1);
});
```

## Changelog & Commits

- Every bugfix, feature, or notable improvement must be logged in `CHANGELOG.md` under the `## Unreleased` section before the task is considered done.
- Each changelog entry must include the **decision rationale** — explain *why* this approach was chosen, what alternatives were considered, and what tradeoffs were made. Not just what changed, but why.
- After finishing a task, commit the changes. The commit message should match what's written in the changelog for that task.

## Key commands

```bash
bun run dev          # start with hot reload
bun run start        # production start
bun test             # run tests
bun run db:migrate   # run database migrations
bun run ingest       # ingest historical price data
```
