import { fireEvent, render, screen, within } from '@testing-library/react';
import { buildPerformanceSeries, PerformanceChart } from './MonitoringTimeSeries';

const services = [['user-service'], ['match-service'], ['facility-service'], ['ai-service'], ['notification-service']];
const window = { start: 100, end: 190, step: 30 };
const request = (entries, currentWindow = window) => ({ kind: 'success', window: currentWindow, data: entries.map(([application, values]) => ({ metric: { application }, values })) });

test('RPS 전체 합계는 실제 관측 서비스만 더하고 누락을 부분 집계로 밝힌다', () => {
  const rps = request([
    ['user-service', [[100, '1'], [130, '0'], [160, '2'], [70, '999']]],
    ['match-service', [[100, '3'], [130, '0'], [160, 'NaN']]],
    ['gateway-service', [[100, '999']]],
  ]);
  const points = buildPerformanceSeries(rps, rps, services, 'all', 'rps');
  expect(points.map(point => point.value)).toEqual([4, 0, 2, null]);
  expect(points[0].state).toBe('부분 집계 2/5');
  expect(points[1].state).toBe('부분 집계 2/5');
  expect(points[2].state).toBe('부분 집계 1/5');
  expect(points[3].state).toBe('미수집');
  expect(buildPerformanceSeries(rps, rps, services, 'user-service', 'rps')[1]).toMatchObject({ value: 0, state: '요청 없음' });
});

test('P95는 서비스별 최대 초 값을 ms로 바꾸고 요청 없음·비유한 값·미수집을 구분한다', () => {
  const p95 = request([
    ['user-service', [[100, '0.15'], [130, 'NaN'], [160, '0.2']]],
    ['match-service', [[100, '0.4'], [130, 'Inf']]],
  ]);
  const rps = request([
    ['user-service', [[100, '2'], [130, '1'], [160, '0']]],
    ['match-service', [[100, '3'], [130, '1'], [160, '0']]],
  ]);
  const all = buildPerformanceSeries(p95, rps, services.slice(0, 2), 'all', 'p95');
  expect(all[0]).toMatchObject({ value: 400, state: null });
  expect(all[1]).toMatchObject({ value: null, state: '부분 집계 0/2 · 비유한 값' });
  expect(all[2]).toMatchObject({ value: null, state: '요청 없음' });
  const selected = buildPerformanceSeries(p95, rps, services, 'user-service', 'p95');
  expect(selected[2]).toMatchObject({ value: null, state: '요청 없음' });
  expect(selected[3]).toMatchObject({ value: null, state: 'RPS 미수집' });
});

test('P95 부분 집계는 요청 있는 서비스만 분모로 삼고 RPS 미수집은 요청 없음으로 추정하지 않는다', () => {
  const p95 = request([
    ['user-service', [[100, '0.2'], [130, '0.3'], [160, '0.4']]],
    ['match-service', [[100, 'NaN'], [130, 'NaN'], [160, 'NaN']]],
  ]);
  const rps = request([
    ['user-service', [[100, '2'], [130, '2'], [160, '2']]],
    ['match-service', [[100, '0'], [130, '1']]],
  ]);
  const points = buildPerformanceSeries(p95, rps, services.slice(0, 2), 'all', 'p95');
  expect(points[0]).toMatchObject({ value: 200, state: null, coverage: 1 });
  expect(points[1]).toMatchObject({ value: 300, state: '부분 집계 1/2', coverage: 1 });
  expect(points[2]).toMatchObject({ value: 400, state: 'RPS 미수집', coverage: 1 });
});

test('RPS 차트는 누락 구간을 선으로 잇지 않고 초점에서 실제 시각과 값을 보여준다', () => {
  const rps = request([['user-service', [[100, '1'], [160, '3']]]]);
  render(<PerformanceChart metric="rps" request={rps} rpsRequest={rps} services={services} selected="user-service" />);
  const chart = screen.getByRole('article', { name: '요청량 RPS 추이' });
  expect(chart.querySelectorAll('.msa-time-line')).toHaveLength(2);
  expect(within(chart).getByText('미수집')).toBeInTheDocument();
  const point = within(chart).getByLabelText(/09:01:40 KST, 1.00 RPS/);
  fireEvent.focus(point);
  expect(within(chart).getByRole('tooltip')).toHaveTextContent('1.00 RPS');
  fireEvent.blur(point);
  expect(within(chart).queryByRole('tooltip')).not.toBeInTheDocument();
});
