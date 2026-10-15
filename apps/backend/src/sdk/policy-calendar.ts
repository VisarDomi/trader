/** Scheduled decision dates, checked against the issuing central banks on 2026-10-15. */
export const POLICY_EVENT = { FOMC: 'FOMC', BOJ: 'BOJ' } as const;
export type PolicyEvent = typeof POLICY_EVENT[keyof typeof POLICY_EVENT];
export const POLICY_CALENDAR = {
  from: '2024-01-01', through: '2027-12-31', checkedAt: '2026-10-15',
  fomcSource: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
  bojSources: [
    'https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref230728a.pdf',
    'https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref240731a.pdf',
    'https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref250731a.pdf',
    'https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref260731a.pdf',
  ],
} as const;

// Decision day only, not the first meeting day, minutes release or economic projections release.
// FOMC dates use New York; BOJ dates use Japan's meeting-date label.
const FOMC = new Set([
  '2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18',
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08',
]);
const BOJ = new Set([
  '2024-01-23', '2024-03-19', '2024-04-26', '2024-06-14', '2024-07-31', '2024-09-20', '2024-10-31', '2024-12-19',
  '2025-01-24', '2025-03-19', '2025-05-01', '2025-06-17', '2025-07-31', '2025-09-19', '2025-10-30', '2025-12-19',
  '2026-01-23', '2026-03-19', '2026-04-28', '2026-06-16', '2026-07-31', '2026-09-18', '2026-10-30', '2026-12-18',
  '2027-01-22', '2027-03-18', '2027-04-28', '2027-06-11', '2027-07-22', '2027-09-22', '2027-10-29', '2027-12-17',
]);

/** Empty events outside coverage must not be mistaken for a verified quiet day. */
export function policyCalendarCovers(date: string): boolean {
  return date >= POLICY_CALENDAR.from && date <= POLICY_CALENDAR.through;
}

export function policyEventsOn(date: string): PolicyEvent[] {
  const events: PolicyEvent[] = [];
  if (FOMC.has(date)) events.push(POLICY_EVENT.FOMC);
  if (BOJ.has(date)) events.push(POLICY_EVENT.BOJ);
  return events;
}
