import { fireEvent, render, screen, within } from '@testing-library/react';
import DomainMetrics, { buildAiTrend } from './DomainMetrics';

const instant = data => ({ kind: 'success', data: data.map(([labels, value]) => ({ metric: labels, value: [100, String(value)] })) });
const range = values => ({ kind: 'success', window: { start: 100, end: 160, step: 30 }, data: [{ metric: {}, values: values.map(([time, value]) => [time, String(value)]) }] });

test('Saga 최종·늦은 결과와 AI 가중 평균을 분리하고 실측 0을 유지한다', () => {
  render(<DomainMetrics rangeLabel="최근 15분" data={{
    saga: instant([[{ outcome: 'success' }, 2], [{ outcome: 'rejected' }, 0], [{ outcome: 'timed_out' }, 1]]),
    late: instant([[{ outcome: 'cleaned' }, 1], [{ outcome: 'rejected' }, 0]]),
    aiCount: instant([[{ type: 'search', outcome: 'success' }, 2], [{ type: 'draft', outcome: 'fallback' }, 1], [{ type: 'recommend', outcome: 'error' }, 1]]),
    aiSum: instant([[{ type: 'search', outcome: 'success' }, 0.4], [{ type: 'draft', outcome: 'fallback' }, 0.3], [{ type: 'recommend', outcome: 'error' }, 0.5]]),
    trendCount: range([[100, 2], [130, 0], [160, 4]]), trendSum: range([[100, 0.4], [130, 0], [160, 1.2]]),
  }} />);
  expect(within(screen.getByText('탈퇴 Saga 최종 결과').closest('article')).getByText('2.0')).toBeInTheDocument();
  expect(within(screen.getByText('시간 초과 뒤 늦은 결과').closest('article')).getByText('1.0')).toBeInTheDocument();
  const ai = screen.getByText('AI 처리 결과').closest('article');
  expect(within(ai).getByText('4.0')).toBeInTheDocument();
  expect(within(ai).getByText('50.0%')).toBeInTheDocument();
  expect(within(ai).getByText('300 ms')).toBeInTheDocument();
  expect(screen.getByText(/계측 대기/)).toBeInTheDocument();
  const chart = screen.getByRole('article', { name: 'AI 평균 응답시간 추이' });
  const point = within(chart).getByLabelText(/09:01 KST, 200 ms/);
  expect(point).toHaveAttribute('tabindex', '0');
  fireEvent.focus(point);
  expect(within(chart).getByRole('tooltip')).toHaveTextContent('200 ms');
  fireEvent.blur(point);
  expect(within(chart).queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.mouseEnter(point);
  expect(within(chart).getByRole('tooltip')).toHaveTextContent('200 ms');
});

test('AI 미수집·요청 없음·실패와 시계열 결측을 구분한다', () => {
  const empty = { saga: { kind: 'error' }, late: instant([]), aiCount: instant([]), aiSum: instant([]), trendCount: range([[100, 2], [130, 0], [160, 'NaN']]), trendSum: range([[100, 0.4], [130, 0], [160, 1]]) };
  const view = render(<DomainMetrics rangeLabel="최근 1시간" data={empty} />);
  expect(within(screen.getByText('탈퇴 Saga 최종 결과').closest('article')).getAllByText('조회 실패')).toHaveLength(3);
  expect(within(screen.getByText('AI 처리 결과').closest('article')).getAllByText('미수집')).toHaveLength(5);
  expect(buildAiTrend(empty.trendCount, empty.trendSum).map(point => point.value)).toEqual([200, null, null]);
  view.rerender(<DomainMetrics rangeLabel="최근 1시간" data={{ ...empty, aiCount: instant([[{ type: 'search', outcome: 'success' }, 0]]) }} />);
  expect(within(screen.getByText('AI 처리 결과').closest('article')).getAllByText('요청 없음')).toHaveLength(4);
  view.rerender(<DomainMetrics rangeLabel="최근 1시간" data={{ ...empty,
    aiCount: instant([[{ type: 'search', outcome: 'success' }, 1], [{ type: 'draft', outcome: 'fallback' }, 1]]),
    aiSum: instant([[{ type: 'search', outcome: 'success' }, 0.2]]),
  }} />);
  expect(within(screen.getByText('AI 처리 결과').closest('article')).getByText('미수집')).toBeInTheDocument();
});
