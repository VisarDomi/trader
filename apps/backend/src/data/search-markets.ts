/**
 * Search Capital.com markets by name.
 *
 * Usage: bun run search-markets <query>
 * Example: bun run search-markets bitcoin
 */

import { CapitalSession } from '../providers/capital/CapitalSession.ts';

const query = process.argv[2];

if (!query) {
  console.error('Usage: bun run search-markets <query>');
  console.error('Example: bun run search-markets bitcoin');
  process.exit(1);
}

const apiKey = process.env.CAPITAL_API_KEY;
const identifier = process.env.CAPITAL_IDENTIFIER;
const password = process.env.CAPITAL_PASSWORD;

if (!apiKey || !identifier || !password) {
  throw new Error('Missing Capital.com credentials in .env');
}

const session = new CapitalSession({
  apiKey,
  identifier,
  password,
  isDemo: false,
});

await session.connect();

interface Market {
  epic: string;
  instrumentName: string;
  instrumentType: string;
  bid: number;
  ofr: number;
  expiry: string;
}

const data = await session.get<{ markets: Market[] }>(
  `/api/v1/markets?searchTerm=${encodeURIComponent(query)}`
);

await session.destroy();

if (data.markets.length === 0) {
  console.log(`No markets found for "${query}".`);
  process.exit(0);
}

// Print results
const cols = { epic: 20, name: 40, type: 16, bid: 12, ask: 12 };
const pad = (s: string, w: number) => s.padEnd(w);
const padL = (s: string, w: number) => s.padStart(w);

console.log(`\n  ${data.markets.length} result(s) for "${query}"\n`);
console.log(
  '  ' +
  pad('EPIC', cols.epic) +
  pad('Name', cols.name) +
  pad('Type', cols.type) +
  padL('Bid', cols.bid) +
  padL('Ask', cols.ask)
);
console.log('  ' + '-'.repeat(cols.epic + cols.name + cols.type + cols.bid + cols.ask));

for (const m of data.markets) {
  console.log(
    '  ' +
    pad(m.epic, cols.epic) +
    pad(m.instrumentName.slice(0, cols.name - 2), cols.name) +
    pad(m.instrumentType, cols.type) +
    padL(m.bid?.toString() ?? '-', cols.bid) +
    padL(m.ofr?.toString() ?? '-', cols.ask)
  );
}

console.log('');
