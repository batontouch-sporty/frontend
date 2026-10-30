import api from '../../../api/axios';

export async function joinMatch(matchId) {
  const response = await api.post(`/api/matches/${matchId}/participants`);
  if (response.status !== 201) throw new Error('참가 결과를 확인할 수 없습니다. 새로고침해주세요.');
  return response.data;
}

export async function leaveMatch(matchId) {
  const response = await api.delete(`/api/matches/${matchId}/participants/me`);
  if (response.status !== 204) throw new Error('탈퇴 결과를 확인할 수 없습니다. 새로고침해주세요.');
}

export async function deleteMatch(matchId) {
  const response = await api.delete(`/api/matches/${matchId}`);
  if (response.status !== 204) throw new Error('삭제 결과를 확인할 수 없습니다. 새로고침해주세요.');
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
    throw new Error('매치 상세 응답 형식을 확인할 수 없습니다.');
  }
  return data;
}

// [FC-01] 시설 검색 — 생성 폼에서 사용할 시설 응답 변환
// Keep the facility response mapping here until the ServiceResponse contract is finalized.
export function toFacilityOption(service) {
  if (!Number.isInteger(service.serviceId) || !service.serviceName) {
    throw new Error('시설 응답 형식을 확인해주세요.');
  }
  return { serviceId: service.serviceId, name: service.serviceName, region: service.region || '', locationName: service.locationName || '' };
}

// [FC-01] 시설 검색 — 매치 생성 폼의 시설 검색 API 호출 지점
export async function searchMatchFacilities({ query, region }) {
  const { data } = await api.get('/api/services', {
    params: { ...(query ? { serviceName: query } : {}), ...(region ? { region } : {}) },
  });
  if (!Array.isArray(data)) throw new Error('시설 목록 응답 형식을 확인해주세요.');
  return data.map(toFacilityOption);
}

export async function createMatch(payload) {
  const { data } = await api.post('/api/matches', payload);
  const matchId = typeof data === 'number' ? data : data?.matchId;
  if (!Number.isInteger(matchId) || matchId < 1) {
    throw new Error('매치가 접수되었지만 응답에서 매치 번호를 확인하지 못했습니다. 중복 개설 전 마이페이지를 확인해주세요.');
  }
  return matchId;
}
