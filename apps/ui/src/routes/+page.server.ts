import { arena, ArenaUnavailable } from '$lib/server/arena';

export async function load({ url }) {
  const retired = url.searchParams.get('retired') === '1';
  const view = url.searchParams.get('view') ?? 'virtual';
  const scenario = url.searchParams.get('scenario') || 'standard';
  try {
    const [rows, scenarios] = await Promise.all([
      view === 'backtest' ? arena.leaderboard('backtest')
        : view === 'demo' ? arena.leaderboard('demo', true, 'demo')
        : arena.leaderboard('demo', retired, '', scenario),
      arena.scenarios(),
    ]);
    return { demo: view === 'virtual' || view === 'overfit' ? rows : [], backtest: view === 'backtest' ? rows : [],
      capital: view === 'demo' ? rows : [], scenarios, error: null };
  } catch (err) {
    return { demo: [], backtest: [], capital: [], scenarios: [], error: err instanceof ArenaUnavailable ? err.message : String(err) };
  }
}
