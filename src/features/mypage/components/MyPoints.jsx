import { useEffect, useState } from 'react';

const REASONS = {
  SIGNUP: '가입 축하 포인트',
  DEPOSIT_CHARGED: '참가 보증금 차감',
  DEPOSIT_CANCELLED: '차감 전 요청 취소',
  DEPOSIT_RETURNED: '보증금 반환',
  ATTENDANCE_REWARDED: '출석 5회 보상',
  NO_SHOW_FORFEITED: '노쇼로 보증금 미반환',
  SUSPENSION_EXPIRED: '참여 정지 해제',
};
const REWARD_EVERY = 5;

// 서버의 KST LocalDateTime을 시간대 변환 없이 표시한다.
const dateTimeLabel = value => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
  ? `${value.slice(0, 10).replaceAll('-', '.')} ${value.slice(11, 16)}` : '');
const deltaLabel = delta => (delta > 0 ? `+${delta}점` : `${delta}점`);

// [포인트] MyPage → myPageApi.loadMyPoints·loadPointHistory → GET /api/users/me/points(/history).
export default function MyPoints({ loadMyPoints, loadPointHistory, onUnauthorized }) {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState({ content: [], page: 0, totalPages: 0 });
  const [loading, setLoading] = useState(Boolean(loadMyPoints));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!loadMyPoints) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([loadMyPoints({ signal: controller.signal }), loadPointHistory({ page: 0, signal: controller.signal })]).then(([points, page]) => {
      if (controller.signal.aborted) return;
      setSummary(points);
      setHistory({ content: page.content || [], page: 0, totalPages: page.totalPages || 0 });
    }).catch(requestError => {
      if (controller.signal.aborted) return;
      if (requestError.response?.status === 401) onUnauthorized();
      else setError('포인트 정보를 불러오지 못했어요.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadMyPoints, loadPointHistory, onUnauthorized, retry]);

  const loadMore = () => {
    setLoadingMore(true); setMoreError('');
    loadPointHistory({ page: history.page + 1 }).then(page => setHistory(previous => ({
      content: [...previous.content, ...(page.content || [])], page: previous.page + 1, totalPages: page.totalPages || previous.totalPages,
    }))).catch(requestError => {
      if (requestError.response?.status === 401) onUnauthorized();
      else setMoreError('이력을 더 불러오지 못했어요.');
    })
      .finally(() => setLoadingMore(false));
  };

  const heading = <div className="mypage-schedule-head"><h2 id="my-points-title">내 포인트</h2></div>;
  if (!loadMyPoints) return <section aria-labelledby="my-points-title">{heading}<p className="mypage-empty">미리보기에서는 포인트를 조회하지 않아요.</p></section>;
  if (loading) return <section aria-labelledby="my-points-title">{heading}<p className="mypage-empty" role="status">포인트 정보를 불러오는 중이에요.</p></section>;
  if (error) return <section aria-labelledby="my-points-title">{heading}<div className="mypage-empty"><p role="alert" className="mypage-error">{error}</p><button type="button" className="mypage-retry" onClick={() => setRetry(value => value + 1)}>다시 시도</button></div></section>;

  // 401은 상위에서 로그인으로 이동한다.
  if (!summary) return <section aria-labelledby="my-points-title">{heading}</section>;
  const progress = Number.isInteger(summary.attendanceRewardCount) ? summary.attendanceRewardCount : 0;
  return <section aria-labelledby="my-points-title">
    {heading}
    <dl className="mypage-panel mypage-section mypage-points">
      <div><dt>보유 포인트</dt><dd><strong>{summary.points}점</strong></dd></div>
      <div><dt>출석 보상</dt><dd>{progress} / {REWARD_EVERY}회</dd><dd className="mypage-hint">정상 출석 {REWARD_EVERY}회마다 10점을 더 받아요. 다음 보상까지 {REWARD_EVERY - progress}회 남았어요.</dd></div>
      <div><dt>참여 상태</dt>{summary.participationSuspended
        ? <><dd className="mypage-error">참여 정지 중</dd><dd className="mypage-hint">{dateTimeLabel(summary.suspendedUntil) ? `${dateTimeLabel(summary.suspendedUntil)}까지 매치 개설·참가·대기 신청을 할 수 없어요.` : '정지 기간 동안 매치 개설·참가·대기 신청을 할 수 없어요.'}</dd></>
        : <dd>참여 가능</dd>}</div>
    </dl>
    <h3 className="mypage-points-title">포인트 이력</h3>
    {history.content.length === 0 ? <p className="mypage-empty">포인트 이력이 없어요.</p> : <ul className="mypage-panel mypage-point-history">
      {history.content.map(entry => <li key={entry.id}>
        <div><strong>{REASONS[entry.reason] || '포인트 변동'}</strong><span>{dateTimeLabel(entry.createdAt)}</span></div>
        <div><strong className={entry.delta < 0 ? 'is-minus' : undefined}>{deltaLabel(entry.delta)}</strong><span>잔액 {entry.afterPoints}점</span></div>
      </li>)}
    </ul>}
    {moreError && <p role="alert" className="mypage-error">{moreError}</p>}
    {history.page + 1 < history.totalPages && <button type="button" className="mypage-retry mypage-points-more" disabled={loadingMore} onClick={loadMore}>{loadingMore ? '불러오는 중…' : '이력 더 보기'}</button>}
  </section>;
}
