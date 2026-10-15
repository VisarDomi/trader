import { expect, test } from 'bun:test';
import { POLICY_CALENDAR, POLICY_EVENT, policyCalendarCovers, policyEventsOn } from './policy-calendar.ts';

test('official policy-decision calendars include overlapping meetings and the published 2027 schedule', () => {
  expect(policyEventsOn('2024-07-31')).toEqual([POLICY_EVENT.FOMC, POLICY_EVENT.BOJ]);
  expect(policyEventsOn('2026-01-23')).toEqual([POLICY_EVENT.BOJ]);
  expect(policyEventsOn('2027-12-08')).toEqual([POLICY_EVENT.FOMC]);
  expect(policyEventsOn('2027-12-17')).toEqual([POLICY_EVENT.BOJ]);
  expect(policyEventsOn('2026-01-22')).toEqual([]); // First meeting day is not the policy decision.
  expect(policyCalendarCovers(POLICY_CALENDAR.from)).toBe(true);
  expect(policyCalendarCovers(POLICY_CALENDAR.through)).toBe(true);
  expect(policyCalendarCovers('2028-01-01')).toBe(false);
});
