// [AI-03] AI 매치 생성 — 해석 결과를 생성 폼 초안으로 변환
// 라우트 간 전달용 초안이다. 실제 매치 등록은 생성 화면에서 사용자가 제출할 때만 실행한다.
// 생성 페이지는 state.aiDraft를 읽어 MatchForm 초기값으로 전달한다.
// 생성 해석 API 계약(예정): { initialValues: { sportType, startAt, endAt, ... }, facility? }.
/**
 * [생성 API 담당자 수정 지점]
 * 서버 응답을 다음 모델로 맞춘 뒤 MainPage의 onGenerate에서 반환한다.
 * initialValues: sportType/skillLevel(enum), startAt/endAt(YYYY-MM-DDTHH:mm),
 *                maxParticipant(양의 정수), title/description(문자열).
 * facility: 실제 시설이 확정된 경우만 { serviceId: 양의 정수, name, region?, locationName? }.
 * facility가 없으면 사용자가 생성 폼에서 시설을 선택해야 하므로 serviceId만 자동 입력하지 않는다.
 * 새 자동 입력 항목 추가 시 이곳의 허용 목록 + matchValidation.initialMatchValues + MatchForm을 함께 수정한다.
 * interpreted는 해석 응답 수신 여부이지 등록 가능 여부가 아니다. 최종 검증은 MatchForm 제출 시 수행한다.
 */
export function prepareAiMatchDraft(prompt, result) {
  if (result != null && (typeof result !== 'object' || Array.isArray(result) || !result.initialValues || typeof result.initialValues !== 'object' || Array.isArray(result.initialValues))) {
    throw new Error('매치 생성 조건 응답 형식을 확인해주세요.');
  }
  const source = result?.initialValues || {};
  const initialValues = {};
  // 서버의 부가 정보가 폼으로 섞이지 않도록 자동 입력할 필드만 전달한다.
  for (const field of ['sportType', 'skillLevel', 'startAt', 'endAt', 'title', 'description', 'genderGroup']) {
    if (typeof source[field] === 'string') initialValues[field] = source[field];
  }
  if (Number.isInteger(source.maxParticipant) && source.maxParticipant > 0) initialValues.maxParticipant = source.maxParticipant;
  const facility = result?.facility;
  const selectedFacility = facility && Number.isInteger(facility.serviceId) && facility.serviceId > 0 && typeof facility.name === 'string' ? facility : undefined;
  // 시설명만 추정한 경우 시설 ID를 만들지 않는다. 사용자가 실제 시설을 검색·선택해야 한다.
  return { prompt, initialValues, facility: selectedFacility, interpreted: result != null };
}
