import { render, screen, within } from '@testing-library/react';
import FeignMetrics, { buildBreakerRows, buildFeignRows } from './FeignMetrics';

const client = name => `com.example.sporty.match.integration.${name}`;
const sample = (metric, value) => ({ metric, value: [100, String(value)] });
const calls = (counts, sums) => ({ kind: 'success', counts, sums });
const gauge = data => ({ kind: 'success', data });

test('Feign HTTP 200·404·5xx를 중복 없이 합산하고 Timer 초를 ms로 변환한다', () => {
  const data = calls([
    sample({ clientName: client('MemberClient'), http_status_code: '200' }, 2),
    sample({ clientName: client('MemberClient'), http_status_code: '404' }, 1),
    sample({ clientName: client('MemberClient'), http_status_code: '503' }, 1),
    sample({ clientName: client('FacilityClient'), http_status_code: '200' }, 0),
  ], [sample({ clientName: client('MemberClient') }, 0.8)]);
  expect(buildFeignRows(data)).toEqual([
    { client: 'MemberClient', calls: '4.0건', failures: '1.0건', rate: '25.0%', mean: '200 ms' },
    { client: 'FacilityClient', calls: '0.0건', failures: '0.0건', rate: '요청 없음', mean: '요청 없음' },
  ]);
  render(<FeignMetrics rangeLabel="최근 15분" data={{ calls: data, state: gauge([]), failureRate: gauge([]) }} />);
  expect(within(screen.getByText('OpenFeign HTTP').closest('article')).getByRole('table')).toHaveTextContent('25.0%');
  expect(screen.getByText(/HTTP 404는 5xx에 포함하지 않습니다/)).toBeInTheDocument();
});

test('Feign 빈 vector·sum 누락·비유한 값·음수는 실제 0으로 바꾸지 않는다', () => {
  const valid = sample({ clientName: client('MemberClient'), http_status_code: '200' }, 1);
  expect(buildFeignRows(calls([], []))[0].calls).toBe('미수집');
  expect(buildFeignRows(calls([valid], []))[0].mean).toBe('미수집');
  expect(buildFeignRows(calls([valid], [sample({ clientName: client('MemberClient') }, 'NaN')]))[0].mean).toBe('미수집');
  expect(buildFeignRows(calls([sample(valid.metric, 'Infinity')], []))[0].calls).toBe('미수집');
  expect(buildFeignRows(calls([sample(valid.metric, -1)], []))[0].calls).toBe('미수집');
  expect(buildFeignRows(calls([sample({ clientName: client('MemberClient'), http_status_code: 'IO_ERROR' }, 1)],
    [sample({ clientName: client('MemberClient') }, 0.1)]))[0]).toEqual(expect.objectContaining({ calls: '1.0건', failures: '0.0건', rate: '0.0%' }));
});

test('Circuit Breaker는 활성 state만 표시하고 -1·0·미수집·조회 실패를 구분한다', () => {
  const states = gauge([
    sample({ name: 'MemberClientgetLong', instance: 'match:8082', state: 'closed' }, 1),
    sample({ name: 'FacilityClientgetLong', instance: 'match:8082', state: 'open' }, 1),
    sample({ name: 'MemberClientprofilesList', instance: 'match:8082', state: 'half_open' }, 1),
  ]);
  const rates = gauge([
    sample({ name: 'MemberClientgetLong', instance: 'match:8082' }, 0),
    sample({ name: 'FacilityClientgetLong', instance: 'match:8082' }, 50),
    sample({ name: 'MemberClientprofilesList', instance: 'match:8082' }, -1),
  ]);
  expect(buildBreakerRows(states, rates).map(({ state, failureRate }) => [state, failureRate])).toEqual([
    ['CLOSED', '0.0%'], ['HALF_OPEN', '미계산'], ['OPEN', '50.0%'],
  ]);
  expect(buildBreakerRows(gauge([]), gauge([]))[0]).toEqual(expect.objectContaining({ state: '미수집', failureRate: '미수집' }));
  expect(buildBreakerRows({ kind: 'error' }, rates)[0]).toEqual(expect.objectContaining({ state: '조회 실패', failureRate: '0.0%' }));
  expect(buildBreakerRows(states, { kind: 'error' })[0]).toEqual(expect.objectContaining({ state: 'CLOSED', failureRate: '조회 실패' }));
  expect(buildBreakerRows(gauge([sample({ name: 'MemberClientgetLong', instance: 'match:8082', state: 'closed' }, 0)]), rates)[0].state).toBe('미수집');
  expect(buildBreakerRows(states, gauge([sample({ name: 'MemberClientgetLong', instance: 'match:8082' }, 'Infinity')]))[0].failureRate).toBe('미수집');
  render(<FeignMetrics rangeLabel="최근 15분" data={{ calls: { kind: 'error' }, state: states, failureRate: rates }} />);
  expect(within(screen.getByText('OpenFeign HTTP').closest('article')).getByRole('alert')).toHaveTextContent('조회 실패');
  expect(within(screen.getByText('Circuit Breaker').closest('article')).getByText('OPEN')).toBeInTheDocument();
});
