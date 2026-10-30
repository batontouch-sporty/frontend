import '../css/main.css';

// API 원본 대신 aiMatchApi.toMatchCard의 화면 모델을 받는다. 서버 필드명 변경은 변환 함수에서 처리한다.
// 요금 표시는 isFree만 사용한다. 참가비 금액이나 잔디 정보는 카드에 추가하지 않는다.
// onJoin에는 전체 화면 모델을 전달하므로 참가 API 요청 시 match.id를 사용한다.
// 비동기 참가 기능 연결 시 중복 클릭 방지·성공/오류 표시도 담당 컨테이너에서 함께 구현해야 한다.
const MatchCard = ({
  match,
  onJoin
}) => {
  // [AI-02] AI 매치 검색 — 참여 인원 표시
  // 숫자와 막대를 동일한 인원 값으로 계산한다. 현재 인원 필드가 바뀌면 toMatchCard에서 매핑한다.
  const { currentParticipant, maxParticipant } = match;
  const hasParticipants = Number.isInteger(currentParticipant) && currentParticipant >= 0
    && Number.isInteger(maxParticipant) && maxParticipant > 0;
  const occupancy = hasParticipants ? Math.min(100, currentParticipant / maxParticipant * 100) : 0;
  // 경계값 25%, 75%는 모두 초록색이다. 정원을 초과해도 막대는 100%까지만 표시한다.
  const progressColor = occupancy < 25 ? 'blue' : occupancy <= 75 ? 'green' : 'red';
  return (
    <article className="ms-card ms-panel">
        <div className="ms-card-content">
            <div className="ms-card-tags">
                <div>
                    <span className="ms-tag">{match.format}</span>
                    <span className="ms-tag ms-tag-level">{match.level}</span>
                    {/* TODO: aiMatchApi.js의 toMatchCard에서 genderGroupLabel을 전달하세요. */}
                    <span className="ms-tag ms-tag-gender" aria-label={`성별 구성: ${match.genderGroupLabel || '정보 없음'}`}>
                        {match.genderGroupLabel || '성별 정보 없음'}
                    </span>
                </div>
                {Number.isFinite(match.score) && <span className="ms-score">매칭 적합도 {match.score}%</span>}
            </div>
            <h3>{match.title}</h3>
            <p className="ms-description">{match.description}</p>
            <ul className="ms-card-details">
                <li>
                    <span aria-hidden="true">🕒</span>
                    {match.schedule}
                </li>
                <li>
                    <span aria-hidden="true">📍</span>
                    {match.location}
                </li>
            </ul>
        </div>
        <div className="ms-card-bottom">
            {/* 금액은 표시하지 않는다. 요금 정보가 누락된 경우 무료로 오인하지 않도록 구분한다. */}
            <div className="ms-card-price">
                <span>{hasParticipants ? `참여 인원 ${currentParticipant}/${maxParticipant}명` : '참가 인원 정보 없음'}</span>
                <strong>{match.isFree === true ? '무료' : match.isFree === false ? '유료' : '요금 정보 없음'}</strong>
            </div>
            {hasParticipants && <div className={`ms-progress ms-progress-${progressColor}`} role="progressbar" aria-label="참가 인원 모집률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={occupancy} aria-valuetext={`${maxParticipant}명 중 ${currentParticipant}명 참여`}>
                <span style={{ width: `${occupancy}%` }} />
            </div>}
            <button type="button" className="ms-join" onClick={() => onJoin?.(match)} disabled={!onJoin || match.closed}>{match.closed ? '모집 마감' : '빠른 참가 신청 →'}</button>
        </div>
    </article>
  );
};
export default MatchCard;
