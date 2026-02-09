import type { Fill } from '../core/agent/types.ts';
import type { EquityPoint } from '../core/agent/AgentRunner.ts';
import type { Metrics } from '../core/metrics/MetricsEngine.ts';
import { sql } from './db.ts';

export interface RunRecord {
  id: string;
  agentId: string;
  agentName: string;
  mode: string;
  status: string;
  capital: number;
  instrument: string;
  config: Record<string, unknown>;
  startedAt: number | null;
  completedAt: number | null;
  metrics: Metrics | null;
}

export class RunRepository {
  static async createRun(run: Omit<RunRecord, 'completedAt' | 'metrics'>): Promise<void> {
    await sql`
      INSERT INTO runs (id, agent_id, agent_name, mode, status, capital, instrument, config, started_at)
      VALUES (${run.id}, ${run.agentId}, ${run.agentName}, ${run.mode}, ${run.status},
              ${run.capital}, ${run.instrument}, ${JSON.stringify(run.config)}, ${run.startedAt})
    `;
  }

  static async completeRun(runId: string, metrics: Metrics): Promise<void> {
    await sql`
      UPDATE runs
      SET status = 'completed',
          completed_at = ${Date.now()},
          metrics = ${JSON.stringify(metrics)}
      WHERE id = ${runId}
    `;
  }

  static async failRun(runId: string, error: string): Promise<void> {
    await sql`
      UPDATE runs
      SET status = 'error',
          completed_at = ${Date.now()},
          metrics = ${JSON.stringify({ error })}
      WHERE id = ${runId}
    `;
  }

  static async saveFills(runId: string, fills: Fill[]): Promise<void> {
    if (fills.length === 0) return;

    const values = fills.map(f => ({
      run_id: runId,
      action: f.action,
      reason: f.reason,
      side: f.side,
      size: f.size,
      price: f.price,
      pnl: f.pnl ?? null,
      timestamp: f.timestamp,
    }));

    for (let i = 0; i < values.length; i += 500) {
      const batch = values.slice(i, i + 500);
      await sql`INSERT INTO fills ${sql(batch)}`;
    }
  }

  static async saveEquityCurve(runId: string, curve: EquityPoint[]): Promise<void> {
    if (curve.length === 0) return;

    const values = curve.map(p => ({
      run_id: runId,
      timestamp: p.timestamp,
      equity: p.equity,
      balance: p.balance,
    }));

    for (let i = 0; i < values.length; i += 500) {
      const batch = values.slice(i, i + 500);
      await sql`
        INSERT INTO equity_snapshots ${sql(batch)}
        ON CONFLICT (run_id, timestamp) DO NOTHING
      `;
    }
  }

  static async getRun(runId: string): Promise<RunRecord | null> {
    const rows = await sql`SELECT * FROM runs WHERE id = ${runId}`;
    if (rows.length === 0) return null;

    const row = rows[0]!;
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      agentName: row.agent_name as string,
      mode: row.mode as string,
      status: row.status as string,
      capital: Number(row.capital),
      instrument: row.instrument as string,
      config: row.config as Record<string, unknown>,
      startedAt: row.started_at ? Number(row.started_at) : null,
      completedAt: row.completed_at ? Number(row.completed_at) : null,
      metrics: row.metrics as Metrics | null,
    };
  }

  static async listRuns(filters?: {
    mode?: string;
    status?: string;
    agentId?: string;
  }): Promise<RunRecord[]> {
    let query = sql`SELECT * FROM runs WHERE 1=1`;

    // Build filtered query
    if (filters?.mode && filters?.status && filters?.agentId) {
      query = sql`SELECT * FROM runs WHERE mode = ${filters.mode} AND status = ${filters.status} AND agent_id = ${filters.agentId} ORDER BY started_at DESC`;
    } else if (filters?.mode && filters?.status) {
      query = sql`SELECT * FROM runs WHERE mode = ${filters.mode} AND status = ${filters.status} ORDER BY started_at DESC`;
    } else if (filters?.mode) {
      query = sql`SELECT * FROM runs WHERE mode = ${filters.mode} ORDER BY started_at DESC`;
    } else if (filters?.status) {
      query = sql`SELECT * FROM runs WHERE status = ${filters.status} ORDER BY started_at DESC`;
    } else if (filters?.agentId) {
      query = sql`SELECT * FROM runs WHERE agent_id = ${filters.agentId} ORDER BY started_at DESC`;
    } else {
      query = sql`SELECT * FROM runs ORDER BY started_at DESC`;
    }

    const rows = await query;
    return rows.map(row => this.mapRow(row));
  }

  static async getFills(runId: string): Promise<Fill[]> {
    const rows = await sql`
      SELECT action, reason, side, size, price, pnl, timestamp
      FROM fills
      WHERE run_id = ${runId}
      ORDER BY timestamp ASC
    `;

    return rows.map(row => ({
      action: row.action as Fill['action'],
      reason: row.reason as Fill['reason'],
      side: row.side as Fill['side'],
      size: Number(row.size),
      price: Number(row.price),
      pnl: row.pnl !== null ? Number(row.pnl) : undefined,
      timestamp: Number(row.timestamp),
    }));
  }

  static async getEquityCurve(runId: string): Promise<EquityPoint[]> {
    const rows = await sql`
      SELECT timestamp, equity, balance
      FROM equity_snapshots
      WHERE run_id = ${runId}
      ORDER BY timestamp ASC
    `;

    return rows.map(row => ({
      timestamp: Number(row.timestamp),
      equity: Number(row.equity),
      balance: Number(row.balance),
    }));
  }

  static async getLeaderboard(sortBy: string = 'totalReturn'): Promise<RunRecord[]> {
    // Only completed runs with metrics
    const rows = await sql`
      SELECT * FROM runs
      WHERE status = 'completed' AND metrics IS NOT NULL
      ORDER BY started_at DESC
    `;

    const records = rows.map(row => this.mapRow(row));

    // Sort by the requested metric (descending = best first)
    const metricKey = sortBy as keyof Metrics;
    records.sort((a, b) => {
      const aVal = a.metrics?.[metricKey] ?? 0;
      const bVal = b.metrics?.[metricKey] ?? 0;
      // For maxDrawdown and averageLoss, lower is better — but we still sort descending
      // and let the consumer interpret. Leaderboard default = totalReturn descending.
      return (bVal as number) - (aVal as number);
    });

    return records;
  }

  private static mapRow(row: Record<string, unknown>): RunRecord {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      agentName: row.agent_name as string,
      mode: row.mode as string,
      status: row.status as string,
      capital: Number(row.capital),
      instrument: row.instrument as string,
      config: row.config as Record<string, unknown>,
      startedAt: row.started_at ? Number(row.started_at) : null,
      completedAt: row.completed_at ? Number(row.completed_at) : null,
      metrics: row.metrics as Metrics | null,
    };
  }
}
