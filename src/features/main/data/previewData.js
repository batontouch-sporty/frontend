import { formatMatchDate, formatMatchLocation } from '../utils/matchDisplay';

// 미리보기 전용 예시이며 실제 시설/매치 예약 정보가 아니다.
export const previewConditions = [
  { label: '종목', value: '풋살' },
  { label: '성별', value: '성별 무관' },
  { label: '날짜', value: '2026-10-01' },
  { label: '자치구', value: '성동구' },
  { label: '실력 수준', value: '초급' },
];

export const previewMatches = Array.from({ length: 3 }, (_, index) => ({
  id: `preview-${index + 1}`,
  title: `[매치 타이틀 플레이스홀더 #${index + 1}]`,
  format: '[성별/형식]', level: '[레벨 태그]', score: 98 - index,
  description: '[매치 상세 설명 및 호스트 안내 문구 플레이스홀더]',
  schedule: formatMatchDate(`2026-10-0${index + 1}T18:00:00`),
  location: formatMatchLocation(['성동구', '중구', '강남구'][index], ['예시 풋살장', '예시 체육관', '예시 테니스장'][index]),
  isFree: index !== 1,
  // 예시 3개에서 파랑(2/12), 초록(7/12), 빨강(10/12)을 확인할 수 있다.
  currentParticipant: [2, 7, 10][index],
  maxParticipant: 12,
  startAt: `2026-10-${String(1 + index % 7).padStart(2, '0')}T18:00:00+09:00`,
  distance: (index * 7) % 13,
}));
