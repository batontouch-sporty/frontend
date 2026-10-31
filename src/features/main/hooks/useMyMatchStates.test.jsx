import { renderHook, waitFor } from '@testing-library/react';
import useMyMatchStates from './useMyMatchStates';
import { loadMyMatches } from '../../mypage/api/myPageApi';

jest.mock('../../mypage/api/myPageApi', () => ({ loadMyMatches: jest.fn() }));

afterEach(() => { localStorage.clear(); jest.resetAllMocks(); });

test('비로그인이면 조회하지 않는다', async () => {
  const { result } = renderHook(() => useMyMatchStates());
  await Promise.resolve();
  expect(loadMyMatches).not.toHaveBeenCalled();
  expect(result.current).toEqual({});
});

test('참가자는 복원한 신청 완료, 개설자는 내 매치 상태로 돌려준다', async () => {
  localStorage.setItem('at', 'token');
  loadMyMatches.mockResolvedValue([{ matchId: 1, role: 'PARTICIPANT' }, { matchId: 2, role: 'OWNER' }]);
  const { result } = renderHook(() => useMyMatchStates());
  await waitFor(() => expect(result.current).toEqual({
    1: { status: 'done', restored: true },
    2: { status: 'owner' },
  }));
  expect(loadMyMatches).toHaveBeenCalledWith(expect.objectContaining({ skipSessionRedirect: true }));
});

test('조회에 실패하면 빈 상태로 둔다', async () => {
  localStorage.setItem('at', 'token');
  loadMyMatches.mockRejectedValue(new Error('down'));
  const { result } = renderHook(() => useMyMatchStates());
  await waitFor(() => expect(loadMyMatches).toHaveBeenCalled());
  await Promise.resolve();
  expect(result.current).toEqual({});
});

test('언마운트하면 요청을 중단한다', async () => {
  localStorage.setItem('at', 'token');
  loadMyMatches.mockReturnValue(new Promise(() => {}));
  const { unmount } = renderHook(() => useMyMatchStates());
  await waitFor(() => expect(loadMyMatches).toHaveBeenCalled());
  unmount();
  expect(loadMyMatches.mock.calls[0][0].signal.aborted).toBe(true);
});
