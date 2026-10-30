// [AI-02] 카드 날짜: 서버의 LocalDateTime은 한국 경기 날짜로 취급한다.
// 시간대가 명시된 ISO 값은 한국 시간으로 변환해 브라우저 위치와 무관하게 표시한다.
export const formatMatchDate = (startAt) => {
  if (typeof startAt !== 'string') return '일정 정보 없음';
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(startAt);
  if (!parts) return '일정 정보 없음';
  const [, year, month, day] = parts;
  let date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return '일정 정보 없음';
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(startAt)) {
    date = new Date(startAt);
    if (Number.isNaN(date.getTime())) return '일정 정보 없음';
  }
  const formatted = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', weekday: 'long',
  }).formatToParts(date);
  const value = type => formatted.find(part => part.type === type).value;
  return `${value('month')}월 ${value('day')}일 ${value('weekday')}`;
};

// [AI-02] region(자치구) + facilityName(시설명)을 받는 계약을 가정한다.
// 시설명이 serviceName 등으로 내려오면 toMatchCard의 매핑만 수정한다. 역세권 문구는 사용하지 않는다.
export const formatMatchLocation = (region, facilityName) => {
  const district = typeof region === 'string' ? region.trim() : '';
  const facility = typeof facilityName === 'string' ? facilityName.trim() : '';
  return [district || '자치구 미정', facility || '시설 미정'].join(' ');
};
