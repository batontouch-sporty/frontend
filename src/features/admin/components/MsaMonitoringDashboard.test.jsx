import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MsaMonitoringDashboard, { statusFromUp } from './MsaMonitoringDashboard';
import { buildHeatmap } from './MonitoringVisualizations';
import { buildPerformanceSeries } from './MonitoringTimeSeries';
import { queryInstant, queryRange } from '../api/adminApi';

jest.mock('../api/adminApi', () => ({ queryInstant: jest.fn(), queryRange: jest.fn() }));

const labels = application => application === 'prometheus'
  ? { job: 'prometheus' } : { job: 'sporty-services', application };
const up = (application, value) => ({ metric: labels(application), value: [100, String(value)] });
const range = (application, values) => ({ metric: labels(application), values });
const aggregate = (application, value) => ({ metric: { application }, value: [100, String(value)] });

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
  expect(screen.getByText('미연동')).toBeInTheDocument();
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
  await waitFor(() => expect(queryInstant).toHaveBeenCalledTimes(9));
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

test('5개 탭과 키보드 이동, 미연동 영역, 상세 데이터 펼치기가 동작한다', async () => {
  queryInstant.mockResolvedValue([up('user-service', 1)]);
  queryRange.mockResolvedValue([range('user-service', [[100, '1'], [160, '0']])]);
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(within(screen.getByRole('region', { name: '운영 요약' })).getByText('1 / 5')).toBeInTheDocument());
  expect(screen.getAllByRole('tab')).toHaveLength(5);
  fireEvent.keyDown(screen.getByRole('tab', { name: '서비스 개요' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Feign · CB' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'msa-tab-feign');
  for (const name of ['Kafka', '도메인 · AI']) {
    fireEvent.click(screen.getByRole('tab', { name }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('미연동');
  }
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

test('Heap 비율은 동일 인스턴스의 사용량·최대치를 비교하고 최대치 부재를 계산 불가로 표시한다', async () => {
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
  await waitFor(() => expect(within(chart).getByText('100.0 MiB · 50.0%')).toBeInTheDocument());
  expect(within(chart).getByText('20.0 MiB · 계산 불가')).toBeInTheDocument();
  expect(within(chart).getByText('12.0%')).toBeInTheDocument();
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

test('HTTP 상태 코드 조회 실패와 Heap 최대치 조회 실패를 실제 0으로 표시하지 않는다', async () => {
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

test('Heap 풀 하나의 최대치가 유효하지 않으면 다른 풀의 최대치로 사용률을 만들지 않는다', async () => {
  queryInstant.mockImplementation(({ query }) => {
    if (query === 'up') return Promise.resolve([up('user-service', 1)]);
    if (query.includes('jvm_memory_max_bytes')) return Promise.resolve([
      { metric: { application: 'user-service', instance: 'a', id: 'eden' }, value: [100, String(200 * 1048576)] },
      { metric: { application: 'user-service', instance: 'a', id: 'old' }, value: [100, '-1'] },
    ]);
    if (query.includes('jvm_memory_used_bytes') && query.includes('instance')) return Promise.resolve([
      { metric: { application: 'user-service', instance: 'a' }, value: [100, String(100 * 1048576)] },
    ]);
    if (query.includes('jvm_memory_used_bytes')) return Promise.resolve([aggregate('user-service', 100 * 1048576)]);
    return Promise.resolve([]);
  });
  render(<MsaMonitoringDashboard />);
  const chart = screen.getByRole('article', { name: '서비스별 CPU와 Heap 사용량' });
  await waitFor(() => expect(within(chart).getByText('100.0 MiB · 계산 불가')).toBeInTheDocument());
});

const settle = async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve(); };

test('30초 Polling은 현재 시각으로 범위를 밀고 OFF·수동 갱신·언마운트를 따른다', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-01T05:00:00Z'));
  try {
    const view = render(<MsaMonitoringDashboard />);
    await act(settle);
    expect(queryInstant).toHaveBeenCalledTimes(9);
    expect(queryRange).toHaveBeenCalledTimes(3);
    const first = queryRange.mock.calls[0][0];
    expect(first.end - first.start).toBe(900);
    await act(async () => { jest.advanceTimersByTime(30000); await settle(); });
    expect(queryRange).toHaveBeenCalledTimes(6);
    expect(queryRange.mock.calls[3][0]).toEqual(expect.objectContaining({ start: first.start + 30, end: first.end + 30, step: 30 }));
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

test('서비스 변경은 이전 A30·A31을 취소하고 늦은 시계열 응답을 무효화한다', async () => {
  let resolveOld;
  let rpsCalls = 0;
  queryRange.mockImplementation(({ query, end }) => {
    if (query.includes('http_server_requests_seconds_count') && !query.includes('bucket')) {
      rpsCalls += 1;
      if (rpsCalls === 1) return new Promise(resolve => { resolveOld = resolve; });
      return Promise.resolve([{ metric: { application: 'user-service' }, values: [[end, '2']] }]);
    }
    return Promise.resolve([]);
  });
  render(<MsaMonitoringDashboard />);
  const oldSignal = queryRange.mock.calls[1][0].signal;
  fireEvent.change(screen.getByLabelText('서비스'), { target: { value: 'user-service' } });
  expect(oldSignal.aborted).toBe(true);
  const chart = screen.getByRole('article', { name: '요청량 RPS 추이' });
  await waitFor(() => expect(within(chart).getByText('2.00 RPS')).toBeInTheDocument());
  await act(async () => resolveOld([{ metric: { application: 'user-service' }, values: [[queryRange.mock.calls[1][0].end, '99']] }]));
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
