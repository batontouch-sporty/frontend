import { useEffect, useState } from 'react';
import { queryInstant, queryRange } from '../api/adminApi';

const services = [
  ['user-service', '회원 · 인증'],
  ['match-service', '매치 · 참가'],
  ['facility-service', '시설 정보'],
  ['ai-service', 'AI 검색 · 추천'],
  ['notification-service', '알림'],
];

const tabs = [
  ['overview', '서비스 개요'],
  ['feign', 'Feign · CB'],
  ['kafka', 'Kafka'],
  ['jvm', 'JVM · 리소스'],
  ['domain', '도메인 · AI'],
];

const ranges = { '15m': 900, '1h': 3600, '6h': 21600, '24h': 86400 };
const rangeLabels = { '15m': '최근 15분', '1h': '최근 1시간', '6h': '최근 6시간', '24h': '최근 24시간' };
const timeFormatter = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const unlinked = '미연동';

const serviceMetric = item => item.metric?.job === 'sporty-services'
  && services.some(([id]) => item.metric.application === id);
const serviceSeries = (data, selected) => data.filter(item => serviceMetric(item)
  && (selected === 'all' || item.metric.application === selected));
const metricQueries = {
  rps: 'sum by (application) (rate(http_server_requests_seconds_count{job="sporty-services",uri!~"/actuator.*"}[5m]))',
  p95: 'histogram_quantile(0.95, sum by (application, le) (rate(http_server_requests_seconds_bucket{job="sporty-services",uri!~"/actuator.*"}[5m])))',
  errors: '(sum by (application) (rate(http_server_requests_seconds_count{job="sporty-services",uri!~"/actuator.*",status=~"5.."}[5m])) or on (application) (0 * sum by (application) (rate(http_server_requests_seconds_count{job="sporty-services",uri!~"/actuator.*"}[5m])))) / sum by (application) (rate(http_server_requests_seconds_count{job="sporty-services",uri!~"/actuator.*"}[5m]))',
  heap: 'sum by (application) (jvm_memory_used_bytes{job="sporty-services",area="heap"})',
  cpu: 'max by (application) (process_cpu_usage{job="sporty-services"})',
  gc: 'sum by (application) (rate(jvm_gc_pause_seconds_count{job="sporty-services"}[5m]))',
  threads: 'sum by (application) (jvm_threads_live_threads{job="sporty-services"})',
};

// Prometheus 설정의 application 레이블로 비즈니스 서비스를 식별한다.
const sampleNumber = raw => typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))
  ? Number(raw) : null;

export function statusFromUp(result, serviceId) {
  const samples = result.filter(item => serviceMetric(item) && item.metric.application === serviceId)
    .map(item => sampleNumber(item.value?.[1])).filter(value => value === 0 || value === 1);
  if (samples.length === 0) return 'missing';
  if (samples.every(value => value === 0)) return 'down';
  if (samples.some(value => value === 0)) return 'partial';
  return samples.every(value => value === 1) ? 'up' : 'missing';
}

function useUpMetrics(sessionSignal, range, revision) {
  const [instant, setInstant] = useState({ kind: 'loading' });
  const [history, setHistory] = useState({ kind: 'loading' });
  const [updated, setUpdated] = useState(null);
  const [metrics, setMetrics] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    sessionSignal?.addEventListener('abort', abort);
    if (sessionSignal?.aborted) abort();
    setInstant({ kind: 'loading' });
    setHistory({ kind: 'loading' });
    setUpdated(null);
    setMetrics(Object.fromEntries(Object.keys(metricQueries).map(key => [key, { kind: 'loading' }])));
    const end = Math.floor(Date.now() / 1000);
    const step = range === '24h' ? 300 : 60;
    if (!controller.signal.aborted) {
      queryInstant({ query: 'up', signal: controller.signal })
        .then(data => {
          if (!controller.signal.aborted) {
            setInstant({ kind: 'success', data });
            setUpdated(new Date());
          }
        })
        .catch(() => { if (!controller.signal.aborted) setInstant({ kind: 'error' }); });
      queryRange({ query: 'up', start: end - ranges[range], end, step, signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setHistory({ kind: 'success', data }); })
        .catch(() => { if (!controller.signal.aborted) setHistory({ kind: 'error' }); });
      Object.entries(metricQueries).forEach(([key, query]) => {
        queryInstant({ query, signal: controller.signal })
          .then(data => { if (!controller.signal.aborted) setMetrics(current => ({ ...current, [key]: { kind: 'success', data } })); })
          .catch(() => { if (!controller.signal.aborted) setMetrics(current => ({ ...current, [key]: { kind: 'error' } })); });
      });
    }
    return () => { sessionSignal?.removeEventListener('abort', abort); controller.abort(); };
  }, [sessionSignal, range, revision]);

  return { instant, history, metrics, updated };
}

function metricValue(request, serviceId) {
  if (!request || request.kind !== 'success') return null;
  // PromQL의 by(application) 집계 결과에는 job 레이블이 남지 않는다.
  const values = request.data.filter(item => services.some(([id]) => item.metric?.application === id)
    && (serviceId === 'all' || item.metric.application === serviceId))
    .map(item => sampleNumber(item.value?.[1])).filter(value => value !== null);
  return values.length ? values : null;
}

function displayedMetric(request, serviceId, key, rpsRequest, upState) {
  if (!request) return '조회 중';
  if (request?.kind === 'loading') return '조회 중';
  if (request?.kind === 'error') return '조회 실패';
  if (upState === 'down') return '서비스 DOWN';
  if (upState === 'missing') return '미수집';
  const http = ['rps', 'p95', 'errors'].includes(key);
  const rps = http && key !== 'rps' ? metricValue(rpsRequest, serviceId) : null;
  if (rps && rps.every(value => value === 0)) return '요청 없음';
  const values = metricValue(request, serviceId);
  if (!values) return http ? '데이터 없음' : '미수집';
  const value = key === 'rps' || key === 'heap' || key === 'gc' || key === 'threads'
    ? values.reduce((sum, item) => sum + item, 0) : Math.max(...values);
  if (key === 'heap') return `${(value / 1024 / 1024).toFixed(1)} MiB`;
  if (key === 'p95') return `${(value * 1000).toFixed(0)} ms`;
  if (key === 'cpu' || key === 'errors') return `${(value * 100).toFixed(1)}%`;
  if (key === 'gc') return `${value.toFixed(2)} /s`;
  if (key === 'threads') return `${Math.round(value)}`;
  return `${value.toFixed(2)} RPS`;
}

function Status({ kind }) {
  const names = { up: 'UP', down: 'DOWN', partial: '일부 DOWN', missing: '미수집', loading: '조회 중', error: '조회 실패' };
  return <span className={`status ${kind}`}>{names[kind]}</span>;
}

function Kpi({ label, value, unit, foot, icon, tone = '' }) {
  return <article className={`kpi ${tone}`}>
    <div className="kpi-head"><span>{label}</span><span className="kpi-icon" aria-hidden="true">{icon}</span></div>
    <div className="kpi-value">{value}{unit && <small>{unit}</small>}</div>
    <div className="kpi-foot">{foot}</div>
  </article>;
}

function EmptyMetric({ title, description, kind = 'missing' }) {
  return <div className="state-box" role={kind === 'error' ? 'alert' : undefined}>
    <div><span className="state-illustration" aria-hidden="true">{kind === 'error' ? '!' : kind === 'loading' ? '◌' : '∅'}</span>
      <h3>{title}</h3><p>{description}</p></div>
  </div>;
}

function UpChart({ data, selected }) {
  const series = serviceSeries(data, selected);
  if (series.length === 0) return <EmptyMetric title="서비스 시계열 미수집" description="선택한 서비스의 up 시계열이 없습니다. 타깃 부재를 DOWN이나 0으로 표시하지 않습니다." />;
  const colors = ['#141a22', '#15803d', '#9a5b00', '#5b6675', '#596aa6'];
  const allTimes = series.flatMap(item => item.values
    .filter(([time, value]) => Number.isFinite(time) && Number.isFinite(Number(value)))
    .map(([time]) => time));
  if (!allTimes.length) return <EmptyMetric title="데이터 없음" description="수집된 서비스 시계열에 표시 가능한 값이 없습니다." />;
  const first = Math.min(...allTimes);
  const last = Math.max(...allTimes);
  const paths = series.map((item, index) => {
    const finite = item.values.filter(([time, value]) => Number.isFinite(time) && Number.isFinite(Number(value)));
    if (finite.length === 0) return null;
    let connected = false;
    const path = item.values.map(([time, raw]) => {
      const value = Number(raw);
      if (!Number.isFinite(time) || !Number.isFinite(value)) { connected = false; return ''; }
      const x = last === first ? 300 : 6 + (time - first) / (last - first) * 588;
      const y = 170 - Math.max(0, Math.min(1, value)) * 135;
      const point = `${x.toFixed(1)} ${y.toFixed(1)}`;
      const command = `${connected ? 'L' : 'M'}${point}`;
      connected = true;
      return command;
    }).filter(Boolean).join(' ');
    return { key: `${item.metric.application}-${index}`, name: item.metric.application, color: colors[index % colors.length], path };
  }).filter(Boolean);
  if (paths.length === 0) return <EmptyMetric title="데이터 없음" description="수집된 서비스 시계열에 표시 가능한 값이 없습니다." />;
  return <>
    <svg className="chart" viewBox="0 0 600 180" preserveAspectRatio="none" role="img" aria-label="서비스별 UP 상태 추이, 1은 UP, 0은 DOWN">
      {[35, 102, 170].map(y => <line className="chart-grid" key={y} x1="0" x2="600" y1={y} y2={y} />)}
      {paths.map(item => <path key={item.key} d={item.path} fill="none" stroke={item.color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
    </svg>
    <div className="chart-labels"><span>{timeFormatter.format(new Date(first * 1000))}</span><span>1 UP · 0 DOWN</span><span>{timeFormatter.format(new Date(last * 1000))}</span></div>
    <ul className="msa-chart-legend">{paths.map(item => <li key={item.key}><span style={{ background: item.color }} />{item.name}</li>)}</ul>
  </>;
}

function Overview({ instant, history, selected }) {
  if (instant.kind === 'loading' || history.kind === 'loading') return <EmptyMetric kind="loading" title="지표를 불러오는 중" description="서비스 상태와 시계열을 조회하고 있습니다." />;
  if (instant.kind === 'error' || history.kind === 'error') return <EmptyMetric kind="error" title="지표를 조회하지 못했습니다" description="Gateway 또는 Prometheus 연결을 확인한 뒤 새로고침하세요." />;
  const tracked = services.filter(([id]) => selected === 'all' || selected === id)
    .map(([id]) => statusFromUp(instant.data, id));
  return <div className="content-grid">
    <article className="panel chart-card"><div className="chart-header"><div><h3 className="panel-title">서비스 상태 추이</h3><p className="panel-sub">{selected === 'all' ? '전체 서비스' : selected} · 실제 up 시계열</p></div><span className="chart-key">UP / DOWN</span></div><UpChart data={history.data} selected={selected} /></article>
    <article className="panel"><div className="panel-head"><div><h3 className="panel-title">운영 신호</h3><p className="panel-sub">수집 여부와 실제 DOWN을 분리합니다.</p></div><span className="tiny-tag">A30</span></div>
      <dl className="metric-list"><div><dt>UP</dt><dd>{tracked.filter(s => s === 'up').length}<small>수집된 타깃</small></dd></div><div><dt>DOWN / 일부 DOWN</dt><dd>{tracked.filter(s => s === 'down' || s === 'partial').length}<small>up=0 확인</small></dd></div><div><dt>미수집</dt><dd>{tracked.filter(s => s === 'missing').length}<small>DOWN으로 추정하지 않음</small></dd></div></dl>
    </article>
  </div>;
}

const unavailableAreas = {
  feign: ['OpenFeign 호출 시간', 'Circuit Breaker 상태', '호출 관계', 'Feign·Circuit Breaker의 메트릭 이름과 레이블이 아직 실측으로 확인되지 않았습니다.'],
  kafka: ['Consumer Group Lag', '이벤트 처리량', 'DLT 발행', 'Consumer 중단 중 Lag를 관측할 Exporter와 이벤트 계측이 아직 확인되지 않았습니다.'],
  domain: ['도메인 이벤트 추이', '매치·AI 지표', 'Saga 결과', '도메인·AI 기간 메트릭은 미연동입니다. 아래 A28·A29 누적 통계를 확인하세요.'],
};

function UnlinkedArea({ tab }) {
  const [chart, summary, detail, message] = unavailableAreas[tab];
  return <>
    <div className="content-grid">
      <article className="panel chart-card"><div className="chart-header"><div><h3 className="panel-title">{chart}</h3><p className="panel-sub">계측 확인 후 A31 시계열 연결</p></div><span className="chart-key">{unlinked}</span></div><div className="chart-empty"><div><span className="empty-icon" aria-hidden="true">∅</span>메트릭 미연동</div></div></article>
      <article className="panel"><div className="panel-head"><div><h3 className="panel-title">{summary}</h3><p className="panel-sub">실제 데이터 확인 전까지 값을 표시하지 않습니다.</p></div><span className="tiny-tag">미연동</span></div><div className="info-callout"><strong>계측 대기</strong><br />{message}</div></article>
    </div>
    <div className="panel msa-secondary-panel"><h3 className="panel-title">{detail}</h3><p className="panel-sub">해당 지표는 아직 수집되지 않습니다. 메트릭 계측 및 수집 설정을 확인해 주세요.</p><div className="chart-empty"><div><span className="empty-icon" aria-hidden="true">∅</span>데이터 미연동</div></div></div>
  </>;
}

function DetailData({ tab, history, selected }) {
  if (tab === 'jvm') return <p>JVM 지표는 A30 현재 값입니다. 시계열은 연결 후 이곳에 표시합니다.</p>;
  if (tab !== 'overview') return <p>이 영역의 계측이 확인되지 않아 상세 데이터가 없습니다.</p>;
  if (history.kind === 'loading') return <p role="status">시계열을 조회하는 중입니다.</p>;
  if (history.kind === 'error') return <p role="alert">시계열 조회에 실패했습니다.</p>;
  const series = serviceSeries(history.data, selected);
  if (!series.length) return <p>수집된 서비스 시계열이 없습니다.</p>;
  return <div className="scroll-table"><table className="detail-table"><thead><tr><th scope="col">시각 (KST)</th><th scope="col">영역</th><th scope="col">서비스</th><th scope="col">값</th></tr></thead><tbody>
    {series.flatMap((item, seriesIndex) => item.values.slice(-10).map(([timestamp, value], index) => <tr key={`${seriesIndex}-${index}`}><td><time dateTime={new Date(timestamp * 1000).toISOString()}>{timeFormatter.format(new Date(timestamp * 1000))}</time></td><td>서비스 개요</td><td>{item.metric.application}</td><td>{value}</td></tr>))}
  </tbody></table></div>;
}

function JvmArea({ metrics, selected }) {
  const rows = services.filter(([id]) => selected === 'all' || selected === id);
  return <div className="content-grid">
    <article className="panel chart-card"><div className="panel-head"><div><h3 className="panel-title">JVM · 리소스</h3><p className="panel-sub">서비스별 현재 수집 값</p></div><span className="tiny-tag">A30</span></div>
      <div className="scroll-table"><table className="detail-table"><thead><tr><th scope="col">서비스</th><th scope="col">Heap 사용</th><th scope="col">CPU</th><th scope="col">GC 빈도</th><th scope="col">스레드</th></tr></thead><tbody>
        {rows.map(([id]) => <tr key={id}><td>{id}</td><td>{displayedMetric(metrics.heap, id, 'heap')}</td><td>{displayedMetric(metrics.cpu, id, 'cpu')}</td><td>{displayedMetric(metrics.gc, id, 'gc')}</td><td>{displayedMetric(metrics.threads, id, 'threads')}</td></tr>)}
      </tbody></table></div></article>
    <article className="panel"><div className="panel-head"><div><h3 className="panel-title">단위 안내</h3><p className="panel-sub">미수집과 실제 0은 구분합니다.</p></div></div>
      <dl className="metric-list"><div><dt>Heap</dt><dd>MiB</dd></div><div><dt>CPU</dt><dd>%</dd></div><div><dt>GC</dt><dd>회/s</dd></div><div><dt>스레드</dt><dd>개</dd></div></dl></article>
  </div>;
}

export default function MsaMonitoringDashboard({ sessionSignal }) {
  const [range, setRange] = useState('1h');
  const [selected, setSelected] = useState('all');
  const [tab, setTab] = useState('overview');
  const [revision, setRevision] = useState(0);
  const { instant, history, metrics, updated } = useUpMetrics(sessionSignal, range, revision);
  const shown = services.filter(([id]) => selected === 'all' || selected === id);
  const statuses = shown.map(([id]) => instant.kind === 'success' ? statusFromUp(instant.data, id) : instant.kind);
  const upCount = statuses.filter(status => status === 'up').length;
  const missingCount = statuses.filter(status => status === 'missing').length;
  const downCount = statuses.filter(status => status === 'down' || status === 'partial').length;
  const observedCount = upCount + downCount;
  const summary = instant.kind === 'loading' ? '조회 중' : instant.kind === 'error' ? '조회 실패'
    : observedCount === 0 ? '미수집' : `${upCount} / ${observedCount}`;
  const displayHttp = (key, id) => displayedMetric(metrics[key], id, key, metrics.rps,
    instant.kind === 'success' ? (id === 'all' ? (observedCount ? undefined : 'missing') : statusFromUp(instant.data, id)) : instant.kind);

  const selectTab = (next, focus = false) => {
    setTab(next);
    if (focus) document.getElementById(`msa-tab-${next}`)?.focus();
  };
  const tabKeyDown = event => {
    const position = tabs.findIndex(([id]) => id === tab);
    let next;
    if (event.key === 'ArrowRight') next = tabs[(position + 1) % tabs.length][0];
    if (event.key === 'ArrowLeft') next = tabs[(position + tabs.length - 1) % tabs.length][0];
    if (event.key === 'Home') next = tabs[0][0];
    if (event.key === 'End') next = tabs.at(-1)[0];
    if (next) { event.preventDefault(); selectTab(next, true); }
  };

  return <>
    <div className="admin-dashboard-band msa-hero dark"><div className="admin-dashboard-inner">
      <nav className="msa-breadcrumb" aria-label="현재 위치"><a href="/">홈</a> <span aria-hidden="true">/</span> 관리자 <span aria-hidden="true">/</span> MSA 모니터링</nav>
      <div className="msa-hero-main"><div><p className="eyebrow">Sporty MSA Control Center</p><h1>관리자 대시보드</h1><p className="hero-copy">서비스의 상태와 운영 흐름을 한눈에 확인하세요.</p></div>
        <div><div className="hero-controls"><div className="field"><label htmlFor="msa-range">조회 시간</label><select id="msa-range" value={range} onChange={event => setRange(event.target.value)}>{Object.entries(rangeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          <div className="field"><label htmlFor="msa-service">서비스</label><select id="msa-service" value={selected} onChange={event => setSelected(event.target.value)}><option value="all">전체 서비스</option>{services.map(([id]) => <option key={id} value={id}>{id}</option>)}</select></div>
          <button type="button" className="btn btn-lime" onClick={() => setRevision(value => value + 1)}><span aria-hidden="true">↻</span> 새로고침</button></div>
          <div className="updated" aria-live="polite">마지막 조회 · {updated ? timeFormatter.format(updated) : '—'}</div></div>
      </div>
    </div></div>
    <div className="admin-dashboard-inner msa-content">
      <section className="kpi-grid" aria-label="운영 요약">
        <Kpi label="정상 서비스" value={summary} icon="✓" foot={instant.kind === 'success' ? `수집 ${observedCount} · DOWN ${downCount} · 미수집 ${missingCount}` : '서비스 상태 조회'} tone={downCount ? 'is-danger' : missingCount ? 'is-warn' : ''} />
        <Kpi label="전체 요청량" value={displayHttp('rps', selected)} icon="↗" foot="수집된 서비스의 5분 평균 합계" />
        <Kpi label="P95 응답시간" value={displayHttp('p95', selected)} icon="◷" foot="서비스별 P95 중 최대 · ms" />
        <Kpi label="HTTP 5xx" value={displayHttp('errors', selected)} icon="!" foot="서비스별 5xx 오류율 중 최대" />
        <Kpi label="Kafka Lag" value={unlinked} icon="▤" foot="Consumer Lag Exporter 확인 필요" tone="is-muted" />
      </section>
      <section className="section" aria-labelledby="msa-services-title"><div className="section-heading"><div><p className="section-kicker">01 / LIVE OVERVIEW</p><h2 id="msa-services-title">서비스별 상태</h2><p className="section-desc">UP·DOWN·미수집을 분리하고, 선택한 서비스를 강조합니다.</p></div><span className="section-aside">5개 비즈니스 서비스</span></div>
        <div className="panel"><div className="panel-head"><div><h3 className="panel-title">서비스 운영 현황</h3><p className="panel-sub">상태는 Prometheus up, 성능은 HTTP 계측으로 확인합니다.</p></div><span className="tiny-tag">A30</span></div>
          <div className="service-table-wrap"><table className="service-table"><thead><tr><th scope="col">서비스</th><th scope="col">상태</th><th scope="col">요청량</th><th scope="col">P95</th><th scope="col">5xx 오류율</th></tr></thead><tbody>{services.map(([id, type]) => <tr key={id} className={selected === id ? 'selected-row' : ''}><td><span className="service-name">{id}</span><span className="service-type">{type}</span></td><td><Status kind={instant.kind === 'success' ? statusFromUp(instant.data, id) : instant.kind} /></td><td>{displayHttp('rps', id)}</td><td>{displayHttp('p95', id)}</td><td>{displayHttp('errors', id)}</td></tr>)}</tbody></table></div>
          <div className="service-mobile">{services.map(([id, type]) => <div className="service-item" key={id}><div className="service-item-head"><div><span className="service-name">{id}</span><span className="service-type">{type}</span></div><Status kind={instant.kind === 'success' ? statusFromUp(instant.data, id) : instant.kind} /></div><div className="service-item-data"><div><span>요청량</span><strong>{displayHttp('rps', id)}</strong></div><div><span>P95</span><strong>{displayHttp('p95', id)}</strong></div><div><span>5xx</span><strong>{displayHttp('errors', id)}</strong></div></div></div>)}</div>
        </div>
      </section>
      <section className="section" aria-labelledby="msa-metrics-title"><div className="section-heading"><div><p className="section-kicker">02 / METRICS</p><h2 id="msa-metrics-title">상세 모니터링</h2><p className="section-desc">운영 흐름별로 필요한 지표를 살펴봅니다.</p></div><span className="section-aside">{rangeLabels[range]}</span></div>
        <div className="tabs" role="tablist" aria-label="모니터링 영역" onKeyDown={tabKeyDown}>{tabs.map(([id, label]) => <button className="tab" role="tab" type="button" id={`msa-tab-${id}`} key={id} aria-controls="msa-tab-content" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => selectTab(id)}>{label}</button>)}</div>
        <div id="msa-tab-content" role="tabpanel" aria-labelledby={`msa-tab-${tab}`} tabIndex={0}>{tab === 'overview' ? <Overview instant={instant} history={history} selected={selected} /> : tab === 'jvm' ? <JvmArea metrics={metrics} selected={selected} /> : <UnlinkedArea tab={tab} />}</div>
        <details className="details"><summary>상세 데이터 보기 <span className="tiny-tag">A31</span></summary><div className="details-body"><p>선택한 영역의 실제 시계열 응답입니다.</p><DetailData tab={tab} history={history} selected={selected} /></div></details>
      </section>
    </div>
  </>;
}
