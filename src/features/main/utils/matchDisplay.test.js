import { formatMatchDate, formatMatchLocation } from './matchDisplay';
import { toMatchCard } from '../api/aiMatchApi';

test('formats a local match date with the correct Korean weekday', () => {
  expect(formatMatchDate('2026-10-01T18:00:00')).toBe('10월 01일 목요일');
  expect(formatMatchDate('2026-10-03')).toBe('10월 03일 토요일');
});

test('converts an explicit timezone to Korea before choosing the date', () => {
  expect(formatMatchDate('2026-09-30T16:00:00Z')).toBe('10월 01일 목요일');
});

test.each([undefined, '', 'invalid', '2026-02-30T18:00:00'])('handles invalid dates without crashing (%s)', value => {
  expect(formatMatchDate(value)).toBe('일정 정보 없음');
});

test('uses district and facility name for cards and preserves the raw date for sorting', () => {
  const card = toMatchCard({ matchId: 1, title: '풋살', startAt: '2026-10-01T18:00:00', region: '성동구', facilityName: '예시 풋살장', location: '역세권 설명' });
  expect(card).toMatchObject({ schedule: '10월 01일 목요일', location: '성동구 예시 풋살장', startAt: '2026-10-01T18:00:00' });
  expect(formatMatchLocation(undefined, undefined)).toBe('자치구 미정 시설 미정');
});
