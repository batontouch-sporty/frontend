import { useState } from 'react';
import { finiteSample } from './MonitoringVisualizations';

const outcomes = ['success', 'rejected', 'timed_out'];
const lateOutcomes = ['cleaned', 'rejected'];
const aiOutcomes = ['success', 'fallback', 'rejected', 'error'];
const aiTypes = ['search', 'draft', 'recommend'];
const kst = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function state(request) {
  return request?.kind === 'error' ? '조회 실패' : request?.kind === 'success' ? null : '조회 중';
}

function samples(request, label, allowed) {
  if (state(request)) return null;
  const found = request.data.filter(item => allowed.includes(item.metric?.[label]));
  if (!found.length) return {};
  if (found.some(item => finiteSample(item.value?.[1]) === null || finiteSample(item.value?.[1]) < 0)) return null;
  return Object.fromEntries(found.map(item => [item.metric[label], finiteSample(item.value[1])]));
}

function count(request, outcome, allowed) {
  const status = state(request);
  if (status) return status;
  const values = samples(request, 'outcome', allowed);
  return values && outcome in values ? values[outcome].toFixed(1) : '미수집';
}

function aiTotals(request) {
  if (state(request)) return null;
  const rows = request.data.filter(item => aiTypes.includes(item.metric?.type) && aiOutcomes.includes(item.metric?.outcome));
  if (!rows.length || rows.some(item => finiteSample(item.value?.[1]) === null || finiteSample(item.value?.[1]) < 0)) return null;
  return Object.fromEntries(aiOutcomes.map(outcome => [outcome,
    rows.filter(item => item.metric.outcome === outcome).reduce((sum, item) => sum + finiteSample(item.value[1]), 0)]));
}

function aiValue(countRequest, sumRequest, field) {
  const status = state(countRequest) || (field === 'mean' ? state(sumRequest) : null);
  if (status) return status;
  const totals = aiTotals(countRequest);
  if (!totals) return '미수집';
  const totalRequests = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const eligibleRequests = totals.success + totals.fallback + totals.error;
  if (field === 'requests') return totalRequests.toFixed(1);
  if (!totalRequests) return '요청 없음';
  if (field === 'success') return eligibleRequests ? `${(totals.success / eligibleRequests * 100).toFixed(1)}%` : '계산 대상 없음';
  if (['fallback', 'rejected', 'error'].includes(field)) return totals[field].toFixed(1);
  const duration = sumRequest.data.filter(item => aiTypes.includes(item.metric?.type) && aiOutcomes.includes(item.metric?.outcome));
  if (!duration.length || duration.some(item => finiteSample(item.value?.[1]) === null || finiteSample(item.value?.[1]) < 0)) return '미수집';
  const measured = new Set(duration.map(item => `${item.metric.type}:${item.metric.outcome}`));
  if (countRequest.data.some(item => aiTypes.includes(item.metric?.type) && aiOutcomes.includes(item.metric?.outcome)
    && finiteSample(item.value?.[1]) > 0 && !measured.has(`${item.metric.type}:${item.metric.outcome}`))) return '미수집';
  return `${(duration.reduce((sum, item) => sum + finiteSample(item.value[1]), 0) / totalRequests * 1000).toFixed(0)} ms`;
}

export function buildAiTrend(countRequest, sumRequest) {
  if (state(countRequest) || state(sumRequest)) return [];
  const { window } = countRequest;
  const values = new Map(sumRequest.data.flatMap(item => item.values || []).map(([time, value]) => [time, finiteSample(value)]));
  const counts = new Map(countRequest.data.flatMap(item => item.values || []).map(([time, value]) => [time, finiteSample(value)]));
  return Array.from({ length: Math.floor((window.end - window.start) / window.step) + 1 }, (_, index) => {
    const time = window.start + index * window.step;
    const countValue = counts.get(time);
    const sumValue = values.get(time);
    return { time, value: countValue > 0 && sumValue !== undefined && sumValue !== null && sumValue >= 0 ? sumValue / countValue * 1000 : null,
      status: countValue === 0 ? '요청 없음' : '미수집' };
  });
}

function AiTrend({ countRequest, sumRequest, rateWindowMinutes }) {
  const [hover, setHover] = useState(null);
  const status = state(countRequest) || state(sumRequest);
  const points = buildAiTrend(countRequest, sumRequest);
  const latest = points.at(-1);
  const recent = points.findLast(point => point.value !== null);
  const max = Math.max(1, ...points.map(point => point.value || 0));
  const segments = [];
  let run = [];
  points.forEach((point, index) => {
    if (point.value === null) { if (run.length) segments.push(run); run = []; }
    else run.push(`${40 + index / Math.max(1, points.length - 1) * 530},${175 - point.value / max * 140}`);
  });
  if (run.length) segments.push(run);
  const active = hover === null ? null : points[hover];
  const x = index => 40 + index / Math.max(1, points.length - 1) * 530;
  const y = value => 175 - value / max * 140;
  return <article className="panel msa-domain-trend" aria-label="AI 평균 응답시간 추이">
    <div className="panel-head"><div><h3 className="panel-title">AI 평균 응답시간 추이</h3><p className="panel-sub">전체 AI 유형 · {rateWindowMinutes}분 rate의 sum / count · ms</p></div><strong>{status || (latest?.value !== null && latest ? `${latest.value.toFixed(0)} ms` : recent ? `최근 측정 ${recent.value.toFixed(0)} ms` : latest?.status || '미수집')}</strong></div>
    {status ? <p role={status === '조회 실패' ? 'alert' : 'status'}>{status}</p> : <>
      <div className="msa-time-plot"><svg viewBox="0 0 600 200" preserveAspectRatio="none" role="img" aria-label="AI 평균 응답시간 시계열">
        <line x1="40" x2="570" y1="175" y2="175" stroke="#9eabb7" />
        {segments.map((segment, index) => <polyline key={index} points={segment.join(' ')} fill="none" stroke="#3c83bc" strokeWidth="2.5" />)}
        {points.map((point, index) => point.value !== null && <circle key={`marker-${index}`} cx={x(index)} cy={y(point.value)} r="4" fill="#3c83bc" pointerEvents="none" />)}
        {points.map((point, index) => point.value !== null && <circle key={index} cx={x(index)} cy={y(point.value)} r="9" fill="transparent" tabIndex={0}
          aria-label={`${kst.format(new Date(point.time * 1000))} KST, ${point.value.toFixed(0)} ms`}
          onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(index)} onBlur={() => setHover(null)} />)}
        {active?.value !== null && active && <circle cx={x(hover)} cy={y(active.value)} r="4" fill="#3c83bc" />}
      </svg>
      {active?.value !== null && active && <div className="msa-time-tooltip" role="tooltip" style={{ left: `${x(hover) / 600 * 100}%`, top: `${y(active.value) / 200 * 100}%`, transform: x(hover) > 420 ? 'translate(-100%, -110%)' : 'translate(0, -110%)' }}>
        <time dateTime={new Date(active.time * 1000).toISOString()}>{kst.format(new Date(active.time * 1000))} KST</time><strong>{active.value.toFixed(0)} ms</strong>
      </div>}</div>
      <div className="msa-domain-axis"><span>{kst.format(new Date(countRequest.window.start * 1000))} KST</span><span>{kst.format(new Date(countRequest.window.end * 1000))} KST</span></div>
      {!points.some(point => point.value !== null) && <p>{latest?.status || '미수집'}</p>}
    </>}
  </article>;
}

export default function DomainMetrics({ data, rangeLabel, rateWindowMinutes = 5 }) {
  const { saga, late, aiCount, aiSum, trendCount, trendSum } = data;
  return <div className="msa-domain">
    <div className="content-grid equal">
      <article className="panel"><div className="panel-head"><div><h3 className="panel-title">탈퇴 Saga 최종 결과</h3><p className="panel-sub">{rangeLabel} · Counter increase · user-service</p></div><span className="tiny-tag">A30</span></div>
        <dl className="metric-list"><div><dt>성공</dt><dd>{count(saga, 'success', outcomes)}</dd></div><div><dt>거절</dt><dd>{count(saga, 'rejected', outcomes)}</dd></div><div><dt>타임아웃</dt><dd>{count(saga, 'timed_out', outcomes)}</dd></div></dl></article>
      <article className="panel"><div className="panel-head"><div><h3 className="panel-title">시간 초과 뒤 늦은 결과</h3><p className="panel-sub">{rangeLabel} · 최종 결과와 별도 집계</p></div><span className="tiny-tag">A30</span></div>
        <dl className="metric-list"><div><dt>늦은 정리 · 운영 확인</dt><dd>{count(late, 'cleaned', lateOutcomes)}</dd></div><div><dt>늦은 거절</dt><dd>{count(late, 'rejected', lateOutcomes)}</dd></div></dl></article>
    </div>
    <div className="content-grid equal">
      <article className="panel"><div className="panel-head"><div><h3 className="panel-title">AI 처리 결과</h3><p className="panel-sub">{rangeLabel} · search/draft/recommend 합계 · ai-service</p></div><span className="tiny-tag">A30</span></div>
        <dl className="metric-list"><div><dt>요청량</dt><dd>{aiValue(aiCount, aiSum, 'requests')}</dd></div><div><dt>직접 성공률</dt><dd>{aiValue(aiCount, aiSum, 'success')}</dd></div><div><dt>Fallback</dt><dd>{aiValue(aiCount, aiSum, 'fallback')}</dd></div><div><dt>업무 거절</dt><dd>{aiValue(aiCount, aiSum, 'rejected')}</dd></div><div><dt>오류</dt><dd>{aiValue(aiCount, aiSum, 'error')}</dd></div><div><dt>평균 응답시간</dt><dd>{aiValue(aiCount, aiSum, 'mean')}</dd></div></dl><p className="panel-sub">직접 성공률은 업무 거절을 제외합니다.</p></article>
      <AiTrend countRequest={trendCount} sumRequest={trendSum} rateWindowMinutes={rateWindowMinutes} />
    </div>
    <article className="panel"><h3 className="panel-title">매치 생성 · 참가</h3><p className="panel-sub">계측 대기 · sporty_match_created_total / sporty_match_joined_total 수집 확인 필요</p></article>
  </div>;
}
