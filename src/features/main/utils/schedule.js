import { formatMatchDate } from './matchDisplay';

const dateKey = date => new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// 서버 LocalDateTime 조건에 맞춘 현재 시각.
export const localDateTime = (date = new Date()) => new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);

// 보드는 오늘 매치에서 내 자치구를 먼저 두고, 오늘 매치가 없으면 이번 주 매치로 채운다.
// 보드에 나온 매치는 이번 주 목록에서 뺀다.
export function buildSchedule(matches, { district = null, now = new Date(), limit = 4 } = {}) {
  const today = dateKey(now);
  const tomorrow = dateKey(addDays(now, 1));
  const weekEnd = dateKey(addDays(now, 7));
  const sorted = matches.filter(match => typeof match.startAt === 'string').sort((a, b) => a.startAt.localeCompare(b.startAt));
  const week = sorted.filter(({ startAt }) => startAt.slice(0, 10) >= today && startAt.slice(0, 10) < weekEnd);
  const todays = week.filter(({ startAt }) => startAt.slice(0, 10) === today);
  const pool = todays.length ? todays : week;
  const mine = district ? pool.filter(match => match.region === district) : [];
  const board = [...mine, ...pool.filter(match => !mine.includes(match))].slice(0, limit);

  const days = [];
  week.filter(match => !board.includes(match)).forEach(match => {
    const key = match.startAt.slice(0, 10);
    if (days.at(-1)?.key !== key) {
      const label = formatMatchDate(key).replace(/\b0/g, '');
      days.push({ key, label: key === today ? `오늘 · ${label}` : key === tomorrow ? `내일 · ${label}` : label, matches: [] });
    }
    days.at(-1).matches.push(match);
  });

  const scope = !pool.length ? '' : !district ? '서울 전체 시간순이에요'
    : mine.length ? `${district} 먼저 보여 드려요` : `${district} 매치가 없어서 서울 전체를 보여 드려요`;
  return { title: todays.length ? '오늘 모집 중' : '이번 주 모집 중', scope, board, days };
}
