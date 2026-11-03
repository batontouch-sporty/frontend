import { fireEvent, render, screen, within } from '@testing-library/react';
import DomainMetrics, { buildAiTrend } from './DomainMetrics';

const instant = data => ({ kind: 'success', data: data.map(([labels, value]) => ({ metric: labels, value: [100, String(value)] })) });
const range = values => ({ kind: 'success', window: { start: 100, end: 160, step: 30 }, data: [{ metric: {}, values: values.map(([time, value]) => [time, String(value)]) }] });

test('24시간 AI 추이의 설명은 실제 15분 rate 창을 표시한다', () => {
  render(<DomainMetrics rangeLabel="최근 24시간" rateWindowMinutes={15} data={{}} />);
  expect(screen.getByText('전체 AI 유형 · 15분 rate의 sum / count · ms')).toBeInTheDocument();
});

test('희소 AI 응답은 마지막 구간이 비어도 측정 지점을 그리고 최근 값을 알린다', () => {
  render(<DomainMetrics rangeLabel="최근 24시간" rateWindowMinutes={15} data={{
    saga: instant([]), late: instant([]), aiCount: instant([]), aiSum: instant([]),
    trendCount: range([[100, 2], [130, 0], [160, 0]]),
    trendSum: range([[100, 0.4], [130, 0], [160, 0]]),
  }} />);
  const chart = screen.getByRole('article', { name: 'AI 평균 응답시간 추이' });
  expect(within(chart).getByText('최근 측정 200 ms')).toBeInTheDocument();
  expect(chart.querySelectorAll('circle[fill="#3c83bc"]')).toHaveLength(1);
  fireEvent.focus(within(chart).getByLabelText(/200 ms/));
  expect(within(chart).getByRole('tooltip')).toHaveTextContent('200 ms');
});

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
  expect(within(screen.getByText('AI 처리 결과').closest('article')).getAllByText('미수집')).toHaveLength(6);
  expect(buildAiTrend(empty.trendCount, empty.trendSum).map(point => point.value)).toEqual([200, null, null]);
  view.rerender(<DomainMetrics rangeLabel="최근 1시간" data={{ ...empty, aiCount: instant([[{ type: 'search', outcome: 'success' }, 0]]) }} />);
  expect(within(screen.getByText('AI 처리 결과').closest('article')).getAllByText('요청 없음')).toHaveLength(5);
  view.rerender(<DomainMetrics rangeLabel="최근 1시간" data={{ ...empty,
    aiCount: instant([[{ type: 'search', outcome: 'success' }, 1], [{ type: 'draft', outcome: 'fallback' }, 1]]),
    aiSum: instant([[{ type: 'search', outcome: 'success' }, 0.2]]),
  }} />);
  expect(within(screen.getByText('AI 처리 결과').closest('article')).getByText('미수집')).toBeInTheDocument();
});

test('AI 업무 거절은 요청량과 가중 평균에 포함하고 직접 성공률 분모에서는 제외한다', () => {
  const input = {
    saga: instant([[{ outcome: 'success' }, 1]]), late: instant([]),
    trendCount: range([[100, 10], [130, 0], [160, 10]]),
    trendSum: range([[100, 2], [130, 0], [160, 2]]),
    aiCount: instant([
      [{ type: 'search', outcome: 'success' }, 2],
      [{ type: 'draft', outcome: 'fallback' }, 1],
      [{ type: 'recommend', outcome: 'rejected' }, 6],
      [{ type: 'recommend', outcome: 'error' }, 1],
    ]),
    aiSum: instant([
      [{ type: 'search', outcome: 'success' }, 0.4],
      [{ type: 'draft', outcome: 'fallback' }, 0.3],
      [{ type: 'recommend', outcome: 'rejected' }, 0.6],
      [{ type: 'recommend', outcome: 'error' }, 0.7],
    ]),
  };
  const view = render(<DomainMetrics rangeLabel="최근 15분" data={input} />);
  const value = label => screen.getByText(label).closest('div').querySelector('dd').textContent;
  expect(value('요청량')).toBe('10.0');
  expect(value('직접 성공률')).toBe('50.0%');
  expect(value('Fallback')).toBe('1.0');
  expect(value('업무 거절')).toBe('6.0');
  expect(value('오류')).toBe('1.0');
  expect(value('평균 응답시간')).toBe('200 ms');
  expect(screen.getByText('직접 성공률은 업무 거절을 제외합니다.')).toBeInTheDocument();
  expect(within(screen.getByText('탈퇴 Saga 최종 결과').closest('article')).getByText('1.0')).toBeInTheDocument();
  expect(buildAiTrend(input.trendCount, input.trendSum)[0].value).toBe(200);

  view.rerender(<DomainMetrics rangeLabel="최근 15분" data={{ ...input,
    aiCount: instant([[{ type: 'recommend', outcome: 'rejected' }, 3]]),
    aiSum: instant([[{ type: 'recommend', outcome: 'rejected' }, 0.6]]),
  }} />);
  expect(value('요청량')).toBe('3.0');
  expect(value('직접 성공률')).toBe('계산 대상 없음');
  expect(value('업무 거절')).toBe('3.0');
  expect(value('평균 응답시간')).toBe('200 ms');

  view.rerender(<DomainMetrics rangeLabel="최근 15분" data={{ ...input,
    aiCount: instant([[{ type: 'draft', outcome: 'fallback' }, 2]]),
    aiSum: instant([[{ type: 'draft', outcome: 'fallback' }, 0.2]]),
  }} />);
  expect(value('직접 성공률')).toBe('0.0%');
  expect(value('업무 거절')).toBe('0.0');
});

test('AI 유효 0, 빈 vector, 비유한 값, 누락된 Timer sum과 조회 실패를 구분한다', () => {
  const input = { saga: instant([]), late: instant([]), trendCount: range([]), trendSum: range([]),
    aiCount: instant([[{ type: 'search', outcome: 'success' }, 0]]),
    aiSum: instant([[{ type: 'search', outcome: 'success' }, 0]]) };
  const view = render(<DomainMetrics rangeLabel="최근 15분" data={input} />);
  const value = label => screen.getByText(label).closest('div').querySelector('dd').textContent;
  expect(value('요청량')).toBe('0.0');
  expect(value('직접 성공률')).toBe('요청 없음');
  expect(value('평균 응답시간')).toBe('요청 없음');

  view.rerender(<DomainMetrics rangeLabel="최근 15분" data={{ ...input, aiCount: instant([]) }} />);
  expect(value('요청량')).toBe('미수집');
  view.rerender(<DomainMetrics rangeLabel="최근 15분" data={{ ...input,
    aiCount: instant([[{ type: 'search', outcome: 'success' }, 'NaN']]),
  }} />);
  expect(value('요청량')).toBe('미수집');
  view.rerender(<DomainMetrics rangeLabel="최근 15분" data={{ ...input,
    aiCount: instant([[{ type: 'search', outcome: 'success' }, 1]]), aiSum: instant([]),
  }} />);
  expect(value('요청량')).toBe('1.0');
  expect(value('평균 응답시간')).toBe('미수집');
  view.rerender(<DomainMetrics rangeLabel="최근 15분" data={{ ...input,
    aiCount: instant([[{ type: 'recommend', outcome: 'rejected' }, 1]]),
    aiSum: instant([[{ type: 'recommend', outcome: 'rejected' }, 'Infinity']]),
  }} />);
  expect(value('평균 응답시간')).toBe('미수집');
  view.rerender(<DomainMetrics rangeLabel="최근 15분" data={{ ...input, aiCount: { kind: 'error' } }} />);
  expect(value('요청량')).toBe('조회 실패');
});
