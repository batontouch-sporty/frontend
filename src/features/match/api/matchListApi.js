import api from '../../../api/axios';
import { toMatchCard } from '../../main/api/aiMatchApi';
import { settleAccepted } from './matchApi';
import { depositErrorMessage } from '../utils/depositMessages';

const SEARCH_FIELDS = ['serviceId', 'titleKeyword', 'descriptionKeyword', 'startAt', 'endAt', 'maxParticipant', 'skillLevel', 'sportType', 'region', 'status', 'isFree'];

function readList(data) {
  if (!Array.isArray(data)) throw new Error('매치 목록 응답 형식이 올바르지 않아요.');
  return data.map(toMatchListItem);
}
export async function fetchMatchList(filters = {}, signal) {
  const params = Object.fromEntries(SEARCH_FIELDS.filter(key => filters[key] != null && filters[key] !== '').map(key => [key, filters[key]]));
  // 검색 DTO는 Boolean을 받는다. 선택하지 않은 요금은 파라미터에서 제외한다.
  if (params.isFree === 'Y') params.isFree = true;
  if (params.isFree === 'N') params.isFree = false;
  const { data } = await api.get('/api/matches', { params, signal, timeout: 15000 });
  return readList(data);
}
// AI 추천 응답 { matches, fallback }. fallback=true면 취향 추천 대신 최신 매치를 준 것이다.
export async function fetchRecommendedMatches(signal) {
  const { data } = await api.get('/api/ai/matches/recommendations', { signal, timeout: 15000 });
  return { matches: readList(Array.isArray(data) ? data : data?.matches), fallback: data?.fallback === true };
}
export async function requestMatchParticipation(matchId, options) {
  if (!Number.isSafeInteger(matchId) || matchId < 1) throw new Error('매치 번호가 올바르지 않아요.');
  const response = await api.post(`/api/matches/${matchId}/participants`, undefined, { timeout: 15000 });
  await settleAccepted(response, '참가 완료 여부를 확인할 수 없어요. 목록을 새로고침해주세요.', options);
  return response.data;
}
export function toMatchListItem(dto) {
  if (!dto || !Number.isSafeInteger(dto.matchId) || dto.matchId < 1 || typeof dto.title !== 'string') throw new Error('매치 응답 형식이 올바르지 않아요.');
  // 메인과 같은 MatchRow 화면 모델을 쓴다. 목록은 상태를 모르면 참가를 막는다.
  return { ...toMatchCard(dto), sportType: dto.sportType, statusCode: dto.status, closed: dto.status !== 'RECRUITING' };
}
// 다시 시도해도 결과가 같은 오류(로그인·권한·회원 없음·미구현)에는 [다시 시도]를 보여주지 않는다.
export function isRetryableError(error) {
  const status = error?.response?.status;
  return ![401, 403, 404, 501].includes(status);
}
export function matchRequestError(error, kind = 'list') {
  if (kind === 'join' && error.depositRequest) return error.message;
  const depositMessage = kind === 'join' && depositErrorMessage(error.response?.data?.code);
  if (depositMessage) return depositMessage;
  const status = error.response?.status;
  if (status === 401) return '로그인이 필요해요. 다시 로그인해 주세요.';
  if (status === 403) return '이 작업을 할 권한이 없어요.';
  if (status === 501) return '이 기능은 준비 중이에요.';
  if (kind === 'recommendation' && status === 404) return '회원 정보를 찾지 못했어요. 다시 로그인해 주세요.';
  if (kind === 'recommendation' && status >= 500) return '추천 매치를 만들지 못했어요. 잠시 후 다시 시도해 주세요.';
  if (status === 409) return '이미 참가 중인 매치예요.';
  if (status === 400) return kind === 'join' ? '모집이 끝났거나 정원이 찼어요.' : '검색 조건을 확인해 주세요.';
  if (status === 404) return '매치를 찾을 수 없어요.';
  return kind === 'join' ? '참가 결과를 확인하지 못했어요. 목록을 확인하고 다시 시도해 주세요.' : '매치를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
}
