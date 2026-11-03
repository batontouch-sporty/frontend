import { render, screen, within } from '@testing-library/react';
import KafkaMetrics, { buildCounterRows, buildLagRows, lagKpi } from './KafkaMetrics';

const instant = data => ({ kind: 'success', data: data.map(([metric, raw]) => ({ metric, value: [100, String(raw)] })) });
const trend = data => ({ kind: 'success', window: { start: 100, end: 160, step: 30 }, data: data.map(([metric, values]) => ({ metric, values: values.map(([time, raw]) => [time, String(raw)]) })) });
const lag = instant([[{ consumergroup: 'notification-service', topic: 'match.status-changed.v1' }, 0],
  [{ consumergroup: 'notification-service', topic: 'match.joined.v1' }, 2]]);
const exporter = instant([[{ job: 'kafka-exporter' }, 1]]);
const brokers = instant([[{ job: 'kafka-exporter' }, 1]]);
const kpi = (lag, health = exporter, brokerHealth = brokers) => lagKpi(lag, health, brokerHealth);

test('처리 성공·DLT 발행 증가량과 5분 처리율을 토픽·그룹별로 표시한다', () => {
  const processedCount = instant([[{ topic: 'match.status-changed.v1', group: 'notification-service' }, 2.2]]);
  const processedTrend = trend([[{ topic: 'match.status-changed.v1', group: 'notification-service' }, [[100, 0], [130, 0.01], [160, 0.02]]]]);
  const dltCount = instant([[{ topic: 'match.status-changed.v1' }, 1.1]]);
  const dltTrend = trend([[{ topic: 'match.status-changed.v1' }, [[100, 0], [130, 0.003], [160, 0.005]]]]);
  expect(buildCounterRows(processedCount, processedTrend, ['topic', 'group'])).toEqual([
    { parts: ['match.status-changed.v1', 'notification-service'], count: '2.2건', rate: '0.020건/초' },
  ]);
  render(<KafkaMetrics rangeLabel="최근 15분" lag={lag} exporter={exporter} brokers={brokers} data={{
    processedCount, processedTrend, dltCount, dltTrend,
    maxLag: instant([[{ consumergroup: 'notification-service', topic: 'match.status-changed.v1' }, 0],
      [{ consumergroup: 'notification-service', topic: 'match.joined.v1' }, 2]]),
  }} />);
  expect(within(screen.getByText('Consumer 처리 성공').closest('article')).getByRole('table')).toHaveTextContent('2.2건');
  expect(within(screen.getByText('DLT 발행 성공').closest('article')).getAllByRole('table')[0]).toHaveTextContent('1.1건');
  expect(screen.getByText('DLT 발행 추이 · 건/초')).toBeInTheDocument();
  expect(screen.getByText('성공 발행 건수 계측 미확인')).toBeInTheDocument();
});

test('Lag는 실제 0·양수만 합산하고 빈 vector·Exporter DOWN·비유한 값과 중복 레이블을 구분한다', () => {
  expect(kpi(lag)).toBe('2건');
  expect(kpi(instant([[{ consumergroup: 'notification-service', topic: 'match.status-changed.v1' }, 0]]))).toBe('0건');
  expect(kpi(instant([]))).toBe('미수집');
  expect(kpi(lag, instant([[{ job: 'sporty-services' }, 1]]))).toBe('미수집');
  expect(kpi(lag, instant([[{ job: 'kafka-exporter' }, 0]]))).toBe('Exporter DOWN');
  expect(kpi(lag, exporter, instant([[{ job: 'kafka-exporter' }, 0]]))).toBe('Broker 미연결');
  expect(kpi({ kind: 'error' })).toBe('조회 실패');
  expect(kpi(instant([[{ consumergroup: 'notification-service', topic: 'match.status-changed.v1' }, 'NaN']]))).toBe('미수집');
  expect(kpi(instant([[{ consumergroup: 'notification-service', topic: 'match.status-changed.v1' }, -1]]))).toBe('미수집');
  expect(kpi(instant([[{ consumergroup: 'notification-service', topic: 'match.status-changed.v1' }, 0.4]]))).toBe('미수집');
  expect(buildLagRows(lag, instant([[{ consumergroup: 'notification-service', topic: 'match.status-changed.v1' }, 0]]))[0]).toEqual({
    parts: ['notification-service', 'match.joined.v1'], total: '2건', maximum: '미수집',
  });
  const duplicated = instant([[{ consumergroup: 'notification-service', topic: 'match.status-changed.v1' }, 2],
    [{ consumergroup: 'notification-service', topic: 'match.status-changed.v1' }, 2]]);
  expect(kpi(duplicated)).toBe('미수집');
  expect(buildLagRows(duplicated, instant([]))[0].total).toBe('미수집');
});

test('Counter 빈 값·유효한 0·조회 실패·NaN과 중복 label을 구분한다', () => {
  const metric = { topic: 'match.status-changed.v1', group: 'notification-service' };
  expect(buildCounterRows(instant([[metric, 0]]), trend([[metric, [[100, 0]]]]), ['topic', 'group'])[0])
    .toEqual({ parts: ['match.status-changed.v1', 'notification-service'], count: '0.0건', rate: '0.000건/초' });
  expect(buildCounterRows(instant([]), trend([]), ['topic', 'group'])).toEqual([]);
  expect(buildCounterRows(instant([[metric, 'Infinity']]), trend([[metric, [[100, 0]]]]), ['topic', 'group'])[0].count).toBe('미수집');
  expect(buildCounterRows(instant([[{ topic: 'missing-group' }, 2]]), trend([]), ['topic', 'group'])).toEqual([]);
  expect(buildCounterRows({ kind: 'error' }, trend([[metric, [[100, 0.1]]]]), ['topic', 'group'])[0])
    .toEqual({ parts: ['match.status-changed.v1', 'notification-service'], count: '조회 실패', rate: '0.100건/초' });
  expect(buildCounterRows(instant([[metric, 1], [metric, 1]]), trend([]), ['topic', 'group'])[0].count).toBe('미수집');
});
