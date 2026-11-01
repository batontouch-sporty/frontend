import { useState } from 'react';
import { finiteSample } from './MonitoringVisualizations';

const kst = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const shortKst = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function samplesByService(data, ids, window) {
  const maps = Object.fromEntries(ids.map(id => [id, new Map()]));
  data.forEach(item => {
    const map = maps[item.metric?.application];
    if (!map) return;
    item.values?.forEach(([time, raw]) => {
      const index = Math.round((time - window.start) / window.step);
      if (index >= 0 && time <= window.end && Math.abs(window.start + index * window.step - time) < window.step / 2) {
        map.set(index, { value: finiteSample(raw), raw });
      }
    });
  });
  return maps;
}

export function buildPerformanceSeries(request, rpsRequest, services, selected, metric) {
  if (request?.kind !== 'success') return [];
  const { window } = request;
  const ids = services.map(([id]) => id).filter(id => selected === 'all' || selected === id);
  const maps = samplesByService(request.data, ids, window);
  const traffic = rpsRequest?.kind === 'success' ? samplesByService(rpsRequest.data, ids, window) : null;
  return Array.from({ length: Math.floor((window.end - window.start) / window.step) + 1 }, (_, index) => {
    const time = window.start + index * window.step;
    const entries = ids.map(id => maps[id].get(index));
    const values = entries.map(item => item?.value).filter(value => value !== null && value !== undefined && value >= 0);
    const invalid = entries.some(item => item && (item.value === null || item.value < 0));
    const trafficEntries = traffic ? ids.map(id => traffic[id].get(index)) : [];
    const noRequests = metric === 'p95' && trafficEntries.length > 0
      && trafficEntries.every(item => item?.value === 0);
    const value = values.length ? metric === 'rps'
      ? values.reduce((sum, current) => sum + current, 0)
      : Math.max(...values) * 1000 : null;
    const coverage = values.length;
    const state = value !== null ? (metric === 'p95' && noRequests ? '요청 없음' : coverage < ids.length ? `부분 집계 ${coverage}/${ids.length}` : metric === 'rps' && value === 0 ? '요청 없음' : null)
      : noRequests ? '요청 없음' : invalid ? '비유한 값' : '미수집';
    return { time, value: noRequests && metric === 'p95' ? null : value, state, coverage };
  });
}

function paths(points, max) {
  const x = index => 42 + index / Math.max(1, points.length - 1) * 532;
  const y = value => 174 - value / max * 136;
  const runs = [];
  let run = [];
  points.forEach((point, index) => {
    if (point.value === null) { if (run.length) runs.push(run); run = []; }
    else run.push({ x: x(index), y: y(point.value) });
  });
  if (run.length) runs.push(run);
  return {
    lines: runs.map(run => run.map(({ x: px, y: py }, index) => `${index ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`).join(' ')),
    areas: runs.map(run => `M${run[0].x.toFixed(2)},174 ` + run.map(({ x: px, y: py }) => `L${px.toFixed(2)},${py.toFixed(2)}`).join(' ') + ` L${run[run.length - 1].x.toFixed(2)},174 Z`),
    x, y,
  };
}

export function PerformanceChart({ metric, request, rpsRequest, services, selected }) {
  const [hover, setHover] = useState(null);
  const isP95 = metric === 'p95';
  const title = isP95 ? '서비스별 최대 P95 추이' : '요청량 RPS 추이';
  const unit = isP95 ? 'ms' : 'RPS';
  const points = buildPerformanceSeries(request, rpsRequest, services, selected, metric);
  const latest = points.at(-1);
  const latestText = latest?.value === null || latest === undefined ? latest?.state ?? '미수집'
    : `${isP95 ? latest.value.toFixed(0) : latest.value.toFixed(2)} ${unit}${latest.state === '요청 없음' ? ' · 요청 없음' : ''}`;
  const maxValue = Math.max(0, ...points.map(point => point.value ?? 0));
  const partial = points.some(point => point.state?.startsWith('부분 집계'));
  const axisMax = maxValue > 0 ? maxValue * 1.1 : 1;
  const { lines, areas, x, y } = paths(points, axisMax);
  const active = hover !== null ? points[hover] : null;
  const gradient = `msa-${metric}-area`;
  return <article className={`msa-time-card msa-time-${metric}`} aria-label={title}>
    <div className="msa-time-header"><div><h3>{title}</h3><p>{isP95 ? '최근 5분 rate의 서비스별 P95 최댓값 · Actuator 제외' : '최근 5분 rate · 전체 선택 시 5개 서비스 합계 · Actuator 제외'}</p></div>
      <strong className="msa-time-latest">{request?.kind === 'error' ? '조회 실패' : request?.kind === 'loading' || request?.kind === 'idle' ? '조회 중' : latestText}</strong></div>
    {request?.kind !== 'success' ? <p className="msa-time-empty" role={request?.kind === 'error' ? 'alert' : 'status'}>{request?.kind === 'error' ? '시계열 조회 실패' : '시계열 조회 중'}</p> : <>
      <div className="msa-time-plot">
        <svg viewBox="0 0 600 210" preserveAspectRatio="none" role="img" aria-label={`${title}, 실제 측정 시각과 ${unit} 값`}>
          <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={isP95 ? '#5fb9f5' : '#b4ed48'} stopOpacity=".38" /><stop offset="100%" stopColor={isP95 ? '#5fb9f5' : '#b4ed48'} stopOpacity="0" /></linearGradient></defs>
          {[38, 83, 128, 174].map(value => <line className="msa-time-gridline" key={value} x1="42" x2="574" y1={value} y2={value} />)}
          <text x="1" y="42" className="msa-time-axis">{axisMax.toFixed(isP95 ? 0 : 2)}</text><text x="8" y="178" className="msa-time-axis">0</text>
          {areas.map((path, index) => <path key={`area-${index}`} d={path} fill={`url(#${gradient})`} />)}
          {lines.map((path, index) => <path key={`line-${index}`} d={path} className="msa-time-line" />)}
          {points.map((point, index) => point.value !== null && <circle key={index} cx={x(index)} cy={y(point.value)} r="9" fill="transparent" tabIndex={0}
            aria-label={`${kst.format(new Date(point.time * 1000))} KST, ${isP95 ? point.value.toFixed(0) : point.value.toFixed(2)} ${unit}${point.state ? `, ${point.state}` : ''}`}
            onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(index)} onBlur={() => setHover(null)} />)}
          {active?.value !== null && active !== null && <circle className="msa-time-point" cx={x(hover)} cy={y(active.value)} r="4" />}
        </svg>
        {active?.value !== null && active !== null && <div className="msa-time-tooltip" role="tooltip" style={{ left: `${x(hover) / 600 * 100}%`, top: `${y(active.value) / 210 * 100}%`, transform: x(hover) > 420 ? 'translate(-100%, -110%)' : 'translate(0, -110%)' }}>
          <time dateTime={new Date(active.time * 1000).toISOString()}>{kst.format(new Date(active.time * 1000))} KST</time><strong>{isP95 ? active.value.toFixed(0) : active.value.toFixed(2)} {unit}</strong>{active.state && <span>{active.state}</span>}
        </div>}
      </div>
      <div className="msa-time-xaxis"><span>{shortKst.format(new Date(request.window.start * 1000))} KST</span><span>{shortKst.format(new Date(request.window.end * 1000))} KST</span></div>
      {!points.some(point => point.value !== null) && <p className="msa-time-empty">{latest?.state ?? '미수집'}</p>}
      {partial && <p className="msa-time-note">부분 집계 구간 있음: 누락된 서비스는 합계·최댓값에 포함되지 않았습니다.</p>}
    </>}
  </article>;
}
