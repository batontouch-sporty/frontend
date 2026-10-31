import { buildSchedule } from './schedule';

const now = new Date(2026, 9, 31, 18, 0);
const match = (id, startAt, region = '마포구') => ({ id, startAt, region });

test('내 자치구를 먼저 두고 보드에 나온 매치는 이번 주 목록에서 뺀다', () => {
  const { title, scope, board, days } = buildSchedule([
    match(1, '2026-10-31T19:30:00', '성동구'),
    match(2, '2026-10-31T20:00:00', '마포구'),
    match(3, '2026-11-01T09:00:00', '송파구'),
  ], { district: '마포구', now, limit: 2 });

  expect(title).toBe('오늘 모집 중');
  expect(scope).toBe('마포구 먼저 보여 드려요');
  expect(board.map(item => item.id)).toEqual([2, 1]);
  expect(days.map(day => [day.label.slice(0, 2), day.matches.map(item => item.id)])).toEqual([['내일', [3]]]);
});

test('오늘 매치가 없으면 이번 주 매치로 보드를 채우고 일주일 밖은 뺀다', () => {
  const { title, scope, board, days } = buildSchedule([
    match(1, '2026-11-02T19:00:00'),
    match(2, '2026-11-07T19:00:00'),
  ], { district: '도봉구', now });

  expect(title).toBe('이번 주 모집 중');
  expect(scope).toBe('도봉구 매치가 없어서 서울 전체를 보여 드려요');
  expect(board.map(item => item.id)).toEqual([1]);
  expect(days).toEqual([]);
});

test('비로그인은 서울 전체 시간순이다', () => {
  const { scope, board } = buildSchedule([match(2, '2026-10-31T21:00:00'), match(1, '2026-10-31T19:00:00')], { now });
  expect(scope).toBe('서울 전체 시간순이에요');
  expect(board.map(item => item.id)).toEqual([1, 2]);
});
