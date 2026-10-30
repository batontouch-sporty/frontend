import api from '../../../api/axios';

// [PR-02] 프로필 상세 조회. userId가 아니라 참가자 응답의 profileId를 전달한다.
// 응답: { id, nickname, district, imageUrl, preferenceSports: SportType[] }
export function getProfile(profileId, signal) {
  return api.get(`/api/profiles/${encodeURIComponent(profileId)}`, { signal })
    .then(response => response.data);
}
