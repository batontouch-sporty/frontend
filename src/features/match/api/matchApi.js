import api from '../../../api/axios';
import { requestResultMessage } from '../utils/depositMessages';

const REQUEST_STATUSES = ['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED'];
// 1초 뒤 첫 조회, 이후 2초 간격으로 약 60초까지 확인한다.
export const REQUEST_POLL_DELAYS = [1000, ...Array(29).fill(2000)];

export async function getMatchRequest(requestId, signal) {
  const { data } = await api.get(`/api/matches/requests/${encodeURIComponent(requestId)}`, { signal });
  if (data?.requestId !== requestId || !REQUEST_STATUSES.includes(data.status)) {
    throw new Error('요청 상태 응답 형식을 확인할 수 없어요.');
  }
  return data;
}

const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason); return; }
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});
const requestError = result => Object.assign(new Error(requestResultMessage(result)), { depositRequest: result });

// CONFIRMED면 결과를 반환한다. 실패·취소·시간 초과·조회 실패는 안내 문구와 depositRequest를 담은 Error로 던진다.
export async function waitForMatchRequest(requestId, { signal, delays = REQUEST_POLL_DELAYS } = {}) {
  for (const delay of delays) {
    await wait(delay, signal);
    let result;
    try { result = await getMatchRequest(requestId, signal); }
    catch (error) {
      if (signal?.aborted) throw error;
      throw requestError({ status: 'UNKNOWN' });
    }
    if (result.status === 'CONFIRMED') return result;
    if (result.status !== 'PENDING') throw requestError(result);
  }
  throw requestError({ status: 'PENDING' });
}

// [A9·A14] 보증금 Saga가 켜진 환경은 202 {requestId, matchId, status:'PENDING'}이고 확정까지 상태를 조회한다.
// 보증금 기능을 끈 환경은 기존처럼 201로 즉시 확정된다.
export async function settleAccepted(response, unexpectedMessage, { signal, delays, onPending } = {}) {
  if (response.status === 201) return;
  const requestId = response.data?.requestId;
  if (response.status !== 202 || typeof requestId !== 'string' || !requestId) throw new Error(unexpectedMessage);
  onPending?.();
  await waitForMatchRequest(requestId, { signal, delays });
}

export async function joinMatch(matchId, options) {
  const response = await api.post(`/api/matches/${matchId}/participants`);
  await settleAccepted(response, '참가 결과를 확인할 수 없어요. 새로고침해주세요.', options);
  return response.data;
}

// [A11 출석] 방장이 진행 중(시작 이상·종료 미만)인 매치의 참가자 출석을 바꾼다.
export async function updateAttendance(matchId, participantId, matchParticipantStatus) {
  const response = await api.patch(`/api/matches/${matchId}/participants/${participantId}/attendance`, { matchParticipantStatus });
  if (response.status !== 204) throw new Error('출석 변경 결과를 확인할 수 없어요. 새로고침해주세요.');
}

export async function leaveMatch(matchId) {
  const response = await api.delete(`/api/matches/${matchId}/participants/me`);
  if (response.status !== 204) throw new Error('탈퇴 결과를 확인할 수 없어요. 새로고침해주세요.');
}

export async function deleteMatch(matchId) {
  const response = await api.delete(`/api/matches/${matchId}`);
  if (response.status !== 204) throw new Error('삭제 결과를 확인할 수 없어요. 새로고침해주세요.');
}

// MatchModifyRequestDto에서 지원하는 필드만 전송한다.
export async function modifyMatch(matchId, { title, description, startAt, endAt, maxParticipant, skillLevel, genderGroup }) {
  const { data } = await api.put(`/api/matches/${matchId}`, {
    title, description, startAt, endAt, maxParticipant, skillLevel, genderGroup,
  });
  return data;
}

export async function getMatchDetail(matchId, signal) {
  const { data } = await api.get(`/api/matches/${matchId}`, { signal });
  if (!data || data.matchId !== Number(matchId)) {
    throw new Error('매치 상세 응답 형식을 확인할 수 없어요.');
  }
  return data;
}

// [FC-01] 시설 검색 — 생성 폼에서 사용할 시설 응답 변환
// Keep the facility response mapping here until the ServiceResponse contract is finalized.
export function toFacilityOption(service) {
  if (!Number.isInteger(service.serviceId) || !service.serviceName) {
    throw new Error('시설 응답 형식을 확인해 주세요.');
  }
  return { serviceId: service.serviceId, name: service.serviceName, region: service.region || '', locationName: service.locationName || '' };
}

// [FC-01] 시설 검색 — 매치 생성 폼의 시설 검색 API 호출 지점
export async function searchMatchFacilities({ query, region }) {
  const { data } = await api.get('/api/services', {
    params: { ...(query ? { serviceName: query } : {}), ...(region ? { region } : {}) },
  });
  if (!Array.isArray(data)) throw new Error('시설 목록 응답 형식을 확인해 주세요.');
  return data.map(toFacilityOption);
}

export async function createMatch(payload, options) {
  const response = await api.post('/api/matches', payload);
  const { data } = response;
  const matchId = typeof data === 'number' ? data : data?.matchId;
  const unexpected = '매치가 접수되었지만 응답에서 매치 번호를 확인하지 못했어요. 중복 개설 전 마이페이지를 확인해 주세요.';
  if (!Number.isInteger(matchId) || matchId < 1) throw new Error(unexpected);
  await settleAccepted(response, unexpected, options);
  return matchId;
}
