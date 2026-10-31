import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useMatchList from './useMatchList';
import { loadMyMatches, loadMyPage } from '../../mypage/api/myPageApi';
jest.mock('../../mypage/api/myPageApi', () => ({ loadMyPage: jest.fn(), loadMyMatches: jest.fn() }));
import { fetchMatchList, fetchRecommendedMatches, requestMatchParticipation } from '../api/matchListApi';

jest.mock('../api/matchListApi', () => ({
  ...jest.requireActual('../api/matchListApi'),
  fetchMatchList: jest.fn(), fetchRecommendedMatches: jest.fn(), requestMatchParticipation: jest.fn(),
}));
function wrapper({ children }) { return <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>; }
beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear();
  fetchMatchList.mockResolvedValue([]); fetchRecommendedMatches.mockResolvedValue([]);
  loadMyPage.mockResolvedValue({ profile: { nickname: '회원', district: 'MAPO', preferenceSports: ['TENNIS'] } });
  loadMyMatches.mockResolvedValue([]);
});

test('loads the signed-in profile and applies preferred sports', async () => {
  localStorage.setItem('at', 'test-token');
  fetchMatchList.mockResolvedValue([{ id: 1, sportType: 'TENNIS' }, { id: 2, sportType: 'SOCCER' }]);
  const { result } = renderHook(useMatchList, { wrapper });
  await waitFor(() => expect(result.current.profileStatus).toBe('success'));
  expect(result.current.profile).toMatchObject({ nickname: '회원', region: '마포구', sports: '테니스' });
  act(() => result.current.onFilterChange('preferredOnly', true));
  act(() => result.current.onApply());
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.matches.map(match => match.id)).toEqual([1]);
});

test('profile failures are distinct from signed-out state', async () => {
  localStorage.setItem('at', 'test-token');
  loadMyPage.mockRejectedValue(new Error('network'));
  const { result } = renderHook(useMatchList, { wrapper });
  await waitFor(() => expect(result.current.profileStatus).toBe('error'));
  expect(result.current.profile).toBeNull();
});

test('sport selection applies immediately while preserving unapplied filter edits', async () => {
  const { result } = renderHook(useMatchList, { wrapper });
  await waitFor(() => expect(result.current.status).toBe('success'));
  act(() => result.current.onFilterChange('region', '마포구'));
  act(() => result.current.onFilterChange('isFree', 'N'));
  act(() => result.current.onSportChange('TENNIS'));
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(fetchMatchList.mock.calls.at(-1)[0]).toMatchObject({ sportType: 'TENNIS', region: '', isFree: '' });
  expect(result.current.filters.region).toBe('마포구');
  act(() => result.current.onApply());
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(fetchMatchList.mock.calls.at(-1)[0]).toMatchObject({ sportType: 'TENNIS', region: '마포구', isFree: 'N' });
  act(() => result.current.onReset());
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.filters).toMatchObject({ sportType: '', region: '', isFree: '', preferredOnly: false });
});

test('filters only after apply, sorts and paginates results without extra server pagination', async () => {
  fetchMatchList.mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ id: i + 1, statusCode: i === 0 ? 'CLOSED' : 'RECRUITING', startAt: `2026-09-${28 - i}T12:00:00` })));
  const { result } = renderHook(useMatchList, { wrapper });
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.matches).toHaveLength(6);
  expect(result.current.totalCount).toBe(8);
  act(() => result.current.onLoadMore());
  expect(result.current.matches).toHaveLength(8);
  act(() => result.current.onSort('startAt'));
  expect(result.current.matches[0].id).toBe(8);
  act(() => result.current.onFilterChange('status', 'CLOSED'));
  expect(result.current.totalCount).toBe(8);
  act(() => result.current.onApply());
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.matches.map(x => x.id)).toEqual([1]);
  act(() => result.current.onReset());
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.totalCount).toBe(8);
  expect(fetchRecommendedMatches).not.toHaveBeenCalled();
});

test('a superseded response cannot overwrite a new query', async () => {
  let resolveOld;
  fetchMatchList.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  const { result } = renderHook(useMatchList, { wrapper });
  act(() => result.current.onFilterChange('sportType', 'TENNIS'));
  fetchMatchList.mockResolvedValue([{ id: 2, statusCode: 'RECRUITING' }]);
  act(() => result.current.onApply());
  await waitFor(() => expect(result.current.matches[0]?.id).toBe(2));
  await act(async () => resolveOld([{ id: 1 }]));
  expect(result.current.matches[0].id).toBe(2);
  expect(fetchMatchList.mock.calls[0][1].aborted).toBe(true);
});

test('retry keeps the last applied conditions, not unsaved filters', async () => {
  fetchMatchList.mockRejectedValueOnce({ response: { status: 500 } });
  const { result } = renderHook(useMatchList, { wrapper });
  await waitFor(() => expect(result.current.status).toBe('error'));
  act(() => result.current.onFilterChange('sportType', 'TENNIS'));
  await act(async () => result.current.onRetry());
  expect(fetchMatchList.mock.calls[1][0].sportType).toBe('');
  expect(result.current.status).toBe('success');
});

test('joins once, shows 501 failure, and allows retry without a false success', async () => {
  localStorage.setItem('at', 'test-token');
  let rejectJoin;
  requestMatchParticipation.mockImplementation(() => new Promise((_, reject) => { rejectJoin = reject; }));
  const { result } = renderHook(useMatchList, { wrapper });
  await waitFor(() => expect(result.current.status).toBe('success'));
  act(() => { result.current.onJoin(1); result.current.onJoin(1); });
  expect(requestMatchParticipation).toHaveBeenCalledTimes(1);
  expect(result.current.joins[1]).toEqual({ status: 'joining' });
  await act(async () => rejectJoin({ response: { status: 501 } }));
  expect(result.current.joins[1]).toEqual({ status: 'error', message: expect.stringContaining('준비 중') });
  requestMatchParticipation.mockResolvedValue({ matchId: 1 });
  await act(async () => result.current.onJoin(1));
  expect(result.current.joins[1]).toEqual({ status: 'done' });
  expect(fetchMatchList).toHaveBeenCalledTimes(2);
});

test('reloading after a join keeps the rows on screen', async () => {
  localStorage.setItem('at', 'test-token');
  fetchMatchList.mockResolvedValue([{ id: 1, statusCode: 'RECRUITING' }]);
  requestMatchParticipation.mockResolvedValue({ matchId: 1 });
  const { result } = renderHook(useMatchList, { wrapper });
  await waitFor(() => expect(result.current.status).toBe('success'));
  let finishReload;
  fetchMatchList.mockImplementationOnce(() => new Promise(resolve => { finishReload = resolve; }));
  await act(async () => { result.current.onJoin(1); });
  expect(result.current.status).toBe('success');
  expect(result.current.matches).toHaveLength(1);
  await act(async () => finishReload([{ id: 1, statusCode: 'CLOSED' }]));
  expect(result.current.matches[0].statusCode).toBe('CLOSED');
  expect(result.current.joins[1]).toEqual({ status: 'done' });
});

test('merges restored match states and lets a fresh join win', async () => {
  localStorage.setItem('at', 'test-token');
  loadMyMatches.mockResolvedValue([{ matchId: 1, role: 'PARTICIPANT' }, { matchId: 2, role: 'OWNER' }]);
  requestMatchParticipation.mockResolvedValue({ matchId: 1 });
  const { result } = renderHook(useMatchList, { wrapper });
  await waitFor(() => expect(result.current.joins[2]).toEqual({ status: 'owner' }));
  expect(result.current.joins[1]).toEqual({ status: 'done', restored: true });
  await act(async () => result.current.onJoin(1));
  expect(result.current.joins[1]).toEqual({ status: 'done' });
});

test('date tabs filter on the client, reset paging and clear with reset', async () => {
  const today = new Date();
  const key = new Date(today - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  fetchMatchList.mockResolvedValue([
    ...Array.from({ length: 7 }, (_, i) => ({ id: i + 1, startAt: `${key}T1${i}:00:00` })),
    { id: 8, startAt: '2099-01-01T10:00:00' },
  ]);
  const { result } = renderHook(useMatchList, { wrapper });
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.totalCount).toBe(8);
  const calls = fetchMatchList.mock.calls.length;
  act(() => result.current.onLoadMore());
  act(() => result.current.onDateTab('today'));
  expect(result.current.dateTab).toBe('today');
  expect(result.current.totalCount).toBe(7);
  expect(result.current.matches).toHaveLength(6);
  expect(fetchMatchList).toHaveBeenCalledTimes(calls);
  act(() => result.current.onReset());
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.dateTab).toBe('');
  expect(result.current.totalCount).toBe(8);
});

test('a quiet reload that replaces a running retry ends in an error, not endless loading', async () => {
  localStorage.setItem('at', 'test-token');
  requestMatchParticipation.mockResolvedValue({});
  fetchMatchList.mockReturnValueOnce(new Promise(() => {})).mockRejectedValueOnce(new Error('network'));
  fetchRecommendedMatches.mockReturnValueOnce(new Promise(() => {})).mockRejectedValueOnce(new Error('network'));
  const { result } = renderHook(useMatchList, { wrapper });
  await waitFor(() => expect(result.current.status).toBe('loading'));
  await act(async () => { await result.current.onJoin(7); });
  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.recommendationStatus).toBe('error');
});

test('a quiet reload failure keeps the rows already on screen', async () => {
  localStorage.setItem('at', 'test-token');
  requestMatchParticipation.mockResolvedValue({});
  fetchMatchList.mockResolvedValueOnce([{ id: 7, sportType: 'TENNIS' }]).mockRejectedValueOnce(new Error('network'));
  const { result } = renderHook(useMatchList, { wrapper });
  await waitFor(() => expect(result.current.status).toBe('success'));
  await act(async () => { await result.current.onJoin(7); });
  expect(result.current.status).toBe('success');
  expect(result.current.matches.map(match => match.id)).toEqual([7]);
});
