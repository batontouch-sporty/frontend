import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MsaMonitoringDashboard, { statusFromUp } from './MsaMonitoringDashboard';
import { buildHeatmap, ResourceGauges } from './MonitoringVisualizations';
import { buildPerformanceSeries } from './MonitoringTimeSeries';
import { queryInstant, queryRange } from '../api/adminApi';

jest.mock('../api/adminApi', () => ({ queryInstant: jest.fn(), queryRange: jest.fn() }));

const labels = application => application === 'prometheus'
  ? { job: 'prometheus' } : { job: 'sporty-services', application };
const up = (application, value) => ({ metric: labels(application), value: [100, String(value)] });
const range = (application, values) => ({ metric: labels(application), values });
const aggregate = (application, value) => ({ metric: { application }, value: [100, String(value)] });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('AI instant·range 쌍은 응답 순서가 달라도 함께 갱신하고 한쪽 실패 시 이전 완전한 쌍을 유지한다', async () => {
  const second = { count: deferred(), sum: deferred(), trendCount: deferred(), trendSum: deferred() };
  const third = { count: deferred(), sum: deferred(), trendCount: deferred(), trendSum: deferred() };
  let countCalls = 0; let sumCalls = 0; let trendCountCalls = 0; let trendSumCalls = 0;
  const metric = (value) => [{ metric: { type: 'search', outcome: 'success' }, value: [100, String(value)] }];
  const series = (end, value) => [{ metric: {}, values: [[end, String(value)]] }];
  queryInstant.mockImplementation(({ query }) => {
    if (query.includes('ai_request_seconds_count')) return ++countCalls === 1 ? Promise.resolve(metric(2)) : countCalls === 2 ? second.count.promise : third.count.promise;
    if (query.includes('ai_request_seconds_sum')) return ++sumCalls === 1 ? Promise.resolve(metric(0.4)) : sumCalls === 2 ? second.sum.promise : third.sum.promise;
    return Promise.resolve([]);
  });
  queryRange.mockImplementation(({ query, end }) => {
    if (query.includes('ai_request_seconds_count')) return ++trendCountCalls === 1 ? Promise.resolve(series(end, 2)) : trendCountCalls === 2 ? second.trendCount.promise : third.trendCount.promise;
    if (query.includes('ai_request_seconds_sum')) return ++trendSumCalls === 1 ? Promise.resolve(series(end, 0.4)) : trendSumCalls === 2 ? second.trendSum.promise : third.trendSum.promise;
    return Promise.resolve([]);
  });
  render(<MsaMonitoringDashboard />);
  fireEvent.click(screen.getByRole('tab', { name: '도메인 · AI' }));
  const ai = screen.getByText('AI 처리 결과').closest('article');
  const trend = screen.getByRole('article', { name: 'AI 평균 응답시간 추이' });
  await waitFor(() => expect(within(ai).getByText('200 ms')).toBeInTheDocument());
  expect(within(trend).getByText('200 ms')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /새로고침/ }));
  await waitFor(() => expect(countCalls).toBe(2));
  await act(async () => { second.count.resolve(metric(4)); second.trendSum.resolve(series(queryRange.mock.calls.at(-1)[0].end, 0.4)); await settle(); });
  expect(within(ai).getByText('200 ms')).toBeInTheDocument();
  expect(within(trend).getByText('200 ms')).toBeInTheDocument();
  await act(async () => { second.sum.resolve(metric(0.4)); second.trendCount.resolve(series(queryRange.mock.calls.at(-2)[0].end, 4)); await settle(); });
  await waitFor(() => expect(within(ai).getByText('100 ms')).toBeInTheDocument());
  expect(within(trend).getByText('100 ms')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /새로고침/ }));
  await waitFor(() => expect(countCalls).toBe(3));
  await act(async () => { third.count.resolve(metric(8)); third.trendSum.resolve(series(queryRange.mock.calls.at(-1)[0].end, 0.4)); await settle(); });
  await act(async () => { third.sum.reject(new Error('offline')); third.trendCount.reject(new Error('offline')); await settle(); });
  await waitFor(() => expect(screen.getByText(/갱신 실패/)).toBeInTheDocument());
  expect(within(ai).getByText('100 ms')).toBeInTheDocument();
  expect(within(trend).getByText('100 ms')).toBeInTheDocument();
}, 20000);

test('도메인 탭은 선택 기간의 Saga·AI A30과 응답시간 A31을 조회하고 기간 변경 시 이전 값을 숨긴다', async () => {
  queryInstant.mockImplementation(({ query }) => query.includes('saga_results_total')
    ? Promise.resolve([{ metric: { outcome: 'success' }, value: [100, '2'] }]) : Promise.resolve([]));
  queryRange.mockResolvedValue([]);
  render(<MsaMonitoringDashboard />);
  fireEvent.click(screen.getByRole('tab', { name: '도메인 · AI' }));
  await waitFor(() => expect(within(screen.getByText('탈퇴 Saga 최종 결과').closest('article')).getByText('2.0')).toBeInTheDocument());
  const domainQueries = queryInstant.mock.calls.map(([request]) => request.query).filter(query => query.includes('sporty_withdrawal') || query.includes('ai_request'));
  expect(domainQueries).toHaveLength(4);
  expect(domainQueries[0]).toContain('increase(sporty_withdrawal_saga_results_total{');
  expect(domainQueries[0]).toContain('outcome=~"success|rejected|timed_out"}[900s]');
  expect(domainQueries[1]).toContain('increase(sporty_withdrawal_saga_late_results_total{');
  expect(domainQueries[1]).toContain('outcome=~"cleaned|rejected"}[900s]');
  for (const query of domainQueries.slice(2)) {
    expect(query).toMatch(/increase\(ai_request_seconds_(count|sum)\{/);
    expect(query).toContain('type=~"search|draft|recommend"');
    expect(query).toContain('outcome=~"success|fallback|rejected|error"}[900s]');
  }
  expect(domainQueries.every(query => query.includes('job="sporty-services"') && query.includes('application='))).toBe(true);
  const aiRanges = queryRange.mock.calls.map(([request]) => request).filter(request => request.query.includes('ai_request'));
  expect(aiRanges).toHaveLength(2);
  for (const request of aiRanges) {
    expect(request.query).toMatch(/sum\(rate\(ai_request_seconds_(count|sum)\{/);
    expect(request.query).toContain('type=~"search|draft|recommend"');
    expect(request.query).toContain('outcome=~"success|fallback|rejected|error"}[5m]');
    expect(request.query).toContain('job="sporty-services"');
    expect(request.query).toContain('application="ai-service"');
  }
  const aiInstants = queryInstant.mock.calls.map(([request]) => request).filter(request => request.query.includes('ai_request'));
  expect(aiInstants[0].time).toBe(aiInstants[1].time);
  expect(aiInstants[0].query.replace('_count', '_sum')).toBe(aiInstants[1].query);
  expect(aiRanges[0].query.replace('_count', '_sum')).toBe(aiRanges[1].query);
  expect(aiRanges[0]).toEqual(expect.objectContaining({ start: aiRanges[1].start, end: aiRanges[1].end, step: aiRanges[1].step }));
  const oldSignal = queryInstant.mock.calls.at(-1)[0].signal;
  for (const [rangeValue, duration] of [['1h', '3600s'], ['6h', '21600s'], ['24h', '86400s']]) {
    fireEvent.change(screen.getByLabelText('조회 시간'), { target: { value: rangeValue } });
    if (rangeValue === '1h') {
      expect(oldSignal.aborted).toBe(true);
      expect(within(screen.getByText('탈퇴 Saga 최종 결과').closest('article')).getAllByText('조회 중')).toHaveLength(3);
    }
    await waitFor(() => expect(queryInstant.mock.calls.some(([request]) => request.query.includes('saga_results_total') && request.query.includes(`[${duration}]`))).toBe(true));
    const trend = queryRange.mock.calls.map(([request]) => request)
      .filter(request => request.query.includes('ai_request_seconds_') && request.end - request.start === Number.parseInt(duration, 10));
    expect(trend).toHaveLength(2);
    expect(trend.every(request => request.query.includes(rangeValue === '24h' ? '[15m]' : '[5m]'))).toBe(true);
    expect(trend[0].query.replace('_count', '_sum')).toBe(trend[1].query);
  }
});

test('도메인 이전 세션의 완전한 AI 쌍도 새 세션에 표시하지 않는다', async () => {
  const first = new AbortController();
  const next = new AbortController();
  queryInstant.mockImplementation(({ query }) => Promise.resolve(query.includes('ai_request_seconds_count')
    ? [{ metric: { type: 'search', outcome: 'success' }, value: [100, '2'] }]
    : query.includes('ai_request_seconds_sum') ? [{ metric: { type: 'search', outcome: 'success' }, value: [100, '0.4'] }] : []));
  const view = render(<MsaMonitoringDashboard sessionSignal={first.signal} />);
  fireEvent.click(screen.getByRole('tab', { name: '도메인 · AI' }));
  await waitFor(() => expect(screen.getByText('200 ms')).toBeInTheDocument());
  const oldSignal = queryInstant.mock.calls.at(-1)[0].signal;
  queryInstant.mockImplementation(() => new Promise(() => {}));
  queryRange.mockImplementation(() => new Promise(() => {}));
  view.rerender(<MsaMonitoringDashboard sessionSignal={next.signal} />);
  expect(oldSignal.aborted).toBe(true);
  expect(screen.queryByText('200 ms')).not.toBeInTheDocument();
  expect(within(screen.getByText('AI 처리 결과').closest('article')).getAllByText('조회 중')).toHaveLength(6);
});

test('Feign·CB 탭은 실제 A30 조회식을 같은 기간에 요청하고 다른 지표 실패와 분리한다', async () => {
  const client = 'com.example.sporty.match.integration.MemberClient';
  queryInstant.mockImplementation(({ query }) => {
    if (query.includes('sporty_feign_http_requests_seconds_count')) return Promise.resolve([{ metric: { clientName: client, http_status_code: '503' }, value: [100, '2'] }]);
    if (query.includes('sporty_feign_http_requests_seconds_sum')) return Promise.resolve([{ metric: { clientName: client }, value: [100, '0.4'] }]);
    if (query.includes('resilience4j_circuitbreaker_state')) return Promise.resolve([{ metric: { name: 'MemberClientgetLong', instance: 'match:8082', state: 'open' }, value: [100, '1'] }]);
    if (query.includes('resilience4j_circuitbreaker_failure_rate')) return Promise.reject(new Error('offline'));
    return Promise.resolve([]);
  });
  render(<MsaMonitoringDashboard />);
  fireEvent.click(screen.getByRole('tab', { name: 'Feign · CB' }));
  await waitFor(() => expect(screen.getByText('OPEN')).toBeInTheDocument());
  const feign = screen.getByText('OpenFeign HTTP').closest('article');
  expect(feign).toHaveTextContent('2.0건');
  expect(feign).toHaveTextContent('100.0%');
  expect(feign).toHaveTextContent('200 ms');
  expect(screen.getByText('Circuit Breaker').closest('article')).toHaveTextContent('조회 실패');
  const requests = queryInstant.mock.calls.map(([request]) => request).filter(request => /sporty_feign_http_requests|resilience4j_circuitbreaker/.test(request.query));
  expect(requests).toHaveLength(4);
  expect(requests.every(request => request.query.includes('job="sporty-services"') && request.query.includes('application="match-service"'))).toBe(true);
  expect(requests.slice(0, 2).every(request => request.query.includes('[900s]'))).toBe(true);
  expect(requests[0].query.replace('_count', '_sum').replace('clientName, http_status_code', 'clientName')).toBe(requests[1].query);
  expect(requests[0].time).toBe(requests[1].time);
  expect(requests[0].query).toContain('clientName=~"com[.]example[.]sporty[.]match[.]integration[.](MemberClient|FacilityClient)"');
  expect(requests[2].query).toContain('name=~"MemberClientgetLong|MemberClientprofilesList|FacilityClientgetLong"');
});

test('Feign 재조회는 성공 데이터를 유지하고 기간·세션 변경은 이전 응답을 가린다', async () => {
  const firstSession = new AbortController();
  const nextSession = new AbortController();
  const pending = deferred();
  const client = 'com.example.sporty.match.integration.MemberClient';
  let countCalls = 0;
  queryInstant.mockImplementation(({ query }) => {
    if (query.includes('sporty_feign_http_requests_seconds_count')) {
      countCalls += 1;
      return countCalls === 2 ? pending.promise : Promise.resolve([{ metric: { clientName: client, http_status_code: '200' }, value: [100, '2'] }]);
    }
    if (query.includes('sporty_feign_http_requests_seconds_sum')) return Promise.resolve([{ metric: { clientName: client }, value: [100, '0.4'] }]);
    return Promise.resolve([]);
  });
  const view = render(<MsaMonitoringDashboard sessionSignal={firstSession.signal} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Feign · CB' }));
  await waitFor(() => expect(screen.getByText('OpenFeign HTTP').closest('article')).toHaveTextContent('2.0건'));
  fireEvent.click(screen.getByRole('button', { name: /새로고침/ }));
  await waitFor(() => expect(countCalls).toBe(2));
  expect(screen.getByText('OpenFeign HTTP').closest('article')).toHaveTextContent('2.0건');
  const staleSignal = queryInstant.mock.calls.findLast(([request]) => request.query.includes('sporty_feign_http_requests_seconds_count'))[0].signal;
  fireEvent.change(screen.getByLabelText('조회 시간'), { target: { value: '1h' } });
  expect(staleSignal.aborted).toBe(true);
  expect(screen.getByText('OpenFeign HTTP').closest('article')).not.toHaveTextContent('2.0건');
  await act(async () => { pending.resolve([{ metric: { clientName: client, http_status_code: '200' }, value: [100, '99'] }]); await settle(); });
  await waitFor(() => expect(queryInstant.mock.calls.some(([request]) => request.query.includes('sporty_feign_http_requests_seconds_count') && request.query.includes('[3600s]'))).toBe(true));
  expect(screen.getByText('OpenFeign HTTP').closest('article')).not.toHaveTextContent('99.0건');
  view.rerender(<MsaMonitoringDashboard sessionSignal={nextSession.signal} />);
  expect(screen.getByText('OpenFeign HTTP').closest('article')).not.toHaveTextContent('2.0건');
});

test('Feign 자동 갱신 중 이전 쌍을 유지하고 한쪽 실패에도 이전 성공값을 보존한다', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-01T05:00:00Z'));
  const second = deferred();
  const client = 'com.example.sporty.match.integration.MemberClient';
  let countCalls = 0;
  queryInstant.mockImplementation(({ query }) => {
    if (query.includes('sporty_feign_http_requests_seconds_count')) {
      countCalls += 1;
      return countCalls === 2 ? second.promise : Promise.resolve([{ metric: { clientName: client, http_status_code: '200' }, value: [100, '2'] }]);
    }
    if (query.includes('sporty_feign_http_requests_seconds_sum')) return Promise.resolve([{ metric: { clientName: client }, value: [100, '0.4'] }]);
    return Promise.resolve([]);
  });
  try {
    render(<MsaMonitoringDashboard />);
    fireEvent.click(screen.getByRole('tab', { name: 'Feign · CB' }));
    await act(settle);
    expect(screen.getByText('OpenFeign HTTP').closest('article')).toHaveTextContent('2.0건');
    await act(async () => { jest.advanceTimersByTime(30000); await settle(); });
    expect(countCalls).toBe(2);
    expect(screen.getByText('OpenFeign HTTP').closest('article')).toHaveTextContent('2.0건');
    expect(screen.getByText(/갱신 중 \(기존 측정값 유지\)/)).toBeInTheDocument();
    await act(async () => { second.reject(new Error('offline')); await settle(); });
    expect(screen.getByText(/갱신 실패 \(이전 측정값 표시 중\)/)).toBeInTheDocument();
    expect(screen.getByText('OpenFeign HTTP').closest('article')).toHaveTextContent('2.0건');
  } finally { jest.useRealTimers(); }
});

test('Kafka A30·A31은 확인된 Counter·Exporter 계약을 조회하고 정상 지표는 부분 실패와 분리한다', async () => {
  const topic = 'match.status-changed.v1';
  queryInstant.mockImplementation(({ query }) => {
    if (query === 'up{job="kafka-exporter"}') return Promise.resolve([{ metric: { job: 'kafka-exporter' }, value: [100, '1'] }]);
    if (query.includes('sum by (consumergroup, topic) (kafka_consumergroup_lag')) return Promise.resolve([{ metric: { consumergroup: 'notification-service', topic }, value: [100, '2'] }]);
    if (query.includes('max by (consumergroup, topic) (kafka_consumergroup_lag')) return Promise.resolve([{ metric: { consumergroup: 'notification-service', topic }, value: [100, '2'] }]);
    if (query.includes('sporty_kafka_records_processed_total')) return Promise.resolve([{ metric: { topic, group: 'notification-service' }, value: [100, '3.2'] }]);
    if (query.includes('sporty_kafka_dlt_published_total')) return Promise.reject(new Error('offline'));
    if (query.includes('kafka_brokers')) return Promise.resolve([{ metric: { job: 'kafka-exporter' }, value: [100, '1'] }]);
    return Promise.resolve([]);
  });
  queryRange.mockImplementation(({ query, end }) => Promise.resolve(query.includes('sporty_kafka_records_processed_total')
    ? [{ metric: { topic, group: 'notification-service' }, values: [[end, '0.02']] }] : []));
  render(<MsaMonitoringDashboard />);
  fireEvent.click(screen.getByRole('tab', { name: 'Kafka' }));
  await waitFor(() => expect(screen.getByText('Kafka Lag').closest('article')).toHaveTextContent('2건'));
  expect(screen.getByText('Consumer 처리 성공').closest('article')).toHaveTextContent('3.2건');
  expect(screen.getByText('Consumer 처리 성공').closest('article')).toHaveTextContent('0.020건/초');
  expect(screen.getByText('Consumer Group Lag').closest('article')).toHaveTextContent('2건');
  expect(screen.getByText('DLT 발행 성공').closest('article')).toHaveTextContent('조회 실패');
  const instantQueries = queryInstant.mock.calls.map(([request]) => request.query);
  expect(instantQueries).toContain('sum by (consumergroup, topic) (kafka_consumergroup_lag{job="kafka-exporter"})');
  expect(instantQueries).toContain('max by (consumergroup, topic) (kafka_consumergroup_lag{job="kafka-exporter"})');
  expect(instantQueries.some(query => query.includes('increase(sporty_kafka_records_processed_total') && query.includes('[900s]'))).toBe(true);
  expect(instantQueries.some(query => query.includes('increase(sporty_kafka_dlt_published_total') && query.includes('[900s]'))).toBe(true);
  const ranges = queryRange.mock.calls.map(([request]) => request).filter(request => request.query.includes('sporty_kafka_'));
  expect(ranges).toHaveLength(2);
  expect(ranges.every(request => request.query.includes('rate(') && request.query.includes('[5m]') && request.step === 30)).toBe(true);
});

test('Kafka 기간·탭·세션 변경은 이전 응답을 격리한다', async () => {
  const first = new AbortController();
  const next = new AbortController();
  const old = deferred();
  const topic = 'match.status-changed.v1';
  let countCalls = 0;
  queryInstant.mockImplementation(({ query }) => {
    if (query === 'up{job="kafka-exporter"}') return Promise.resolve([{ metric: { job: 'kafka-exporter' }, value: [100, '1'] }]);
    if (query === 'kafka_brokers{job="kafka-exporter"}') return Promise.resolve([{ metric: { job: 'kafka-exporter' }, value: [100, '1'] }]);
    if (query.includes('sum by (consumergroup, topic) (kafka_consumergroup_lag')) return Promise.resolve([{ metric: { consumergroup: 'notification-service', topic }, value: [100, '0'] }]);
    if (query.includes('sporty_kafka_records_processed_total')) return ++countCalls === 2 ? old.promise : Promise.resolve([{ metric: { topic, group: 'notification-service' }, value: [100, '2'] }]);
    return Promise.resolve([]);
  });
  const view = render(<MsaMonitoringDashboard sessionSignal={first.signal} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Kafka' }));
  await waitFor(() => expect(screen.getByText('Consumer 처리 성공').closest('article')).toHaveTextContent('2.0건'));
  expect(screen.getByText('Kafka Lag').closest('article')).toHaveTextContent('0건');
  fireEvent.change(screen.getByLabelText('조회 시간'), { target: { value: '1h' } });
  expect(screen.getByText('Consumer 처리 성공').closest('article')).not.toHaveTextContent('2.0건');
  await waitFor(() => expect(countCalls).toBe(2));
  const staleSignal = queryInstant.mock.calls.findLast(([request]) => request.query.includes('sporty_kafka_records_processed_total'))[0].signal;
  fireEvent.click(screen.getByRole('tab', { name: '서비스 개요' }));
  expect(staleSignal.aborted).toBe(true);
  await act(async () => { old.resolve([{ metric: { topic, group: 'notification-service' }, value: [100, '99'] }]); await settle(); });
  queryInstant.mockImplementation(() => new Promise(() => {}));
  view.rerender(<MsaMonitoringDashboard sessionSignal={next.signal} />);
  expect(screen.getByText('Kafka Lag').closest('article')).not.toHaveTextContent('0건');
  fireEvent.click(screen.getByRole('tab', { name: 'Kafka' }));
  expect(screen.getByText('Consumer 처리 성공').closest('article')).not.toHaveTextContent('99.0건');
});

test('Kafka 자동 갱신 중 성공 데이터를 유지하고 실패 안내를 표시한다', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-01T05:00:00Z'));
  const second = deferred();
  const topic = 'match.status-changed.v1';
  let countCalls = 0;
  queryInstant.mockImplementation(({ query }) => {
    if (query === 'up{job="kafka-exporter"}') return Promise.resolve([{ metric: { job: 'kafka-exporter' }, value: [100, '1'] }]);
    if (query === 'kafka_brokers{job="kafka-exporter"}') return Promise.resolve([{ metric: { job: 'kafka-exporter' }, value: [100, '1'] }]);
    if (query.includes('sporty_kafka_records_processed_total')) return ++countCalls === 2 ? second.promise : Promise.resolve([{ metric: { topic, group: 'notification-service' }, value: [100, '2'] }]);
    return Promise.resolve([]);
  });
  try {
    render(<MsaMonitoringDashboard />);
    fireEvent.click(screen.getByRole('tab', { name: 'Kafka' }));
    await act(settle);
    expect(screen.getByText('Consumer 처리 성공').closest('article')).toHaveTextContent('2.0건');
    await act(async () => { jest.advanceTimersByTime(30000); await settle(); });
    expect(countCalls).toBe(2);
    expect(screen.getByText('Consumer 처리 성공').closest('article')).toHaveTextContent('2.0건');
    await act(async () => { second.reject(new Error('offline')); await settle(); });
    expect(screen.getByText(/갱신 실패 \(이전 측정값 표시 중\)/)).toBeInTheDocument();
    expect(screen.getByText('Consumer 처리 성공').closest('article')).toHaveTextContent('2.0건');
    fireEvent.click(screen.getByRole('button', { name: /새로고침/ }));
    await act(settle);
    expect(countCalls).toBe(3);
    expect(screen.queryByText(/갱신 실패 \(이전 측정값 표시 중\)/)).not.toBeInTheDocument();
  } finally { jest.useRealTimers(); }
});

beforeEach(() => {
  queryInstant.mockReset().mockResolvedValue([]);
  queryRange.mockReset().mockResolvedValue([]);
});

test('진입 즉시 A30·A31의 검증된 up을 조회하고 타깃 부재와 실제 DOWN을 구분한다', async () => {
  queryInstant.mockResolvedValue([up('user-service', 1), up('match-service', 0), up('prometheus', 1)]);
  queryRange.mockResolvedValue([range('user-service', [[100, '1'], [160, '0']])]);
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(within(screen.getByRole('region', { name: '운영 요약' })).getByText('1 / 5')).toBeInTheDocument());
  expect(queryInstant).toHaveBeenCalledWith({ query: 'up', signal: expect.any(AbortSignal) });
  expect(queryRange).toHaveBeenCalledWith(expect.objectContaining({ query: 'up', step: 30, signal: expect.any(AbortSignal) }));
  const rows = screen.getAllByRole('row');
  expect(within(rows[1]).getByText('UP')).toBeInTheDocument();
  expect(within(rows[2]).getByText('DOWN')).toBeInTheDocument();
  expect(within(rows[3]).getAllByText('미수집').length).toBeGreaterThan(0);
  expect(screen.getByRole('article', { name: '전체 5개 서비스 수집 상태 히트맵' })).toBeInTheDocument();
  expect(screen.getByRole('article', { name: '요청량 RPS 추이' })).toBeInTheDocument();
  expect(screen.getByText('Kafka Lag').closest('article')).toHaveTextContent('미수집');
});

test('0·복수 인스턴스·없는 job은 각기 다른 상태다', () => {
  expect(statusFromUp([up('user-service', 0)], 'user-service')).toBe('down');
  expect(statusFromUp([up('user-service', 0), up('user-service', 1)], 'user-service')).toBe('partial');
  expect(statusFromUp([up('prometheus', 1)], 'user-service')).toBe('missing');
  expect(statusFromUp([up('user-service', 1)], 'user-service')).toBe('up');
  expect(statusFromUp([up('user-service', 1), up('user-service', 'NaN')], 'user-service')).toBe('missing');
  expect(statusFromUp([{ metric: { job: 'other', application: 'user-service' }, value: [100, '1'] }], 'user-service')).toBe('missing');
});

test('RPS와 P95 시계열은 동일한 A31 시간축을 사용하고 누락 구간을 연결하지 않는다', () => {
  const window = { start: 100, end: 190, step: 30 };
  const rps = { kind: 'success', window, data: [{ metric: { application: 'user-service' }, values: [[100, '1'], [160, '2']] }] };
  const p95 = { kind: 'success', window, data: [{ metric: { application: 'user-service' }, values: [[100, '0.1'], [160, '0.2']] }] };
  const services = [['user-service'], ['match-service']];
  expect(buildPerformanceSeries(rps, rps, services, 'user-service', 'rps').map(point => point.value)).toEqual([1, null, 2, null]);
  expect(buildPerformanceSeries(p95, rps, services, 'user-service', 'p95').map(point => point.value)).toEqual([100, null, 200, null]);
});

test('HTTP·JVM 지표는 0, 미수집, 단위와 서비스 레이블을 구분한다', async () => {
  queryInstant.mockImplementation(({ query }) => {
    if (query === 'up') return Promise.resolve([up('user-service', 1)]);
    if (query.includes('histogram_quantile')) return Promise.resolve([aggregate('user-service', 0.275)]);
    if (query.includes('status=~')) return Promise.resolve([aggregate('user-service', 0)]);
    if (query.includes('jvm_memory_used_bytes')) return Promise.resolve([aggregate('user-service', 104857600)]);
    if (query.includes('process_cpu_usage')) return Promise.resolve([aggregate('user-service', 0.12)]);
    if (query.includes('jvm_gc_pause_seconds_count')) return Promise.resolve([aggregate('user-service', 0)]);
    if (query.includes('jvm_threads_live_threads')) return Promise.resolve([aggregate('user-service', 18)]);
    return Promise.resolve([aggregate('user-service', 2)]);
  });
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(screen.getAllByText('275 ms').length).toBeGreaterThan(0));
  expect(screen.getAllByText('2.00 RPS').length).toBeGreaterThan(0);
  expect(screen.getAllByText('0.0%').length).toBeGreaterThan(0);
  const rows = screen.getAllByRole('row');
  expect(within(rows[2]).getAllByText('미수집').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('tab', { name: 'JVM · 리소스' }));
  await waitFor(() => expect(screen.getByText('100.0 MiB')).toBeInTheDocument());
  expect(screen.getAllByText('12.0%').length).toBeGreaterThan(0);
  expect(screen.getByText('0.00 /s')).toBeInTheDocument();
  expect(screen.getByText('18')).toBeInTheDocument();
});

test('HTTP 조회식의 모든 Selector는 Actuator를 제외하고 5분 창을 유지한다', async () => {
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(queryInstant).toHaveBeenCalledTimes(12));
  const http = queryInstant.mock.calls.map(([{ query }]) => query)
    .filter(query => query.includes('http_server_requests_seconds_'));
  expect(http).toHaveLength(4);
  for (const query of http) {
    const selectors = query.match(/http_server_requests_seconds_(?:count|bucket)\{[^}]+\}/g);
    expect(selectors.length).toBeGreaterThan(0);
    selectors.forEach(selector => {
      expect(selector).toContain('job="sporty-services"');
      expect(selector).toContain('uri!~"/actuator.*"');
    });
    expect(query).toContain('[5m]');
    expect(query).toContain('by (application');
  }
  expect(http.find(query => query.includes('status=~"5.."')).match(/uri!~"\/actuator\.\*"/g)).toHaveLength(3);
  const ranges = queryRange.mock.calls.map(([options]) => options);
  expect(ranges).toHaveLength(3);
  expect(ranges.map(item => [item.start, item.end, item.step])).toEqual(Array(3).fill([ranges[0].start, ranges[0].end, 30]));
  ranges.filter(item => item.query !== 'up').forEach(item => expect(item.query).toContain('uri!~"/actuator.*"'));
});

test('요청량 0은 실제 0으로, 같은 구간의 P95·5xx는 요청 없음으로 표시한다', async () => {
  queryInstant.mockImplementation(({ query }) => {
    if (query === 'up') return Promise.resolve([up('user-service', 1)]);
    if (query.includes('http_server_requests_seconds_count') && !query.includes('status=~')) return Promise.resolve([aggregate('user-service', 0)]);
    if (query.includes('histogram_quantile')) return Promise.resolve([aggregate('user-service', 'NaN')]);
    if (query.includes('status=~')) return Promise.resolve([aggregate('user-service', 'NaN')]);
    return Promise.resolve([]);
  });
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(screen.getAllByText('0.00 RPS').length).toBeGreaterThan(0));
  expect(screen.getAllByText('요청 없음').length).toBeGreaterThan(0);
  expect(screen.queryByText(/NaN%|NaN ms|Infinity ms/)).not.toBeInTheDocument();
});

test('전체 서비스에서 일부 활성 서비스 RPS가 없으면 유효한 P95·5xx를 표시한다', async () => {
  queryInstant.mockImplementation(({ query }) => {
    if (query === 'up') return Promise.resolve([
      up('user-service', 1), up('match-service', 0), up('match-service', 1), up('facility-service', 0),
    ]);
    if (query.includes('histogram_quantile')) return Promise.resolve([aggregate('match-service', 0.2)]);
    if (query.includes('status=~')) return Promise.resolve([aggregate('match-service', 0.05)]);
    if (query.includes('http_server_requests_seconds_count')) return Promise.resolve([aggregate('user-service', 0)]);
    return Promise.resolve([]);
  });
  render(<MsaMonitoringDashboard />);
  const summary = screen.getByRole('region', { name: '운영 요약' });
  await waitFor(() => expect(within(summary).getByText('200 ms')).toBeInTheDocument());
  expect(within(summary).getByText('5.0%')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('서비스'), { target: { value: 'user-service' } });
  await waitFor(() => expect(within(summary).getAllByText('요청 없음')).toHaveLength(2));
  fireEvent.change(screen.getByLabelText('서비스'), { target: { value: 'match-service' } });
  await waitFor(() => expect(within(summary).getByText('200 ms')).toBeInTheDocument());
  expect(within(summary).getByText('5.0%')).toBeInTheDocument();
});

test('전체 활성 서비스에 유효한 RPS 0 샘플이 모두 있으면 요청 없음이다', async () => {
  queryInstant.mockImplementation(({ query }) => {
    if (query === 'up') return Promise.resolve([up('user-service', 1), up('match-service', 1), up('facility-service', 0)]);
    if (query.includes('histogram_quantile') || query.includes('status=~')) return Promise.resolve([]);
    if (query.includes('http_server_requests_seconds_count')) return Promise.resolve([
      aggregate('user-service', 0), aggregate('match-service', 0),
    ]);
    return Promise.resolve([]);
  });
  render(<MsaMonitoringDashboard />);
  const summary = screen.getByRole('region', { name: '운영 요약' });
  await waitFor(() => expect(within(summary).getAllByText('요청 없음')).toHaveLength(2));
  expect(within(summary).getByText('0.00 RPS')).toBeInTheDocument();
});

test('비즈니스 시계열 부재와 비유한 값은 0으로 추정하지 않는다', async () => {
  queryInstant.mockImplementation(({ query }) => {
    if (query === 'up') return Promise.resolve([up('user-service', 1), up('match-service', 0)]);
    if (query.includes('histogram_quantile')) return Promise.resolve([aggregate('user-service', 'Inf')]);
    if (query.includes('status=~')) return Promise.resolve([aggregate('user-service', 'NaN')]);
    return Promise.resolve([]);
  });
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(screen.getAllByText('데이터 없음').length).toBeGreaterThan(0));
  const rows = screen.getAllByRole('row');
  expect(within(rows[1]).getByText('UP')).toBeInTheDocument();
  expect(within(rows[2]).getByText('DOWN')).toBeInTheDocument();
  expect(within(rows[2]).getAllByText('서비스 DOWN').length).toBeGreaterThan(0);
  expect(screen.queryByText(/NaN%|Infinity ms|0 ms/)).not.toBeInTheDocument();
});

test('서비스 타깃이 하나도 없으면 0/5와 미수집 5개로 표시한다', async () => {
  queryInstant.mockResolvedValue([up('prometheus', 1)]);
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(within(screen.getByRole('region', { name: '운영 요약' })).getAllByText('미수집').length).toBeGreaterThan(0));
  expect(within(screen.getByRole('region', { name: '운영 요약' })).getByText('0 / 5')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /미수집 5개/ })).toBeInTheDocument();
});

test('시간 범위·서비스 필터·새로고침이 실제 조회와 강조 행을 갱신한다', async () => {
  queryInstant.mockResolvedValue([up('user-service', 1), up('match-service', 1)]);
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(within(screen.getByRole('region', { name: '운영 요약' })).getByText('2 / 5')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('조회 시간'), { target: { value: '24h' } });
  await waitFor(() => expect(queryRange).toHaveBeenLastCalledWith(expect.objectContaining({ step: 900 })));
  fireEvent.change(screen.getByLabelText('서비스'), { target: { value: 'user-service' } });
  await waitFor(() => expect(within(screen.getByRole('region', { name: '운영 요약' })).getByText('2 / 5')).toBeInTheDocument());
  expect(document.querySelectorAll('.selected-row')).toHaveLength(1);
  const previousCalls = queryInstant.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: /새로고침/ }));
  await waitFor(() => expect(queryInstant.mock.calls.length).toBeGreaterThan(previousCalls));
});

test('5개 탭과 키보드 이동, Kafka·도메인 영역, 상세 데이터 펼치기가 동작한다', async () => {
  queryInstant.mockResolvedValue([up('user-service', 1)]);
  queryRange.mockResolvedValue([range('user-service', [[100, '1'], [160, '0']])]);
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(within(screen.getByRole('region', { name: '운영 요약' })).getByText('1 / 5')).toBeInTheDocument());
  expect(screen.getAllByRole('tab')).toHaveLength(5);
  fireEvent.keyDown(screen.getByRole('tab', { name: '서비스 개요' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Feign · CB' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'msa-tab-feign');
  fireEvent.click(screen.getByRole('tab', { name: 'Kafka' }));
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Consumer Group Lag');
  expect(screen.getByRole('tabpanel')).toHaveTextContent('성공 발행 건수 계측 미확인');
  fireEvent.click(screen.getByRole('tab', { name: '도메인 · AI' }));
  expect(screen.getByRole('tabpanel')).toHaveTextContent('계측 대기');
  fireEvent.click(screen.getByRole('tab', { name: '서비스 개요' }));
  fireEvent.click(screen.getByText('상세 데이터 보기'));
  await waitFor(() => expect(within(screen.getByText('상세 데이터 보기').closest('details')).getByRole('table')).toHaveTextContent('user-service'));
});

test('조회 오류를 DOWN으로 표시하지 않고 재시도하며 범위 조회 실패도 분리한다', async () => {
  queryInstant.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([up('user-service', 1)]);
  queryRange.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(screen.getAllByText('조회 실패').length).toBeGreaterThan(0));
  expect(screen.queryByText('DOWN')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /새로고침/ }));
  await waitFor(() => expect(within(screen.getByRole('region', { name: '운영 요약' })).getByText('1 / 5')).toBeInTheDocument());
});

test('세션 중단 시 진행 중인 조회를 취소하고 늦은 결과를 표시하지 않는다', async () => {
  let resolveInstant;
  queryInstant.mockReturnValue(new Promise(resolve => { resolveInstant = resolve; }));
  const session = new AbortController();
  render(<MsaMonitoringDashboard sessionSignal={session.signal} />);
  await waitFor(() => expect(queryInstant).toHaveBeenCalled());
  act(() => session.abort());
  await act(async () => resolveInstant([up('user-service', 1)]));
  expect(screen.queryByText('1 / 5')).not.toBeInTheDocument();
  expect(queryInstant.mock.calls[0][0].signal.aborted).toBe(true);
});

test('세션 신호가 바뀌면 이전 계정의 수집 데이터를 즉시 숨긴다', async () => {
  const first = new AbortController();
  const next = new AbortController();
  queryInstant.mockImplementation(({ query }) => Promise.resolve(query === 'up' ? [up('user-service', 1)] : []));
  const view = render(<MsaMonitoringDashboard sessionSignal={first.signal} />);
  await waitFor(() => expect(within(screen.getByRole('region', { name: '운영 요약' })).getByText('1 / 5')).toBeInTheDocument());
  const oldSignal = queryInstant.mock.calls[0][0].signal;
  queryInstant.mockImplementation(() => new Promise(() => {}));
  view.rerender(<MsaMonitoringDashboard sessionSignal={next.signal} />);
  expect(screen.queryByText('1 / 5')).not.toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: '운영 요약' })).getAllByText('조회 중').length).toBeGreaterThan(0);
  expect(oldSignal.aborted).toBe(true);
});

test('도넛·KPI·상태표가 5개 서비스를 같은 기준으로 분류하고 선택 필터에도 전체 도넛을 유지한다', async () => {
  queryInstant.mockImplementation(({ query }) => Promise.resolve(query === 'up' ? [
    up('user-service', 1), up('match-service', 0), up('facility-service', 0), up('facility-service', 1),
    up('notification-service', 1), up('gateway-service', 1),
  ] : []));
  render(<MsaMonitoringDashboard />);
  const donut = await screen.findByRole('img', { name: /수집 정상 2개, 수집 실패 1개, 일부 실패 1개, 미수집 1개/ });
  expect(donut).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: '운영 요약' })).getByText('2 / 5')).toBeInTheDocument();
  const rows = screen.getAllByRole('row');
  expect(within(rows[3]).getByText('일부 DOWN')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('서비스'), { target: { value: 'user-service' } });
  await waitFor(() => expect(screen.getByRole('img', { name: /수집 정상 2개, 수집 실패 1개, 일부 실패 1개, 미수집 1개/ })).toBeInTheDocument());
  expect(within(screen.getByRole('region', { name: '운영 요약' })).getByText('2 / 5')).toBeInTheDocument();
});

test('P95 막대는 ms 내림차순이며 0건·비유한 값은 0ms 막대를 만들지 않는다', async () => {
  queryInstant.mockImplementation(({ query }) => {
    if (query === 'up') return Promise.resolve([up('user-service', 1), up('match-service', 1), up('facility-service', 1)]);
    if (query.includes('histogram_quantile')) return Promise.resolve([
      aggregate('user-service', 0.2), aggregate('match-service', 0.5), aggregate('facility-service', 'Inf'),
    ]);
    if (query.includes('http_server_requests_seconds_count') && !query.includes('status=~')) return Promise.resolve([
      aggregate('user-service', 2), aggregate('match-service', 1), aggregate('facility-service', 0),
    ]);
    return Promise.resolve([]);
  });
  render(<MsaMonitoringDashboard />);
  const chart = screen.getByRole('article', { name: '서비스별 P95 응답시간' });
  await waitFor(() => expect(within(chart).getByText('500 ms')).toBeInTheDocument());
  const names = [...chart.querySelectorAll('.msa-viz-name')].map(item => item.textContent);
  expect(names.slice(0, 2)).toEqual(['match-service', 'user-service']);
  expect(within(chart).getByText('요청 없음')).toBeInTheDocument();
  expect(chart.querySelectorAll('.msa-viz-fill')).toHaveLength(2);
});

test('HTTP 상태 코드 합계와 전체 RPS를 비교하고 미분류 응답을 별도로 알린다', async () => {
  queryInstant.mockImplementation(({ query }) => {
    if (query === 'up') return Promise.resolve([up('user-service', 1), up('match-service', 1)]);
    if (query.includes('by (application, status)')) return Promise.resolve([
      ...[['200', 5], ['302', 1], ['404', 2], ['500', 2]].map(([status, value]) => ({ metric: { application: 'user-service', status }, value: [100, String(value)] })),
      { metric: { application: 'match-service', status: '200' }, value: [100, '1'] },
    ]);
    if (query.includes('http_server_requests_seconds_count') && !query.includes('status=~')) return Promise.resolve([
      aggregate('user-service', 10), aggregate('match-service', 2),
    ]);
    return Promise.resolve([]);
  });
  render(<MsaMonitoringDashboard />);
  const chart = screen.getByRole('article', { name: '서비스별 HTTP 상태 코드 분포' });
  await waitFor(() => expect(within(chart).getByText('2xx 5.00 RPS · 50.0%')).toBeInTheDocument());
  expect(within(chart).getByText('5xx 2.00 RPS · 20.0%')).toBeInTheDocument();
  expect(within(chart).getByText(/분류 합계 1.00 \/ 전체 2.00 RPS/)).toBeInTheDocument();
  expect(chart.querySelector('.msa-http-unclassified')).toBeInTheDocument();
});

test('Heap 비율은 동일 인스턴스의 Used/유효 Pool Max를 비교하고 서비스는 최대 비율을 표시한다', async () => {
  const instance = (id, name, value) => ({ metric: { application: id, instance: name }, value: [100, String(value)] });
  queryInstant.mockImplementation(({ query }) => {
    if (query === 'up') return Promise.resolve([up('user-service', 1), up('match-service', 1)]);
    if (query.includes('jvm_memory_max_bytes')) return Promise.resolve([instance('user-service', 'a', 120 * 1048576), instance('user-service', 'b', 80 * 1048576)]);
    if (query.includes('jvm_memory_used_bytes') && query.includes('instance')) return Promise.resolve([
      instance('user-service', 'a', 60 * 1048576), instance('user-service', 'b', 40 * 1048576), instance('match-service', 'c', 20 * 1048576),
    ]);
    if (query.includes('jvm_memory_used_bytes')) return Promise.resolve([aggregate('user-service', 100 * 1048576), aggregate('match-service', 20 * 1048576)]);
    if (query.includes('process_cpu_usage')) return Promise.resolve([aggregate('user-service', 0.12)]);
    return Promise.resolve([]);
  });
  render(<MsaMonitoringDashboard />);
  const chart = screen.getByRole('article', { name: '서비스별 CPU와 Heap 사용량' });
  await waitFor(() => expect(within(chart).getByText('100.0 MiB · 50.0% · 유효 Heap Pool Max 대비')).toBeInTheDocument());
  expect(within(chart).getByText('20.0 MiB · 계산 불가')).toBeInTheDocument();
  expect(within(chart).getByText('12.0%')).toBeInTheDocument();
  expect(queryInstant.mock.calls.some(([request]) => request.query.includes('jvm_memory_max_bytes'))).toBe(true);
});

test('히트맵은 공통 구간에서 복수 인스턴스를 합치고 누락을 DOWN으로 채우지 않는다', () => {
  const result = buildHeatmap([
    range('user-service', [[100, '1'], [160, '0']]),
    range('user-service', [[100, '1'], [160, '1']]),
    range('match-service', [[100, '0']]),
    range('gateway-service', [[100, '1']]),
  ], [['user-service'], ['match-service'], ['facility-service']], { start: 100, end: 220, step: 60 });
  expect(result).toEqual([
    { id: 'user-service', cells: ['up', 'partial', 'missing'] },
    { id: 'match-service', cells: ['down', 'missing', 'missing'] },
    { id: 'facility-service', cells: ['missing', 'missing', 'missing'] },
  ]);
});

test('히트맵은 A31의 네 조회 범위와 KST 셀 상태를 표시한다', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(900000);
  try {
    queryRange.mockResolvedValue([range('user-service', [[0, '1'], [60, '0']])]);
    render(<MsaMonitoringDashboard />);
    const heatmap = await screen.findByRole('article', { name: '전체 5개 서비스 수집 상태 히트맵' });
    await waitFor(() => expect(within(heatmap).getByRole('img', { name: /user-service, 09:00:00 KST, 수집 정상/ })).toBeInTheDocument());
    expect(within(heatmap).getByRole('img', { name: /user-service, 09:01:00 KST, 수집 실패/ })).toBeInTheDocument();
    expect(within(heatmap).getByRole('img', { name: /match-service, 09:00:00 KST, 미수집/ })).toBeInTheDocument();
    for (const [value, seconds, step] of [['1h', 3600, 60], ['6h', 21600, 300], ['24h', 86400, 900]]) {
      fireEvent.change(screen.getByLabelText('조회 시간'), { target: { value } });
      await waitFor(() => expect(queryRange).toHaveBeenLastCalledWith(expect.objectContaining({ start: 900 - seconds, end: 900, step })));
    }
  } finally { now.mockRestore(); }
});

test('HTTP 상태 코드 조회 실패와 Heap Max 조회 실패를 실제 0으로 표시하지 않는다', async () => {
  queryInstant.mockImplementation(({ query }) => {
    if (query === 'up') return Promise.resolve([up('user-service', 1)]);
    if (query.includes('by (application, status)') || query.includes('jvm_memory_max_bytes')) return Promise.reject(new Error('offline'));
    if (query.includes('jvm_memory_used_bytes')) return Promise.resolve([aggregate('user-service', 104857600)]);
    if (query.includes('http_server_requests_seconds_count') && !query.includes('status=~')) return Promise.resolve([aggregate('user-service', 2)]);
    return Promise.resolve([]);
  });
  render(<MsaMonitoringDashboard />);
  const http = screen.getByRole('article', { name: '서비스별 HTTP 상태 코드 분포' });
  const resource = screen.getByRole('article', { name: '서비스별 CPU와 Heap 사용량' });
  await waitFor(() => expect(within(http).getAllByText('조회 실패').length).toBeGreaterThan(0));
  expect(within(resource).getByText('100.0 MiB · 조회 실패')).toBeInTheDocument();
  expect(http.querySelector('.msa-http-track')).not.toBeInTheDocument();
});

test.each([
  ['모든 Max 유효', [200, 100, 50], '28.6% · 유효 Heap Pool Max 대비'],
  ['G1 Eden Max=-1', [-1, 200, 50], '40.0% · 유효 Heap Pool Max 대비'],
  ['G1 Survivor Max=-1', [200, 100, -1], '33.3% · 유효 Heap Pool Max 대비'],
  ['일부 Max만 유효', [-1, 200, -1], '50.0% · 유효 Heap Pool Max 대비'],
  ['모든 Max=-1', [-1, -1, -1], '계산 불가'],
  ['모든 Max=0', [0, 0, 0], '계산 불가'],
  ['NaN·Inf 제외', ['NaN', 'Inf', 200], '50.0% · 유효 Heap Pool Max 대비'],
])('%s: 양수·유한 Pool Max만 합산한다', async (_, maxValues, expected) => {
  queryInstant.mockImplementation(({ query }) => {
    if (query === 'up') return Promise.resolve([up('user-service', 1)]);
    if (query.includes('jvm_memory_max_bytes')) return Promise.resolve(maxValues.map((value, index) => ({
      metric: { application: 'user-service', instance: 'a', id: ['eden', 'old', 'survivor'][index] },
      value: [100, String(value === -1 ? -1 : value * 1048576)],
    })));
    if (query.includes('jvm_memory_used_bytes') && query.includes('instance')) return Promise.resolve([
      { metric: { application: 'user-service', instance: 'a' }, value: [100, String(100 * 1048576)] },
    ]);
    if (query.includes('jvm_memory_used_bytes')) return Promise.resolve([aggregate('user-service', 100 * 1048576)]);
    return Promise.resolve([]);
  });
  render(<MsaMonitoringDashboard />);
  const chart = screen.getByRole('article', { name: '서비스별 CPU와 Heap 사용량' });
  await waitFor(() => expect(within(chart).getByText(`100.0 MiB · ${expected}`)).toBeInTheDocument());
  expect(queryInstant.mock.calls.some(([request]) => request.query.includes('jvm_memory_max_bytes'))).toBe(true);
  expect(queryInstant.mock.calls.some(([request]) => request.query.includes('jvm_memory_committed_bytes'))).toBe(false);
});

const heapSample = (instance, value) => ({ metric: { application: 'user-service', instance }, value: [100, String(value)] });
const heapRequest = data => ({ kind: 'success', data });
const mib = 1048576;

test.each([
  ['Max 정상', [heapSample('a', 50 * mib)], [heapSample('a', 100 * mib)], '50.0% · 유효 Heap Pool Max 대비'],
  ['Max 없음', [heapSample('a', 50 * mib)], [], '계산 불가'],
  ['Max 0', [heapSample('a', 50 * mib)], [heapSample('a', 0)], '계산 불가'],
  ['Max NaN', [heapSample('a', 50 * mib)], [heapSample('a', 'NaN')], '계산 불가'],
  ['Max Inf', [heapSample('a', 50 * mib)], [heapSample('a', 'Inf')], '계산 불가'],
  ['Used 미수집', [], [heapSample('a', 100 * mib)], '계산 불가'],
  ['Used NaN', [heapSample('a', 'NaN')], [heapSample('a', 100 * mib)], '계산 불가'],
  ['실제 Used 0', [heapSample('a', 0)], [heapSample('a', 100 * mib)], '0.0% · 유효 Heap Pool Max 대비'],
  ['Used > Max', [heapSample('a', 110 * mib)], [heapSample('a', 100 * mib)], '110.0% · 유효 Heap Pool Max 대비'],
  ['인스턴스 불일치', [heapSample('a', 50 * mib)], [heapSample('b', 100 * mib)], '계산 불가'],
  ['복수 인스턴스 최대 비율', [heapSample('a', 50 * mib), heapSample('b', 70 * mib)], [heapSample('a', 100 * mib), heapSample('b', 100 * mib)], '70.0% · 유효 Heap Pool Max 대비'],
  ['복수 인스턴스 일부 Max 누락', [heapSample('a', 50 * mib), heapSample('b', 70 * mib)], [heapSample('a', 100 * mib)], '50.0% · 유효 Heap Pool Max 대비'],
])('%s: Heap MiB를 유지하고 유효한 비율만 표시한다', (_, used, max, expected) => {
  render(<ResourceGauges services={[["user-service"]]} selected="all" statuses={{ 'user-service': 'up' }}
    cpu={heapRequest([])} heap={heapRequest([aggregate('user-service', 100 * mib)])}
    heapUsed={heapRequest(used)} heapMax={heapRequest(max)} />);
  expect(screen.getByText(`100.0 MiB · ${expected}`)).toBeInTheDocument();
});

test('Max 조회 오류와 서비스 미수집은 Heap 사용량을 0으로 조작하지 않는다', () => {
  const props = { services: [['user-service']], selected: 'all', cpu: heapRequest([]),
    heap: heapRequest([aggregate('user-service', 100 * mib)]), heapUsed: heapRequest([heapSample('a', 50 * mib)]) };
  const view = render(<ResourceGauges {...props} statuses={{ 'user-service': 'up' }} heapMax={{ kind: 'error' }} />);
  expect(screen.getByText('100.0 MiB · 조회 실패')).toBeInTheDocument();
  view.rerender(<ResourceGauges {...props} statuses={{ 'user-service': 'missing' }} heapMax={heapRequest([heapSample('a', 100 * mib)])} />);
  expect(screen.getAllByText('미수집').length).toBeGreaterThan(0);
});

const settle = async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve(); };

test('첫 조회는 Loading이고 수동 재조회 중 차트·툴팁·초점을 유지한다', async () => {
  let resolveRefresh;
  let rpsCalls = 0;
  queryInstant.mockImplementation(({ query }) => Promise.resolve(query === 'up' ? [up('user-service', 1)] : []));
  queryRange.mockImplementation(({ query, end }) => {
    if (!query.includes('http_server_requests_seconds_count')) return Promise.resolve([]);
    rpsCalls += 1;
    return rpsCalls === 1 ? Promise.resolve([{ metric: { application: 'user-service' }, values: [[end, '1']] }])
      : new Promise(resolve => { resolveRefresh = resolve; });
  });
  render(<MsaMonitoringDashboard />);
  const chart = screen.getByRole('article', { name: '요청량 RPS 추이' });
  expect(within(chart).getByText('시계열 조회 중')).toBeInTheDocument();
  await waitFor(() => expect(within(chart).getByText('1.00 RPS')).toBeInTheDocument());
  const point = chart.querySelector('circle[tabindex="0"]');
  fireEvent.focus(point);
  expect(within(chart).getByRole('tooltip')).toHaveTextContent('1.00 RPS');
  fireEvent.click(screen.getByRole('button', { name: /새로고침/ }));
  expect(chart.querySelector('.msa-time-latest')).toHaveTextContent('1.00 RPS');
  expect(within(chart).getByRole('tooltip')).toHaveTextContent('1.00 RPS');
  expect(chart.querySelector('circle[tabindex="0"]')).toBe(point);
  expect(screen.getByText(/갱신 중 \(기존 측정값 유지\)/)).toBeInTheDocument();
  await act(async () => resolveRefresh([{ metric: { application: 'user-service' }, values: [[queryRange.mock.calls[4][0].end, '2']] }]));
  await waitFor(() => expect(chart.querySelector('.msa-time-latest')).toHaveTextContent('2.00 RPS'));
});

test('재조회 실패는 이전 시계열과 갱신 실패 안내를 함께 표시한다', async () => {
  let rpsCalls = 0;
  queryRange.mockImplementation(({ query, end }) => {
    if (!query.includes('http_server_requests_seconds_count')) return Promise.resolve([]);
    rpsCalls += 1;
    return rpsCalls === 1 ? Promise.resolve([{ metric: { application: 'user-service' }, values: [[end, '1']] }])
      : Promise.reject(new Error('offline'));
  });
  render(<MsaMonitoringDashboard />);
  const chart = screen.getByRole('article', { name: '요청량 RPS 추이' });
  await waitFor(() => expect(within(chart).getByText('1.00 RPS')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /새로고침/ }));
  await waitFor(() => expect(screen.getByText(/갱신 실패 \(이전 측정값 표시 중\)/)).toBeInTheDocument());
  expect(within(chart).getByText('1.00 RPS')).toBeInTheDocument();
});

test('조회 기간이 바뀌면 이전 범위 차트를 숨기고 새 A31 응답을 기다린다', async () => {
  let pending = false;
  queryRange.mockImplementation(({ query, end }) => pending ? new Promise(() => {})
    : Promise.resolve(query.includes('http_server_requests_seconds_count')
      ? [{ metric: { application: 'user-service' }, values: [[end, '1']] }] : []));
  render(<MsaMonitoringDashboard />);
  const chart = screen.getByRole('article', { name: '요청량 RPS 추이' });
  await waitFor(() => expect(within(chart).getByText('1.00 RPS')).toBeInTheDocument());
  pending = true;
  fireEvent.change(screen.getByLabelText('조회 시간'), { target: { value: '1h' } });
  expect(within(chart).getByText('시계열 조회 중')).toBeInTheDocument();
  expect(within(chart).queryByText('1.00 RPS')).not.toBeInTheDocument();
});

test('30초 Polling은 현재 시각으로 범위를 밀고 OFF·수동 갱신·언마운트를 따른다', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-01T05:00:00Z'));
  let resolveSecond;
  let rpsCalls = 0;
  queryRange.mockImplementation(({ query, end }) => {
    if (!query.includes('http_server_requests_seconds_count')) return Promise.resolve([]);
    rpsCalls += 1;
    return rpsCalls === 2 ? new Promise(resolve => { resolveSecond = resolve; })
      : Promise.resolve([{ metric: { application: 'user-service' }, values: [[end, String(rpsCalls)]] }]);
  });
  try {
    const view = render(<MsaMonitoringDashboard />);
    await act(settle);
    const chart = screen.getByRole('article', { name: '요청량 RPS 추이' });
    expect(within(chart).getByText('1.00 RPS')).toBeInTheDocument();
    expect(queryInstant).toHaveBeenCalledTimes(12);
    expect(queryRange).toHaveBeenCalledTimes(3);
    const first = queryRange.mock.calls[0][0];
    expect(first.end - first.start).toBe(900);
    await act(async () => { jest.advanceTimersByTime(30000); await settle(); });
    expect(queryRange).toHaveBeenCalledTimes(6);
    expect(queryRange.mock.calls[3][0]).toEqual(expect.objectContaining({ start: first.start + 30, end: first.end + 30, step: 30 }));
    expect(within(chart).getByText('1.00 RPS')).toBeInTheDocument();
    expect(screen.getByText(/갱신 중 \(기존 측정값 유지\)/)).toBeInTheDocument();
    await act(async () => { resolveSecond([{ metric: { application: 'user-service' }, values: [[queryRange.mock.calls[4][0].end, '2']] }]); await settle(); });
    fireEvent.click(screen.getByRole('button', { name: '자동 갱신 ON' }));
    await act(async () => { jest.advanceTimersByTime(60000); await settle(); });
    expect(queryRange).toHaveBeenCalledTimes(6);
    fireEvent.click(screen.getByRole('button', { name: /새로고침/ }));
    await act(settle);
    expect(queryRange).toHaveBeenCalledTimes(9);
    view.unmount();
    await act(async () => { jest.advanceTimersByTime(60000); await settle(); });
    expect(queryRange).toHaveBeenCalledTimes(9);
  } finally { jest.useRealTimers(); }
});

test('숨김 탭은 Polling을 멈추고 다시 보이면 새 범위를 조회한다', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-01T05:00:00Z'));
  const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  let visible = true;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visible ? 'visible' : 'hidden' });
  try {
    render(<MsaMonitoringDashboard />);
    await act(settle);
    visible = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => { jest.advanceTimersByTime(60000); await settle(); });
    expect(queryRange).toHaveBeenCalledTimes(3);
    visible = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(settle);
    expect(queryRange).toHaveBeenCalledTimes(6);
    expect(queryRange.mock.calls[3][0].end).toBe(queryRange.mock.calls[0][0].end + 60);
  } finally {
    if (descriptor) Object.defineProperty(document, 'visibilityState', descriptor);
    jest.useRealTimers();
  }
});

test('자동 갱신 OFF는 숨김으로 중단된 수동 요청만 복귀 시 재시도한다', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-01T05:00:00Z'));
  const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  let visible = true;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visible ? 'visible' : 'hidden' });
  let rangeCalls = 0;
  queryRange.mockImplementation(() => {
    rangeCalls += 1;
    return rangeCalls === 4 ? new Promise(() => {}) : Promise.resolve([]);
  });
  try {
    render(<MsaMonitoringDashboard />);
    await act(settle);
    fireEvent.click(screen.getByRole('button', { name: '자동 갱신 ON' }));
    fireEvent.click(screen.getByRole('button', { name: /새로고침/ }));
    const interruptedSignal = queryRange.mock.calls[3][0].signal;
    visible = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(interruptedSignal.aborted).toBe(true);
    visible = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(settle);
    expect(queryRange).toHaveBeenCalledTimes(9);
    visible = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    visible = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => { jest.advanceTimersByTime(60000); await settle(); });
    expect(queryRange).toHaveBeenCalledTimes(9);
  } finally {
    if (descriptor) Object.defineProperty(document, 'visibilityState', descriptor);
    jest.useRealTimers();
  }
});

test('서비스 선택은 진행 중인 공통 조회를 유지하고 응답만 화면에서 필터링한다', async () => {
  let resolveOld;
  queryRange.mockImplementation(({ query, end }) => {
    if (query.includes('http_server_requests_seconds_count') && !query.includes('bucket')) {
      return new Promise(resolve => { resolveOld = resolve; });
    }
    return Promise.resolve([]);
  });
  render(<MsaMonitoringDashboard />);
  const oldSignal = queryRange.mock.calls[1][0].signal;
  const instantCalls = queryInstant.mock.calls.length;
  const rangeCalls = queryRange.mock.calls.length;
  fireEvent.change(screen.getByLabelText('서비스'), { target: { value: 'user-service' } });
  expect(oldSignal.aborted).toBe(false);
  expect(queryInstant).toHaveBeenCalledTimes(instantCalls);
  expect(queryRange).toHaveBeenCalledTimes(rangeCalls);
  const chart = screen.getByRole('article', { name: '요청량 RPS 추이' });
  await act(async () => resolveOld([
    { metric: { application: 'user-service' }, values: [[queryRange.mock.calls[1][0].end, '2']] },
    { metric: { application: 'match-service' }, values: [[queryRange.mock.calls[1][0].end, '99']] },
  ]));
  expect(within(chart).getByText('2.00 RPS')).toBeInTheDocument();
  expect(within(chart).queryByText('99.00 RPS')).not.toBeInTheDocument();
});

test('느린 A31 응답이 30초를 넘으면 자동 요청을 중첩하지 않는다', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-01T05:00:00Z'));
  let resolveSlow;
  queryRange.mockImplementation(({ query }) => query === 'up'
    ? new Promise(resolve => { resolveSlow = resolve; }) : Promise.resolve([]));
  try {
    render(<MsaMonitoringDashboard />);
    await act(settle);
    expect(queryRange).toHaveBeenCalledTimes(3);
    await act(async () => { jest.advanceTimersByTime(30000); await settle(); });
    expect(queryRange).toHaveBeenCalledTimes(3);
    await act(async () => { resolveSlow([]); await settle(); });
    await act(async () => { jest.advanceTimersByTime(0); await settle(); });
    expect(queryRange).toHaveBeenCalledTimes(6);
  } finally { jest.useRealTimers(); }
});
