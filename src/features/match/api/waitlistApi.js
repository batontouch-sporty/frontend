import api from '../../../api/axios';

export async function registerWaitlist(matchId) {
  const { status, data } = await api.post(`/api/matches/${matchId}/waitlist`);
  if (status !== 201 || data?.matchId !== Number(matchId)
    || !Number.isSafeInteger(data?.position) || data.position < 1) {
    throw new Error('대기 신청 결과를 확인하지 못했어요.');
  }
  return data;
}

export async function cancelWaitlist(matchId) {
  const { status } = await api.delete(`/api/matches/${matchId}/waitlist/me`);
  if (status !== 204) throw new Error('대기 취소 결과를 확인하지 못했어요.');
}
