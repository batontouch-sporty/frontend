import { formatMatchDate } from '../../main/utils/matchDisplay';
import { localDateTime } from '../../main/utils/schedule';

const dayKey = date => localDateTime(date).slice(0, 10);
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export const DATE_TABS = [['', '전체'], ['today', '오늘'], ['tomorrow', '내일'], ['weekend', '이번 주말']];

// 날짜 탭의 [시작일, 종료일]. 일요일에 고른 이번 주말은 오늘 하루다.
function tabRange(tab, now) {
  if (tab === 'today') return [dayKey(now), dayKey(now)];
  if (tab === 'tomorrow') return [dayKey(addDays(now, 1)), dayKey(addDays(now, 1))];
  const day = now.getDay();
  return [dayKey(day === 0 ? now : addDays(now, 6 - day)), dayKey(addDays(now, (7 - day) % 7))];
}

export function inDateTab(match, tab, now = new Date()) {
  if (!tab) return true;
  if (typeof match.startAt !== 'string') return false;
  const [from, to] = tabRange(tab, now);
  const date = match.startAt.slice(0, 10);
  return date >= from && date <= to;
}

// 날짜별로 묶는다. 묶음은 날짜순이고 묶음 안은 받은 순서를 지킨다.
export function groupByDay(matches, now = new Date()) {
  const today = dayKey(now);
  const tomorrow = dayKey(addDays(now, 1));
  const days = new Map();
  matches.forEach(match => {
    const key = typeof match.startAt === 'string' ? match.startAt.slice(0, 10) : '';
    if (!days.has(key)) {
      const label = formatMatchDate(key).replace(/\b0/g, '');
      days.set(key, { key, label: key === today ? `오늘 · ${label}` : key === tomorrow ? `내일 · ${label}` : label, matches: [] });
    }
    days.get(key).matches.push(match);
  });
  // 일정을 모르는 매치는 맨 뒤로 보낸다.
  return [...days.values()].sort((a, b) => (a.key || '9').localeCompare(b.key || '9'));
}
