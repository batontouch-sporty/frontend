import React from 'react';

export const finiteSample = raw => typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))
  ? Number(raw) : null;

export function classifyUp(values) {
  if (!values.length || values.some(value => value !== 0 && value !== 1)) return 'missing';
  if (values.every(value => value === 1)) return 'up';
  if (values.every(value => value === 0)) return 'down';
  return 'partial';
}

export const statusLabels = { up: '수집 정상', down: '수집 실패', partial: '일부 실패', missing: '미수집' };
const statusColors = { up: '#9fc222', down: '#be3d3d', partial: '#cf8b2b', missing: '#89929e' };
const codes = ['2xx', '3xx', '4xx', '5xx'];
const codeColors = { '2xx': '#9fc222', '3xx': '#596aa6', '4xx': '#cf8b2b', '5xx': '#be3d3d' };
const kst = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

function serviceSample(request, id) {
  if (request?.kind !== 'success') return null;
  return request.data.find(item => item.metric?.application === id) ?? null;
}

function requestState(request, status) {
  if (request?.kind === 'loading') return '조회 중';
  if (request?.kind === 'error') return '조회 실패';
  if (status === 'missing') return '미수집';
  if (status === 'down') return '수집 실패';
  return null;
}

export function StatusDonut({ services, statuses, instantKind }) {
  const counts = Object.keys(statusLabels).map(kind => ({ kind, count: statuses.filter(value => value === kind).length }));
  const up = counts[0].count;
  let offset = 0;
  return <article className="panel msa-viz-card" aria-label="전체 5개 서비스 수집 상태 도넛">
    <h3 className="panel-title">전체 5개 서비스 수집 상태</h3>
    <p className="panel-sub">Prometheus 수집 결과 · 선택 서비스와 무관한 전체 집계</p>
    {instantKind !== 'success' ? <p role={instantKind === 'error' ? 'alert' : 'status'} className="msa-viz-message">{instantKind === 'error' ? '조회 실패' : '조회 중'}</p> : <>
      <div className="msa-donut-layout">
        <div className="msa-donut" role="img" aria-label={counts.map(({ kind, count }) => `${statusLabels[kind]} ${count}개`).join(', ')}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="45" fill="none" stroke="#e8edf0" strokeWidth="15" />
            {counts.filter(item => item.count).map(({ kind, count }) => {
              const circle = <circle key={kind} cx="60" cy="60" r="45" fill="none" stroke={statusColors[kind]} strokeWidth="15"
                strokeDasharray={`${count / services.length * 282.743} 282.743`} strokeDashoffset={-offset / services.length * 282.743} transform="rotate(-90 60 60)" />;
              offset += count;
              return circle;
            })}
          </svg>
          <div className="msa-donut-center"><strong>{up} / {services.length}</strong><span>수집 정상</span></div>
        </div>
        <ul className="msa-viz-legend">{counts.map(({ kind, count }) => <li key={kind}><span className="msa-legend-swatch" style={{ backgroundColor: statusColors[kind] }} />{statusLabels[kind]} <strong>{count}</strong></li>)}</ul>
      </div>
      <p className="msa-viz-note">수집 성공은 업무 API의 정상 작동을 보장하지 않습니다.</p>
    </>}
  </article>;
}

export function P95Bars({ services, selected, statuses, p95, rps }) {
  const entries = services.filter(([id]) => selected === 'all' || selected === id).map(([id]) => {
    const state = requestState(p95, statuses[id]) ?? requestState(rps, statuses[id]);
    const traffic = finiteSample(serviceSample(rps, id)?.value?.[1]);
    const raw = serviceSample(p95, id)?.value?.[1];
    const parsed = finiteSample(raw);
    const value = parsed !== null && parsed >= 0 ? parsed : null;
    return { id, value: state || traffic === 0 ? null : value, label: state ?? (traffic === 0 ? '요청 없음' : raw != null && value === null ? '비유한 값' : value === null ? '미수집' : `${(value * 1000).toFixed(0)} ms`) };
  }).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const max = Math.max(0, ...entries.map(item => item.value ?? 0));
  return <article className="panel msa-viz-card" aria-label="서비스별 P95 응답시간">
    <h3 className="panel-title">서비스별 P95 응답시간</h3><p className="panel-sub">최근 5분 · Actuator 제외 · 높은 순 · ms</p>
    <div className="msa-viz-rows">{entries.map(({ id, value, label }) => <div className="msa-viz-row" key={id}>
      <span className="msa-viz-name">{id}</span><div className="msa-viz-track" aria-hidden="true">{value !== null && <span className="msa-viz-fill" style={{ width: `${max ? value / max * 100 : 0}%` }} />}</div><strong>{label}</strong>
    </div>)}</div>
  </article>;
}

export function HttpStatusBars({ services, selected, statuses, distribution, rps }) {
  const rows = services.filter(([id]) => selected === 'all' || selected === id).map(([id]) => {
    const state = requestState(distribution, statuses[id]) ?? requestState(rps, statuses[id]);
    const total = finiteSample(serviceSample(rps, id)?.value?.[1]);
    const buckets = Object.fromEntries(codes.map(code => [code, 0]));
    let observed = false;
    let invalid = false;
    if (distribution?.kind === 'success') distribution.data.filter(item => item.metric?.application === id).forEach(item => {
      const code = /^[2345]\d\d$/.test(item.metric?.status ?? '') ? `${item.metric.status[0]}xx` : null;
      const value = finiteSample(item.value?.[1]);
      if (!code || value === null || value < 0) { invalid = true; return; }
      buckets[code] += value;
      observed = true;
    });
    const classified = codes.reduce((sum, code) => sum + buckets[code], 0);
    const remainder = total !== null ? Math.max(0, total - classified) : 0;
    const mismatch = total !== null && Math.abs(total - classified) > Math.max(0.001, total * 0.01);
    return { id, state, total, buckets, classified, remainder, mismatch, invalid, observed };
  });
  return <article className="panel msa-viz-card" aria-label="서비스별 HTTP 상태 코드 분포">
    <h3 className="panel-title">HTTP 상태 코드별 요청량</h3><p className="panel-sub">최근 5분 평균 RPS · Actuator 제외 · 4xx는 클라이언트 응답</p>
    <ul className="msa-viz-legend msa-code-legend">{codes.map(code => <li key={code}><span className="msa-legend-swatch" style={{ backgroundColor: codeColors[code] }} />{code}</li>)}</ul>
    <div className="msa-http-rows">{rows.map(row => <div className="msa-http-row" key={row.id}>
      <div className="msa-http-heading"><strong>{row.id}</strong><span>{row.state ?? (row.total === null ? '미수집' : row.total === 0 ? '요청 없음 · 0.00 RPS' : `${row.total.toFixed(2)} RPS`)}</span></div>
      {row.total !== null && row.total > 0 && !row.state && <>
        <div className="msa-http-track" role="img" aria-label={`${row.id}: ${codes.map(code => `${code} ${row.buckets[code].toFixed(2)} RPS`).join(', ')}`}>
          {codes.map(code => row.buckets[code] > 0 && <span key={code} style={{ width: `${Math.min(100, row.buckets[code] / row.total * 100)}%`, backgroundColor: codeColors[code] }} />)}
          {row.remainder > 0 && <span className="msa-http-unclassified" style={{ width: `${Math.min(100, row.remainder / row.total * 100)}%` }} />}
        </div>
        <div className="msa-http-values">{codes.map(code => <span key={code}>{code} {row.buckets[code].toFixed(2)} RPS · {(row.buckets[code] / row.total * 100).toFixed(1)}%</span>)}</div>
        {(row.mismatch || row.invalid || !row.observed) && <p className="msa-viz-note">분류 합계 {row.classified.toFixed(2)} / 전체 {row.total.toFixed(2)} RPS · 미분류 응답 또는 레이블 확인 필요</p>}
      </>}
      {row.total === 0 && row.classified > 0 && !row.state && <p className="msa-viz-note">전체 0.00 RPS와 분류 합계 {row.classified.toFixed(2)} RPS가 일치하지 않습니다. 수집 시각과 레이블을 확인해 주세요.</p>}
      {row.total === null && !row.state && <p className="msa-viz-note">전체 요청량 미수집</p>}
    </div>)}</div>
  </article>;
}

export function ResourceGauges({ services, selected, statuses, cpu, heap, heapUsed, heapMax }) {
  const rows = services.filter(([id]) => selected === 'all' || selected === id).map(([id]) => {
    const rawCpu = finiteSample(serviceSample(cpu, id)?.value?.[1]);
    const cpuValue = rawCpu !== null && rawCpu >= 0 ? rawCpu : null;
    const rawHeap = finiteSample(serviceSample(heap, id)?.value?.[1]);
    const heapValue = rawHeap !== null && rawHeap >= 0 ? rawHeap : null;
    const used = heapUsed?.kind === 'success' ? heapUsed.data.filter(item => item.metric?.application === id) : [];
    const maximum = heapMax?.kind === 'success' ? heapMax.data.filter(item => item.metric?.application === id) : [];
    const maximumByInstance = new Map();
    maximum.forEach(item => {
      const key = item.metric?.instance ?? '';
      const limit = finiteSample(item.value?.[1]);
      const previous = maximumByInstance.get(key);
      maximumByInstance.set(key, limit > 0 && (previous === undefined || previous > 0) ? (previous ?? 0) + limit : null);
    });
    const ratios = used.map(item => {
      const current = finiteSample(item.value?.[1]);
      const limit = maximumByInstance.get(item.metric?.instance ?? '');
      return current !== null && current >= 0 && limit > 0 ? current / limit : null;
    });
    const heapRatio = used.length && ratios.every(value => value !== null) ? Math.max(...ratios) : null;
    const ratioState = heapUsed?.kind === 'error' || heapMax?.kind === 'error' ? '조회 실패'
      : heapUsed?.kind === 'loading' || heapMax?.kind === 'loading' ? '조회 중' : null;
    return { id, cpuValue, heapValue, heapRatio, ratioState };
  });
  return <article className="panel msa-viz-card" aria-label="서비스별 CPU와 Heap 사용량">
    <h3 className="panel-title">CPU / Heap 사용 현황</h3><p className="panel-sub">CPU: 인스턴스 최대 · Heap MiB: 서비스 합계 · Heap %: 인스턴스 최대</p>
    <div className="msa-resource-rows">{rows.map(({ id, cpuValue, heapValue, heapRatio, ratioState }) => {
      const cpuState = requestState(cpu, statuses[id]);
      const heapState = requestState(heap, statuses[id]);
      return <div className="msa-resource-row" key={id}><strong>{id}</strong>
        <div className="msa-gauge-line"><span>CPU</span><div className="msa-viz-track" aria-hidden="true">{cpuValue !== null && !cpuState && <span className="msa-viz-fill" style={{ width: `${Math.min(100, Math.max(0, cpuValue * 100))}%` }} />}</div><span>{cpuState ?? (cpuValue === null ? '미수집' : `${(cpuValue * 100).toFixed(1)}%`)}</span></div>
        <div className="msa-gauge-line"><span>Heap</span><div className="msa-viz-track" aria-hidden="true">{heapRatio !== null && !heapState && !ratioState && <span className="msa-viz-fill" style={{ width: `${Math.min(100, Math.max(0, heapRatio * 100))}%` }} />}</div><span>{heapState ?? (heapValue === null ? '미수집' : `${(heapValue / 1048576).toFixed(1)} MiB · ${ratioState ?? (heapRatio === null ? '계산 불가' : `${(heapRatio * 100).toFixed(1)}%`)}`)}</span></div>
      </div>;
    })}</div>
  </article>;
}

export function buildHeatmap(data, services, window) {
  const { start, end, step } = window;
  if (![start, end, step].every(Number.isFinite) || step <= 0) return [];
  const times = Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, index) => start + index * step);
  return services.map(([id]) => {
    const columns = times.map(() => []);
    data.filter(item => item.metric?.job === 'sporty-services' && item.metric?.application === id).forEach(item => {
      item.values?.forEach(([time, raw]) => {
        const index = Math.round((time - start) / step);
        if (index >= 0 && index < times.length && Math.abs(times[index] - time) < step / 2) columns[index].push(finiteSample(raw));
      });
    });
    return { id, cells: columns.map(classifyUp) };
  });
}

export function StatusHeatmap({ services, history, window }) {
  if (history.kind !== 'success' || !window) return <article className="panel msa-viz-card"><h3 className="panel-title">서비스 수집 상태 히트맵</h3><p role={history.kind === 'error' ? 'alert' : 'status'}>{history.kind === 'error' ? '시계열 조회 실패' : '조회 중'}</p></article>;
  const rows = buildHeatmap(history.data, services, window);
  const times = rows[0]?.cells.map((_, index) => window.start + index * window.step) ?? [];
  return <article className="panel msa-viz-card msa-heatmap-card" aria-label="전체 5개 서비스 수집 상태 히트맵">
    <h3 className="panel-title">전체 서비스 수집 상태 히트맵</h3><p className="panel-sub">시간별 Prometheus 수집 결과 · KST · 빈 구간은 미수집</p>
    <ul className="msa-viz-legend">{Object.entries(statusLabels).map(([kind, label]) => <li key={kind}><span className="msa-legend-swatch" style={{ backgroundColor: statusColors[kind] }} />{label}</li>)}</ul>
    <div className="msa-heatmap-scroll" tabIndex={0} aria-label="서비스별 수집 상태 시간표, 가로 스크롤 가능"><div className="msa-heatmap-grid" style={{ '--msa-heat-columns': times.length }}>
      <div className="msa-heat-label">서비스 / 시각</div>{times.map((time, index) => <time className="msa-heat-time" key={index} dateTime={new Date(time * 1000).toISOString()} title={kst.format(new Date(time * 1000)) + ' KST'}>{index % Math.max(1, Math.floor(times.length / 6)) === 0 ? kst.format(new Date(time * 1000)) : ''}</time>)}
      {rows.map(row => <React.Fragment key={row.id}><strong className="msa-heat-label">{row.id}</strong>{row.cells.map((kind, index) => <span className={`msa-heat-cell msa-heat-${kind}`} key={index} tabIndex={0} role="img" aria-label={`${row.id}, ${kst.format(new Date(times[index] * 1000))} KST, ${statusLabels[kind]}`} title={`${row.id} · ${kst.format(new Date(times[index] * 1000))} KST · ${statusLabels[kind]}`} />)}</React.Fragment>)}
    </div></div>
  </article>;
}
