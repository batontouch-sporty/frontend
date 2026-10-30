/**
 * [AI-02] AI 매치 검색
 * [백엔드 연동 담당자 시작점]
 * 흐름: AISearchBox → MainPage.searchHandler(api.post) → 이 파일의 변환 함수 → 조건 요약/카드.
 * 서버 주소·인증 헤더는 src/api/axios.js에서 공통 관리한다.
 * OpenAI 호출과 자연어 정제는 백엔드 책임이며 이 파일은 정제된 JSON만 받는다.
 * 계약: 요청 { prompt }, 응답 { conditions, matches }.
 * DTO 확정 후 MainPage.searchHandler의 요청 본문과 이 파일의 두 변환 함수를 수정한다.
 */

import api from '../../../api/axios';
import { formatMatchDate, formatMatchLocation } from '../utils/matchDisplay';

const SKILL_LABELS = { BEGINNER: '초급', INTERMEDIATE: '중급', ADVANCED: '고급' };
const SPORT_LABELS = { SOCCER: '축구', FUTSAL: '풋살', BASKETBALL: '농구', BASEBALL: '야구', TENNIS: '테니스', BADMINTON: '배드민턴', TABLE_TENNIS: '탁구', VOLLEYBALL: '배구', SWIMMING: '수영', RUNNING: '러닝' };
const GENDER_LABELS = { MALE: '남성', FEMALE: '여성', MIXED: '혼성'};
const STATUS_LABELS = { RECRUITING: '모집중', CLOSED: '마감' };

// [AI-02] AI 매치 검색 — 맞춤 조건 응답 변환
// 프론트에서 자연어를 재해석하지 않고 백엔드가 정제한 조건만 표시한다.
// conditions 항목 계약: { label, value }. 최종 DTO가 달라지면 이 변환부를 수정한다.
// 표시 순서는 종목 → 성별 → 날짜 → 자치구 → 실력 수준 → 모집 상태이며, 그 외 조건과 detail은 표시하지 않는다.
// 모집 상태도 검색에 적용되는 조건이므로 요약과 직접 수정 폼에 함께 보여준다.
// 자치구 값은 성동구/중구 등의 구 이름으로 내려받는다. 주소 문자열에서 프론트가 임의 추출하지 않는다.
// 응답 자체가 비었으면 요약을 숨기고, 일부 조건만 왔다면 나머지는 '미지정'으로 표시한다.
const CONDITION_LABELS = ['종목', '성별', '날짜', '자치구', '실력 수준', '모집 상태'];
const CONDITION_ALIASES = { 일정: '날짜', 지역: '자치구', 실력: '실력 수준' };

export function toConditionSummary(conditions = []) {
  if (!Array.isArray(conditions) || conditions.some(item => !item || typeof item.label !== 'string' || typeof item.value !== 'string')) {
    throw new Error('분석 조건 응답 형식을 확인해주세요.');
  }
  if (conditions.length === 0) return [];
  const values = new Map(conditions.map(({ label, value }) => [CONDITION_ALIASES[label] || label, value]));
  return CONDITION_LABELS.map(label => ({ label, value: values.get(label)?.trim() || '미지정' }));
}

// [AI-02] AI 매치 검색 — 매치 카드 응답 변환
// 서버 Match와 화면 카드 모델의 변환을 한곳에 둔다.
// isFree, region, facilityName, currentParticipant, score, distance는 AI 응답의 확장 필드로 가정한다.
// 제공되지 않은 정보는 추측하지 않고 숨기거나 미제공 상태로 표시한다.
// 백엔드 필드명을 컴포넌트에 직접 퍼뜨리지 말고 이곳에서 아래 화면 모델로 변환한다.
// isFree는 boolean(true=무료, false=유료), score는 0~100, distance는 동일 단위의 숫자로 맞춘다.
// startAt은 정렬용 원본을 유지하며, 카드 날짜/장소 표시는 matchDisplay.js에서 형식을 맞춘다.
// 참가 기능 구현 시 서버 status를 화면의 closed(boolean)로 변환하는 부분도 이 반환 객체에 추가한다.
export function toMatchCard(match) {
  if (!match || !Number.isInteger(match.matchId) || typeof match.title !== 'string') {
    throw new Error('매치 응답 형식을 확인해주세요.');
  }
  return {
    id: match.matchId,
    title: match.title,
    description: match.description || '',
    format: SPORT_LABELS[match.sportType] || match.sportType || '종목 미정',
    level: SKILL_LABELS[match.skillLevel] || match.skillLevel || '실력 정보 없음',
    startAt: match.startAt,
    schedule: formatMatchDate(match.startAt),
    location: formatMatchLocation(match.region, match.facilityName),
    isFree: typeof match.isFree === 'boolean' ? match.isFree : null,
    score: Number.isFinite(match.score) ? match.score : null,
    distance: Number.isFinite(match.distance) ? match.distance : null,
    // [AI-02] 참여 인원: 서버 MatchResponseDto는 numCurrentParticipant로 내려준다.
    // 숫자 표시와 진행률 계산은 MatchCard에서 함께 처리한다.
    currentParticipant: match.numCurrentParticipant,
    maxParticipant: match.maxParticipant,
    genderGroup: match.genderGroup,
    // 모르는 값은 null로 두고, 표시 문구는 MatchCard 기본값을 사용한다.
    genderGroupLabel: GENDER_LABELS[match.genderGroup] ?? null,
  };
}

// [AI-02] 조건 직접 수정 — 서버 criteria를 편집 폼 값으로 변환한다. 폼은 날짜만 다루므로 일시는 YYYY-MM-DD로 자른다.
export function toCriteria(criteria) {
  return {
    sportType: criteria?.sportType || '',
    genderGroup: criteria?.genderGroup || '',
    region: criteria?.region || '',
    startDate: criteria?.startAt?.slice(0, 10) || '',
    endDate: criteria?.endAt?.slice(0, 10) || '',
    skillLevel: criteria?.skillLevel || '',
    status: criteria?.status || '',
  };
}

// 편집한 조건 → 조건 요약. 백엔드 toConditions()와 같은 라벨·날짜 형식을 쓰고, 비운 항목은 '미지정'으로 둔다.
export function criteriaToConditions({ sportType, genderGroup, region, startDate, endDate, skillLevel, status }) {
  const date = !startDate && !endDate ? '' : !startDate ? `~ ${endDate}`
    : !endDate || startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
  return [
    ['종목', SPORT_LABELS[sportType]], ['성별', GENDER_LABELS[genderGroup]], ['날짜', date],
    ['자치구', region], ['실력 수준', SKILL_LABELS[skillLevel]], ['모집 상태', STATUS_LABELS[status]],
  ].map(([label, value]) => ({ label, value: value || '미지정' }));
}

// 편집한 조건으로 일반 매치 검색(EM-02 GET /api/matches)을 다시 호출한다. AI는 부르지 않는다.
// 날짜는 시작일 00:00 ~ 종료일 23:59:59로 보낸다.
export async function searchMatchesByCriteria({ sportType, genderGroup, region, startDate, endDate, skillLevel, status }) {
  const params = {
    sportType, genderGroup, region, skillLevel, status,
    startAt: startDate && `${startDate}T00:00:00`,
    endAt: endDate && `${endDate}T23:59:59`,
  };
  const { data } = await api.get('/api/matches', {
    params: Object.fromEntries(Object.entries(params).filter(([, value]) => value)),
  });
  if (!Array.isArray(data)) throw new Error('매치 목록 응답 형식을 확인해주세요.');
  return data.map(toMatchCard);
}

// [AI-01] AI 매치 초안 생성
// MainPage.generateHandler가 prepareAiMatchDraft로 넘길 응답 본문 { initialValues }를 반환한다.
// 실패 메시지는 AISearchBox가 입력창 아래에 표시한다.
export async function draftAiMatch(prompt) {
  try {
    const { data } = await api.post('/api/ai/matches', { prompt });
    return data;
  } catch (error) {
    if (error.response?.status === 401) throw new Error('로그인 후 AI 매치 생성을 이용할 수 있습니다.');
    const message = error.response?.data?.message;
    throw new Error(message || '매치 초안을 만들지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
}
