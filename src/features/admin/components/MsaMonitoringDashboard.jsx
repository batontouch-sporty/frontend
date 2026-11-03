import { useEffect, useRef, useState } from 'react';
import { queryInstant, queryRange } from '../api/adminApi';
import { classifyUp, finiteSample, StatusDonut, P95Bars, HttpStatusBars, ResourceGauges, StatusHeatmap } from './MonitoringVisualizations';
import { PerformanceChart } from './MonitoringTimeSeries';
import DomainMetrics from './DomainMetrics';
import FeignMetrics from './FeignMetrics';
import KafkaMetrics, { lagKpi } from './KafkaMetrics';

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
const steps = { '15m': 30, '1h': 60, '6h': 300, '24h': 900 };
const rangeLabels = { '15m': '최근 15분', '1h': '최근 1시간', '6h': '최근 6시간', '24h': '최근 24시간' };
const timeFormatter = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const serviceMetric = item => item.metric?.job === 'sporty-services'
  && services.some(([id]) => item.metric.application === id);
const serviceSeries = (data, selected) => data.filter(item => serviceMetric(item)
  && (selected === 'all' || item.metric.application === selected));
const metricQueries = {
  rps: 'sum by (application) (rate(http_server_requests_seconds_count{job="sporty-services",uri!~"/actuator.*"}[5m]))',
  p95: 'histogram_quantile(0.95, sum by (application, le) (rate(http_server_requests_seconds_bucket{job="sporty-services",uri!~"/actuator.*"}[5m])))',
  errors: '(sum by (application) (rate(http_server_requests_seconds_count{job="sporty-services",uri!~"/actuator.*",status=~"5.."}[5m])) or on (application) (0 * sum by (application) (rate(http_server_requests_seconds_count{job="sporty-services",uri!~"/actuator.*"}[5m])))) / sum by (application) (rate(http_server_requests_seconds_count{job="sporty-services",uri!~"/actuator.*"}[5m]))',
  statusCodes: 'sum by (application, status) (rate(http_server_requests_seconds_count{job="sporty-services",uri!~"/actuator.*",status=~"[2345].."}[5m]))',
  heap: 'sum by (application) (jvm_memory_used_bytes{job="sporty-services",area="heap"})',
  heapUsed: 'sum by (application, instance) (jvm_memory_used_bytes{job="sporty-services",area="heap"})',
  heapMax: 'jvm_memory_max_bytes{job="sporty-services",area="heap"}',
  cpu: 'max by (application) (process_cpu_usage{job="sporty-services"})',
  gc: 'sum by (application) (rate(jvm_gc_pause_seconds_count{job="sporty-services"}[5m]))',
  threads: 'sum by (application) (jvm_threads_live_threads{job="sporty-services"})',
};
const domainQueries = range => ({
  saga: `sum by (outcome) (increase(sporty_withdrawal_saga_results_total{job="sporty-services",application="user-service",outcome=~"success|rejected|timed_out"}[${range}]))`,
  late: `sum by (outcome) (increase(sporty_withdrawal_saga_late_results_total{job="sporty-services",application="user-service",outcome=~"cleaned|rejected"}[${range}]))`,
  aiCount: `sum by (type, outcome) (increase(ai_request_seconds_count{job="sporty-services",application="ai-service",type=~"search|draft|recommend",outcome=~"success|fallback|rejected|error"}[${range}]))`,
  aiSum: `sum by (type, outcome) (increase(ai_request_seconds_sum{job="sporty-services",application="ai-service",type=~"search|draft|recommend",outcome=~"success|fallback|rejected|error"}[${range}]))`,
});
const aiTrendQueries = range => {
  const rateWindow = range === '24h' ? '15m' : '5m';
  return {
    count: `sum(rate(ai_request_seconds_count{job="sporty-services",application="ai-service",type=~"search|draft|recommend",outcome=~"success|fallback|rejected|error"}[${rateWindow}]))`,
    sum: `sum(rate(ai_request_seconds_sum{job="sporty-services",application="ai-service",type=~"search|draft|recommend",outcome=~"success|fallback|rejected|error"}[${rateWindow}]))`,
  };
};
const feignClient = 'com[.]example[.]sporty[.]match[.]integration[.](MemberClient|FacilityClient)';
const breakerName = 'MemberClientgetLong|MemberClientprofilesList|FacilityClientgetLong';
const feignQueries = range => ({
  count: `sum by (clientName, http_status_code) (increase(sporty_feign_http_requests_seconds_count{job="sporty-services",application="match-service",clientName=~"${feignClient}"}[${range}]))`,
  sum: `sum by (clientName) (increase(sporty_feign_http_requests_seconds_sum{job="sporty-services",application="match-service",clientName=~"${feignClient}"}[${range}]))`,
  state: `resilience4j_circuitbreaker_state{job="sporty-services",application="match-service",name=~"${breakerName}"} == 1`,
  failureRate: `resilience4j_circuitbreaker_failure_rate{job="sporty-services",application="match-service",name=~"${breakerName}"}`,
});
const kafkaLagQuery = 'sum by (consumergroup, topic) (kafka_consumergroup_lag{job="kafka-exporter"})';
const kafkaQueries = range => ({
  processedCount: `sum by (topic, group) (increase(sporty_kafka_records_processed_total{job="sporty-services",application="notification-service",group="notification-service"}[${range}]))`,
  processedTrend: 'sum by (topic, group) (rate(sporty_kafka_records_processed_total{job="sporty-services",application="notification-service",group="notification-service"}[5m]))',
  dltCount: `sum by (topic) (increase(sporty_kafka_dlt_published_total{job="sporty-services",application="notification-service"}[${range}]))`,
  dltTrend: 'sum by (topic) (rate(sporty_kafka_dlt_published_total{job="sporty-services",application="notification-service"}[5m]))',
  maxLag: 'max by (consumergroup, topic) (kafka_consumergroup_lag{job="kafka-exporter"})',
});

// Prometheus 설정의 application 레이블로 비즈니스 서비스를 식별한다.
const sampleNumber = finiteSample;

export function statusFromUp(result, serviceId) {
  const samples = result.filter(item => serviceMetric(item) && item.metric.application === serviceId)
    .map(item => sampleNumber(item.value?.[1]));
  return classifyUp(samples);
}

function useUpMetrics(sessionSignal, range, revision, tab) {
  const [instant, setInstant] = useState({ kind: 'loading' });
  const [history, setHistory] = useState({ kind: 'loading' });
  const [performance, setPerformance] = useState({ rps: { kind: 'loading' }, p95: { kind: 'loading' } });
  const [updated, setUpdated] = useState(null);
  const [metrics, setMetrics] = useState({});
  const [domain, setDomain] = useState({});
  const [feign, setFeign] = useState({});
  const [kafkaLag, setKafkaLag] = useState({ kind: 'loading' });
  const [exporter, setExporter] = useState({ kind: 'loading' });
  const [kafkaBrokers, setKafkaBrokers] = useState({ kind: 'loading' });
  const [kafka, setKafka] = useState({});
  const [completed, setCompleted] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const scope = useRef({ sessionSignal, range, tab });
  const interrupted = useRef(false);
  const currentData = useRef(null);
  currentData.current = { instant, history, performance, metrics, domain, feign, kafkaLag, exporter, kafkaBrokers, kafka };
  const sessionChanged = scope.current.sessionSignal !== sessionSignal;
  const rangeChanged = scope.current.range !== range || scope.current.tab !== tab;

  useEffect(() => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    let inFlight = false;
    let failed = false;
    const sameSession = scope.current.sessionSignal === sessionSignal;
    const sameScope = sameSession && scope.current.range === range && scope.current.tab === tab;
    const { instant: previousInstant, history: previousHistory, performance: previousPerformance, metrics: previousMetrics, domain: previousDomain, feign: previousFeign, kafkaLag: previousLag, exporter: previousExporter, kafkaBrokers: previousBrokers, kafka: previousKafka } = currentData.current;
    const retained = sameSession && (previousInstant.kind === 'success' || previousLag.kind === 'success' || previousExporter.kind === 'success' || previousBrokers.kind === 'success' || Object.values(previousMetrics).some(item => item.kind === 'success')
      || (sameScope && (previousHistory.kind === 'success' || previousPerformance.rps.kind === 'success' || previousPerformance.p95.kind === 'success'
        || Object.values(previousDomain).some(item => item.kind === 'success')
        || Object.values(previousFeign).some(item => item.kind === 'success')
        || Object.values(previousKafka).some(item => item.kind === 'success'))));
    scope.current = { sessionSignal, range, tab };
    if (!sameSession) interrupted.current = false;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && inFlight) { interrupted.current = true; abort(); }
    };
    sessionSignal?.addEventListener('abort', abort);
    document.addEventListener('visibilitychange', onVisibility);
    if (sessionSignal?.aborted) abort();
    const startedAt = Date.now();
    setInstant(current => sameSession && current.kind === 'success' ? current : { kind: 'loading' });
    setHistory(current => tab === 'overview' ? sameScope && current.kind === 'success' ? current : { kind: 'loading' } : { kind: 'idle' });
    setPerformance(current => Object.fromEntries(['rps', 'p95'].map(key => [key, tab === 'overview'
      ? sameScope && current[key]?.kind === 'success' ? current[key] : { kind: 'loading' } : { kind: 'idle' }])));
    setDomain(current => tab === 'domain' ? Object.fromEntries(['saga', 'late', 'aiCount', 'aiSum', 'trendCount', 'trendSum'].map(key => [key,
      sameScope && current[key]?.kind === 'success' ? current[key] : { kind: 'loading' }])) : {});
    setFeign(current => tab === 'feign' ? Object.fromEntries(['calls', 'state', 'failureRate'].map(key => [key,
      sameScope && current[key]?.kind === 'success' ? current[key] : { kind: 'loading' }])) : {});
    setKafka(current => tab === 'kafka' ? Object.fromEntries(['processedCount', 'processedTrend', 'dltCount', 'dltTrend', 'maxLag'].map(key => [key,
      sameScope && current[key]?.kind === 'success' ? current[key] : { kind: 'loading' }])) : {});
    setKafkaLag(current => sameSession && current.kind === 'success' ? current : { kind: 'loading' });
    setExporter(current => sameSession && current.kind === 'success' ? current : { kind: 'loading' });
    setKafkaBrokers(current => sameSession && current.kind === 'success' ? current : { kind: 'loading' });
    setCompleted(null);
    setRefreshing(retained);
    setRefreshFailed(false);
    if (!sameSession) setUpdated(null);
    const instantQueries = Object.entries(metricQueries).filter(([key]) => tab === 'jvm' || !['gc', 'threads'].includes(key));
    setMetrics(current => Object.fromEntries(instantQueries.map(([key]) => [key,
      sameSession && current[key]?.kind === 'success' ? current[key] : { kind: 'loading' }])));
    const end = Math.floor(startedAt / 1000);
    const window = { start: end - ranges[range], end, step: steps[range] };
    const pending = [];
    if (!controller.signal.aborted && document.visibilityState === 'visible') {
      inFlight = true;
      pending.push(queryInstant({ query: 'up', signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setInstant({ kind: 'success', data }); })
        .catch(() => { if (!controller.signal.aborted) { failed = true; setInstant(current => current.kind === 'success' ? current : { kind: 'error' }); } }));
      instantQueries.forEach(([key, query]) => {
        pending.push(queryInstant({ query, signal: controller.signal })
          .then(data => { if (!controller.signal.aborted) setMetrics(current => ({ ...current, [key]: { kind: 'success', data } })); })
          .catch(() => { if (!controller.signal.aborted) { failed = true; setMetrics(current => ({ ...current, [key]: current[key]?.kind === 'success' ? current[key] : { kind: 'error' } })); } }));
      });
      [[setKafkaLag, kafkaLagQuery], [setExporter, 'up{job="kafka-exporter"}'], [setKafkaBrokers, 'kafka_brokers{job="kafka-exporter"}']].forEach(([setRequest, query]) => {
        pending.push(queryInstant({ query, signal: controller.signal })
          .then(data => { if (!controller.signal.aborted) setRequest({ kind: 'success', data }); })
          .catch(() => { if (!controller.signal.aborted) { failed = true;
            setRequest(current => current.kind === 'success' ? current : { kind: 'error' });
          } }));
      });
      if (tab === 'overview') {
        pending.push(queryRange({ query: 'up', ...window, signal: controller.signal })
          .then(data => { if (!controller.signal.aborted) setHistory({ kind: 'success', data, window }); })
          .catch(() => { if (!controller.signal.aborted) { failed = true; setHistory(current => current.kind === 'success' ? current : { kind: 'error' }); } }));
        ['rps', 'p95'].forEach(key => {
          pending.push(queryRange({ query: metricQueries[key], ...window, signal: controller.signal })
            .then(data => { if (!controller.signal.aborted) setPerformance(current => ({ ...current, [key]: { kind: 'success', data, window } })); })
            .catch(() => { if (!controller.signal.aborted) { failed = true; setPerformance(current => ({ ...current, [key]: current[key]?.kind === 'success' ? current[key] : { kind: 'error' } })); } }));
        });
      }
      if (tab === 'domain') {
        const { aiCount, aiSum, ...sagaQueries } = domainQueries(`${ranges[range]}s`);
        Object.entries(sagaQueries).forEach(([key, query]) => {
          pending.push(queryInstant({ query, signal: controller.signal })
            .then(data => { if (!controller.signal.aborted) setDomain(current => ({ ...current, [key]: { kind: 'success', data } })); })
            .catch(() => { if (!controller.signal.aborted) { failed = true; setDomain(current => ({ ...current, [key]: current[key]?.kind === 'success' ? current[key] : { kind: 'error' } })); } }));
        });
        pending.push(Promise.all([
          queryInstant({ query: aiCount, time: end, signal: controller.signal }),
          queryInstant({ query: aiSum, time: end, signal: controller.signal }),
        ]).then(([count, sum]) => { if (!controller.signal.aborted) setDomain(current => ({ ...current,
          aiCount: { kind: 'success', data: count }, aiSum: { kind: 'success', data: sum } })); })
          .catch(() => { if (!controller.signal.aborted) { failed = true; setDomain(current => ({ ...current,
            aiCount: current.aiCount?.kind === 'success' && current.aiSum?.kind === 'success' ? current.aiCount : { kind: 'error' },
            aiSum: current.aiCount?.kind === 'success' && current.aiSum?.kind === 'success' ? current.aiSum : { kind: 'error' },
          })); } }));
        pending.push(Promise.all([
          queryRange({ query: aiTrendQueries(range).count, ...window, signal: controller.signal }),
          queryRange({ query: aiTrendQueries(range).sum, ...window, signal: controller.signal }),
        ]).then(([count, sum]) => { if (!controller.signal.aborted) setDomain(current => ({ ...current,
          trendCount: { kind: 'success', data: count, window }, trendSum: { kind: 'success', data: sum, window } })); })
          .catch(() => { if (!controller.signal.aborted) { failed = true; setDomain(current => ({ ...current,
            trendCount: current.trendCount?.kind === 'success' && current.trendSum?.kind === 'success' ? current.trendCount : { kind: 'error' },
            trendSum: current.trendCount?.kind === 'success' && current.trendSum?.kind === 'success' ? current.trendSum : { kind: 'error' },
          })); } }));
      }
      if (tab === 'feign') {
        const { count, sum, state, failureRate } = feignQueries(`${ranges[range]}s`);
        pending.push(Promise.all([
          queryInstant({ query: count, time: end, signal: controller.signal }),
          queryInstant({ query: sum, time: end, signal: controller.signal }),
        ]).then(([counts, sums]) => { if (!controller.signal.aborted) setFeign(current => ({ ...current, calls: { kind: 'success', counts, sums } })); })
          .catch(() => { if (!controller.signal.aborted) { failed = true; setFeign(current => ({ ...current,
            calls: current.calls?.kind === 'success' ? current.calls : { kind: 'error' },
          })); } }));
        [['state', state], ['failureRate', failureRate]].forEach(([key, query]) => {
          pending.push(queryInstant({ query, signal: controller.signal })
            .then(data => { if (!controller.signal.aborted) setFeign(current => ({ ...current, [key]: { kind: 'success', data } })); })
            .catch(() => { if (!controller.signal.aborted) { failed = true; setFeign(current => ({ ...current,
              [key]: current[key]?.kind === 'success' ? current[key] : { kind: 'error' },
            })); } }));
        });
      }
      if (tab === 'kafka') {
        Object.entries(kafkaQueries(`${ranges[range]}s`)).forEach(([key, query]) => {
          const request = key.endsWith('Trend') ? queryRange({ query, ...window, signal: controller.signal })
            : queryInstant({ query, time: end, signal: controller.signal });
          pending.push(request.then(data => { if (!controller.signal.aborted) setKafka(current => ({ ...current, [key]: { kind: 'success', data, ...(key.endsWith('Trend') ? { window } : {}) } })); })
            .catch(() => { if (!controller.signal.aborted) { failed = true; setKafka(current => ({ ...current,
              [key]: current[key]?.kind === 'success' ? current[key] : { kind: 'error' },
            })); } }));
        });
      }
      Promise.allSettled(pending).then(() => {
        inFlight = false;
        if (!controller.signal.aborted) {
          setUpdated(new Date()); setCompleted({ startedAt }); setRefreshing(false); setRefreshFailed(failed && retained);
        }
      });
    }
    return () => { sessionSignal?.removeEventListener('abort', abort); document.removeEventListener('visibilitychange', onVisibility); controller.abort(); };
  }, [sessionSignal, range, revision, tab]);

  return {
    instant: sessionChanged ? { kind: 'loading' } : instant,
    history: sessionChanged || rangeChanged ? { kind: 'loading' } : history,
    performance: sessionChanged || rangeChanged ? { rps: { kind: 'loading' }, p95: { kind: 'loading' } } : performance,
    metrics: sessionChanged ? {} : metrics,
    domain: sessionChanged || rangeChanged ? {} : domain,
    feign: sessionChanged || rangeChanged ? {} : feign,
    kafkaLag: sessionChanged ? { kind: 'loading' } : kafkaLag,
    exporter: sessionChanged ? { kind: 'loading' } : exporter,
    kafkaBrokers: sessionChanged ? { kind: 'loading' } : kafkaBrokers,
    kafka: sessionChanged || rangeChanged ? {} : kafka,
    updated: sessionChanged ? null : updated,
    completed: sessionChanged ? null : completed,
    refreshing, refreshFailed, interrupted,
  };
}

function metricValue(request, serviceId) {
  if (!request || request.kind !== 'success') return null;
  // PromQL의 by(application) 집계 결과에는 job 레이블이 남지 않는다.
  const values = request.data.filter(item => services.some(([id]) => item.metric?.application === id)
    && (serviceId === 'all' || item.metric.application === serviceId))
    .map(item => sampleNumber(item.value?.[1])).filter(value => value !== null);
  return values.length ? values : null;
}

function displayedMetric(request, serviceId, key, rpsRequest, upState, activeServices = []) {
  if (!request) return '조회 중';
  if (request?.kind === 'loading') return '조회 중';
  if (request?.kind === 'error') return '조회 실패';
  if (upState === 'down') return '서비스 DOWN';
  if (upState === 'missing') return '미수집';
  const http = ['rps', 'p95', 'errors'].includes(key);
  if (http && key !== 'rps') {
    const noRequests = serviceId === 'all'
      ? activeServices.length > 0 && activeServices.every(id => {
        const samples = metricValue(rpsRequest, id);
        return samples && samples.every(value => value === 0);
      })
      : metricValue(rpsRequest, serviceId)?.every(value => value === 0);
    if (noRequests) return '요청 없음';
  }
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

function DetailData({ tab, history, selected }) {
  if (tab === 'jvm') return <p>JVM 지표는 A30 현재 값입니다. 시계열은 연결 후 이곳에 표시합니다.</p>;
  if (tab === 'domain') return <p>선택 기간의 Saga·AI 집계와 AI 평균 응답시간 추이는 위 영역에 표시됩니다.</p>;
  if (tab === 'feign') return <p>선택 기간의 Feign HTTP 지표와 현재 Circuit Breaker 상태는 위 영역에 표시됩니다.</p>;
  if (tab === 'kafka') return <p>선택 기간의 처리 성공·DLT 발행과 현재 Consumer Lag는 위 영역에 표시됩니다.</p>;
  if (tab !== 'overview') return <p>이 영역의 계측이 확인되지 않아 상세 데이터가 없습니다.</p>;
  if (history.kind === 'loading' || history.kind === 'idle') return <p role="status">시계열을 조회하는 중입니다.</p>;
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
  const [range, setRange] = useState('15m');
  const [selected, setSelected] = useState('all');
  const [tab, setTab] = useState('overview');
  const [revision, setRevision] = useState(0);
  const [auto, setAuto] = useState(true);
  const { instant, history, performance, metrics, domain, feign, kafkaLag, exporter, kafkaBrokers, kafka, updated, completed, refreshing, refreshFailed, interrupted } = useUpMetrics(sessionSignal, range, revision, tab);
  useEffect(() => {
    if (!auto || !completed || document.visibilityState !== 'visible' || sessionSignal?.aborted) return undefined;
    const timer = window.setTimeout(() => setRevision(value => value + 1), Math.max(0, 30000 - (Date.now() - completed.startedAt)));
    const cancel = () => window.clearTimeout(timer);
    const onVisibility = () => { if (document.visibilityState === 'hidden') cancel(); };
    sessionSignal?.addEventListener('abort', cancel);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { cancel(); sessionSignal?.removeEventListener('abort', cancel); document.removeEventListener('visibilitychange', onVisibility); };
  }, [auto, completed, sessionSignal]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !sessionSignal?.aborted && (auto || interrupted.current)) {
        interrupted.current = false;
        setRevision(value => value + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [auto, sessionSignal, interrupted]);
  const shown = services.filter(([id]) => selected === 'all' || selected === id);
  const statuses = shown.map(([id]) => instant.kind === 'success' ? statusFromUp(instant.data, id) : instant.kind);
  const activeServices = shown.filter((_, index) => ['up', 'partial'].includes(statuses[index])).map(([id]) => id);
  const allStatuses = Object.fromEntries(services.map(([id]) => [id, instant.kind === 'success' ? statusFromUp(instant.data, id) : instant.kind]));
  const allStates = Object.values(allStatuses);
  const upCount = allStates.filter(status => status === 'up').length;
  const missingCount = allStates.filter(status => status === 'missing').length;
  const downCount = allStates.filter(status => status === 'down' || status === 'partial').length;
  const observedCount = upCount + downCount;
  const summary = instant.kind === 'loading' ? '조회 중' : instant.kind === 'error' ? '조회 실패'
    : `${upCount} / ${services.length}`;
  const displayHttp = (key, id) => displayedMetric(metrics[key], id, key, metrics.rps,
    instant.kind === 'success' ? (id === 'all' ? (observedCount ? undefined : 'missing') : statusFromUp(instant.data, id)) : instant.kind,
    activeServices);

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
          <button type="button" className="btn btn-lime" onClick={() => setRevision(value => value + 1)}><span aria-hidden="true">↻</span> 새로고침</button>
          <button type="button" className="btn msa-auto-toggle" aria-pressed={auto} onClick={() => setAuto(value => !value)}>자동 갱신 {auto ? 'ON' : 'OFF'}</button></div>
          <div className="updated" aria-live="polite">30초 주기 조회 · 마지막 완료 {updated ? timeFormatter.format(updated) : '—'} KST{refreshing && <span> · 갱신 중 (기존 측정값 유지)</span>}{refreshFailed && <span> · 갱신 실패 (이전 측정값 표시 중)</span>}</div></div>
      </div>
    </div></div>
    <div className="admin-dashboard-inner msa-content">
      <section className="kpi-grid" aria-label="운영 요약">
        <Kpi label="수집 정상 서비스" value={summary} icon="✓" foot={instant.kind === 'success' ? `전체 5 · 수집 실패 ${allStates.filter(status => status === 'down').length} · 일부 실패 ${allStates.filter(status => status === 'partial').length} · 미수집 ${missingCount}` : '서비스 상태 조회'} tone={downCount ? 'is-danger' : missingCount ? 'is-warn' : ''} />
        <Kpi label="전체 요청량" value={displayHttp('rps', selected)} icon="↗" foot="최근 5분 평균 · 선택 서비스 합계" />
        <Kpi label="서비스별 최대 P95" value={displayHttp('p95', selected)} icon="◷" foot="최근 5분 · 서비스별 P95 최댓값 · ms" />
        <Kpi label="서비스별 최대 5xx율" value={displayHttp('errors', selected)} icon="!" foot="최근 5분 · 서비스별 5xx 비율 최댓값" />
        <Kpi label="Kafka Lag" value={lagKpi(kafkaLag, exporter, kafkaBrokers)} icon="▤" foot="notification-service 그룹 · 전체 토픽 합계" />
      </section>
      <section className="section" aria-label="핵심 지표 그래프"><div className="msa-viz-grid">
        <StatusDonut services={services} statuses={services.map(([id]) => allStatuses[id])} instantKind={instant.kind} />
        <P95Bars services={services} selected={selected} statuses={allStatuses} p95={metrics.p95} rps={metrics.rps} />
        <HttpStatusBars services={services} selected={selected} statuses={allStatuses} distribution={metrics.statusCodes} rps={metrics.rps} />
        <ResourceGauges services={services} selected={selected} statuses={allStatuses} cpu={metrics.cpu} heap={metrics.heap} heapUsed={metrics.heapUsed} heapMax={metrics.heapMax} />
      </div></section>
      <section className="section" aria-labelledby="msa-services-title"><div className="section-heading"><div><p className="section-kicker">01 / LIVE OVERVIEW</p><h2 id="msa-services-title">서비스별 상태</h2><p className="section-desc">UP·DOWN·미수집을 분리하고, 선택한 서비스를 강조합니다.</p></div><span className="section-aside">5개 비즈니스 서비스</span></div>
        <div className="panel"><div className="panel-head"><div><h3 className="panel-title">서비스 운영 현황</h3><p className="panel-sub">상태는 Prometheus up, 성능은 HTTP 계측으로 확인합니다.</p></div><span className="tiny-tag">A30</span></div>
          <div className="service-table-wrap"><table className="service-table"><thead><tr><th scope="col">서비스</th><th scope="col">상태</th><th scope="col">요청량</th><th scope="col">P95</th><th scope="col">5xx 오류율</th></tr></thead><tbody>{services.map(([id, type]) => <tr key={id} className={selected === id ? 'selected-row' : ''}><td><span className="service-name">{id}</span><span className="service-type">{type}</span></td><td><Status kind={instant.kind === 'success' ? statusFromUp(instant.data, id) : instant.kind} /></td><td>{displayHttp('rps', id)}</td><td>{displayHttp('p95', id)}</td><td>{displayHttp('errors', id)}</td></tr>)}</tbody></table></div>
          <div className="service-mobile">{services.map(([id, type]) => <div className="service-item" key={id}><div className="service-item-head"><div><span className="service-name">{id}</span><span className="service-type">{type}</span></div><Status kind={instant.kind === 'success' ? statusFromUp(instant.data, id) : instant.kind} /></div><div className="service-item-data"><div><span>요청량</span><strong>{displayHttp('rps', id)}</strong></div><div><span>P95</span><strong>{displayHttp('p95', id)}</strong></div><div><span>5xx</span><strong>{displayHttp('errors', id)}</strong></div></div></div>)}</div>
        </div>
      </section>
      <section className="section" aria-labelledby="msa-metrics-title"><div className="section-heading"><div><p className="section-kicker">02 / METRICS</p><h2 id="msa-metrics-title">상세 모니터링</h2><p className="section-desc">운영 흐름별로 필요한 지표를 살펴봅니다.</p></div><span className="section-aside">{rangeLabels[range]}</span></div>
        <div className="tabs" role="tablist" aria-label="모니터링 영역" onKeyDown={tabKeyDown}>{tabs.map(([id, label]) => <button className="tab" role="tab" type="button" id={`msa-tab-${id}`} key={id} aria-controls="msa-tab-content" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => selectTab(id)}>{label}</button>)}</div>
        <div id="msa-tab-content" role="tabpanel" aria-labelledby={`msa-tab-${tab}`} tabIndex={0}>{tab === 'overview' ? <>
          <div className="msa-time-grid">
            <PerformanceChart metric="rps" request={performance.rps} rpsRequest={performance.rps} services={services} selected={selected} />
            <PerformanceChart metric="p95" request={performance.p95} rpsRequest={performance.rps} services={services} selected={selected} />
          </div>
          <StatusHeatmap services={services} history={history} window={history.window} />
        </> : tab === 'jvm' ? <JvmArea metrics={metrics} selected={selected} /> : tab === 'domain' ? <DomainMetrics data={domain} rangeLabel={rangeLabels[range]} rateWindowMinutes={range === '24h' ? 15 : 5} /> : tab === 'feign' ? <FeignMetrics data={feign} rangeLabel={rangeLabels[range]} /> : <KafkaMetrics data={kafka} lag={kafkaLag} exporter={exporter} brokers={kafkaBrokers} rangeLabel={rangeLabels[range]} />}</div>
        <details className="details"><summary>상세 데이터 보기 <span className="tiny-tag">A31</span></summary><div className="details-body">{tab === 'overview' && <p>선택한 영역의 실제 시계열 응답입니다.</p>}<DetailData tab={tab} history={history} selected={selected} /></div></details>
      </section>
    </div>
  </>;
}
