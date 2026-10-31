import { groupByDay, inDateTab } from './matchDates';

const at = date => ({ startAt: `${date}T19:00:00` });
const monday = new Date(2026, 9, 26, 10);
const sunday = new Date(2026, 10, 1, 10);

test.each([
  ['today', '2026-10-26', true], ['today', '2026-10-27', false],
  ['tomorrow', '2026-10-27', true], ['tomorrow', '2026-10-26', false],
  ['weekend', '2026-10-30', false], ['weekend', '2026-10-31', true], ['weekend', '2026-11-01', true], ['weekend', '2026-11-02', false],
])('monday: %s includes %s = %s', (tab, date, expected) => {
  expect(inDateTab(at(date), tab, monday)).toBe(expected);
});

test('on sunday this weekend is today only and never the next weekend', () => {
  expect(inDateTab(at('2026-11-01'), 'weekend', sunday)).toBe(true);
  expect(inDateTab(at('2026-10-31'), 'weekend', sunday)).toBe(false);
  expect(inDateTab(at('2026-11-07'), 'weekend', sunday)).toBe(false);
});

test('a date tab excludes matches without a schedule, the all tab keeps them', () => {
  expect(inDateTab({}, 'today', monday)).toBe(false);
  expect(inDateTab({}, '', monday)).toBe(true);
});

test('groups by day in date order and labels today and tomorrow', () => {
  const days = groupByDay([at('2026-10-27'), at('2026-10-26'), {}, at('2026-10-27')], monday);
  expect(days.map(day => day.matches.length)).toEqual([1, 2, 1]);
  expect(days[0].label).toMatch(/^오늘 · 10월 26일/);
  expect(days[1].label).toMatch(/^내일 · 10월 27일/);
  expect(days[2].label).toBe('일정 정보 없음');
});
