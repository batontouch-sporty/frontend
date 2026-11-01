import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MsaMonitoringDashboard, { statusFromUp } from './MsaMonitoringDashboard';
import { queryInstant, queryRange } from '../api/adminApi';

jest.mock('../api/adminApi', () => ({ queryInstant: jest.fn(), queryRange: jest.fn() }));

const up = (job, value) => ({ metric: { job }, value: [100, String(value)] });
const range = (job, values) => ({ metric: { job }, values });

beforeEach(() => {
  queryInstant.mockReset().mockResolvedValue([]);
  queryRange.mockReset().mockResolvedValue([]);
});

test('진입 즉시 A30·A31의 검증된 up을 조회하고 타깃 부재와 실제 DOWN을 구분한다', async () => {
  queryInstant.mockResolvedValue([up('user-service', 1), up('match-service', 0), up('prometheus', 1)]);
  queryRange.mockResolvedValue([range('user-service', [[100, '1'], [160, '0']])]);
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(screen.getByText('1 / 2')).toBeInTheDocument());
  expect(queryInstant).toHaveBeenCalledWith({ query: 'up', signal: expect.any(AbortSignal) });
  expect(queryRange).toHaveBeenCalledWith(expect.objectContaining({ query: 'up', step: 60, signal: expect.any(AbortSignal) }));
  const rows = screen.getAllByRole('row');
  expect(within(rows[1]).getByText('UP')).toBeInTheDocument();
  expect(within(rows[2]).getByText('DOWN')).toBeInTheDocument();
  expect(within(rows[3]).getByText('미수집')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /서비스별 UP 상태 추이/ })).toBeInTheDocument();
  expect(screen.getAllByText('미연동').length).toBeGreaterThan(4);
});

test('0·복수 인스턴스·없는 job은 각기 다른 상태다', () => {
  expect(statusFromUp([up('user-service', 0)], 'user-service')).toBe('down');
  expect(statusFromUp([up('user-service', 0), up('user-service', 1)], 'user-service')).toBe('partial');
  expect(statusFromUp([up('prometheus', 1)], 'user-service')).toBe('missing');
  expect(statusFromUp([up('user-service', 1)], 'user-service')).toBe('up');
});

test('서비스 타깃이 하나도 없으면 정상 개수를 0으로 단정하지 않는다', async () => {
  queryInstant.mockResolvedValue([up('prometheus', 1)]);
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(within(screen.getByRole('region', { name: '운영 요약' })).getByText('미수집')).toBeInTheDocument());
  expect(screen.queryByText('0 / 5')).not.toBeInTheDocument();
});

test('시간 범위·서비스 필터·새로고침이 실제 조회와 강조 행을 갱신한다', async () => {
  queryInstant.mockResolvedValue([up('user-service', 1), up('match-service', 1)]);
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(screen.getByText('2 / 2')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('조회 시간'), { target: { value: '24h' } });
  await waitFor(() => expect(queryRange).toHaveBeenLastCalledWith(expect.objectContaining({ step: 300 })));
  fireEvent.change(screen.getByLabelText('서비스'), { target: { value: 'user-service' } });
  expect(screen.getByText('1 / 1')).toBeInTheDocument();
  expect(document.querySelectorAll('.selected-row')).toHaveLength(1);
  const previousCalls = queryInstant.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: /새로고침/ }));
  await waitFor(() => expect(queryInstant.mock.calls.length).toBeGreaterThan(previousCalls));
});

test('5개 탭과 키보드 이동, 미연동 영역, 상세 데이터 펼치기가 동작한다', async () => {
  queryInstant.mockResolvedValue([up('user-service', 1)]);
  queryRange.mockResolvedValue([range('user-service', [[100, '1'], [160, '0']])]);
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(screen.getByText('1 / 1')).toBeInTheDocument());
  expect(screen.getAllByRole('tab')).toHaveLength(5);
  fireEvent.keyDown(screen.getByRole('tab', { name: '서비스 개요' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Feign · CB' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'msa-tab-feign');
  for (const name of ['Kafka', 'JVM · 리소스', '도메인 · AI']) {
    fireEvent.click(screen.getByRole('tab', { name }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('미연동');
  }
  fireEvent.click(screen.getByRole('tab', { name: '서비스 개요' }));
  fireEvent.click(screen.getByText('상세 데이터 보기'));
  expect(within(screen.getByText('상세 데이터 보기').closest('details')).getByRole('table')).toHaveTextContent('user-service');
});

test('조회 오류를 DOWN으로 표시하지 않고 재시도하며 범위 조회 실패도 분리한다', async () => {
  queryInstant.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([up('user-service', 1)]);
  queryRange.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
  render(<MsaMonitoringDashboard />);
  await waitFor(() => expect(screen.getAllByText('조회 실패').length).toBeGreaterThan(0));
  expect(screen.queryByText('DOWN')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /새로고침/ }));
  await waitFor(() => expect(screen.getByText('1 / 1')).toBeInTheDocument());
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
