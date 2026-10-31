import { Link } from 'react-router-dom';
import '../css/matchRow.css';

const FEES = new Map([[true, '무료'], [false, '유료']]);

// aiMatchApi.toMatchCard의 화면 모델을 일정표 한 줄로 보여 준다. 표시 전용이고 참가 처리는 부모가 맡는다.
// joinState: undefined | { status: 'joining' | 'done' | 'error' | 'owner', message?, restored? }
// restored는 새로고침 뒤 내 매치 목록에서 되살린 신청이라 방금 신청한 안내를 보이지 않는다.
const MatchRow = ({ match, mine, board = false, showDate = false, showDescription = false, joinState, onJoin }) => {
  const { currentParticipant: current, maxParticipant: maximum, startAt } = match;
  const known = Number.isInteger(current) && current >= 0 && Number.isInteger(maximum) && maximum > 0;
  const remaining = known ? Math.max(0, maximum - current) : null;
  const occupancy = known ? Math.min(100, current / maximum * 100) : 0;
  const closed = match.closed === true || remaining === 0;
  const done = joinState?.status === 'done';
  const joining = joinState?.status === 'joining';
  const owner = joinState?.status === 'owner';
  const last = !closed && !done && remaining !== null && remaining <= 1;
  const meta = [match.format, match.region || '자치구 미정', match.level, match.genderGroupLabel || '성별 정보 없음', FEES.get(match.isFree) || '요금 정보 없음'];
  const label = owner ? '내 매치' : done ? '신청 완료' : joining ? '참가 신청 중…' : closed ? '모집 마감' : '참가';

  return (
    <article className={`match-row${board ? ' match-row--board' : ''}${closed ? ' is-closed' : ''}${done ? ' is-done' : ''}`}>
        <div className="match-row-time">
            {typeof startAt === 'string' ? startAt.slice(11, 16) : '미정'}
            {showDate && typeof startAt === 'string' && <span>{startAt.slice(5, 10).replace('-', '.')}</span>}
        </div>
        <div className="match-row-main">
            <h3>
                <Link to={`/matches/${match.id}`}>{match.title}</Link>
                {Number.isFinite(match.score) && <span className="match-row-score">매칭 적합도 {match.score}%</span>}
            </h3>
            <p>{meta.map((item, index) => <span key={index} className={item === mine ? 'is-mine' : undefined}>{index > 0 && ' · '}{item}</span>)}</p>
            {showDescription && match.description && <p className="match-row-description">{match.description}</p>}
        </div>
        {known ? <div className={`match-row-seats${last ? ' is-last' : ''}`}>
            <strong>{closed ? '마감' : `${remaining}자리 남음`}</strong>
            <div className="match-row-meter" role="progressbar" aria-label="참가 인원 모집률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={occupancy} aria-valuetext={`${maximum}명 중 ${current}명 참여`}>
                <span style={{ width: `${occupancy}%` }} />
            </div>
            <div className="match-row-count">{current}/{maximum}명</div>
        </div> : <div className="match-row-seats is-unknown"><strong>인원 정보 없음</strong></div>}
        <button type="button" className="match-row-join" disabled={!onJoin || closed || done || joining || owner} onClick={() => onJoin?.(match)}>{label}</button>
        {done && !joinState.restored && <p className="match-row-note" role="status">취소는 매치 상세에서 해요.</p>}
        {joinState?.status === 'error' && <p className="match-row-error" role="alert">{joinState.message}</p>}
    </article>
  );
};
export default MatchRow;
