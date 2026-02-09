# Trader Backend

Agent runner framework for automated trading against Capital.com.

## Architecture

See `DESIGN.md` for full architecture and all design decisions.
See `WORKFLOW.md` for git strategy and development workflow.

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

## Key commands

```bash
bun run dev          # start with hot reload
bun run start        # production start
bun test             # run tests
bun run db:migrate   # run database migrations
bun run ingest       # ingest historical price data
```
