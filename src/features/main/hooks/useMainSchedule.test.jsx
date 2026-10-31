import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useMainSchedule from './useMainSchedule';
import { fetchRecruitingMatches } from '../api/aiMatchApi';
import { requestMatchParticipation } from '../../match/api/matchListApi';
import { loadMyMatches } from '../../mypage/api/myPageApi';

jest.mock('../api/aiMatchApi', () => ({ fetchRecruitingMatches: jest.fn() }));
jest.mock('../../match/api/matchListApi', () => ({ requestMatchParticipation: jest.fn(), matchRequestError: jest.fn() }));
jest.mock('../../mypage/api/myPageApi', () => ({ loadMyPage: jest.fn(() => Promise.reject(new Error('expired'))), loadMyMatches: jest.fn(() => Promise.resolve([])) }));

const wrapper = ({ children }) => <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>;

afterEach(() => { localStorage.clear(); jest.clearAllMocks(); });

test('만료된 토큰이 정리되면 공개 조회로 다시 시도해 보드를 보여 준다', async () => {
  localStorage.setItem('at', 'expired');
  fetchRecruitingMatches
    .mockImplementationOnce(() => { localStorage.removeItem('at'); return Promise.reject(new Error('401')); })
    .mockResolvedValueOnce([]);
  const { result } = renderHook(() => useMainSchedule(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(fetchRecruitingMatches).toHaveBeenCalledTimes(2);
});

test('복원한 내 매치 상태를 합치고 방금 신청한 상태를 우선한다', async () => {
  localStorage.setItem('at', 'token');
  fetchRecruitingMatches.mockResolvedValue([]);
  loadMyMatches.mockResolvedValueOnce([{ matchId: 1, role: 'PARTICIPANT' }, { matchId: 2, role: 'OWNER' }]);
  requestMatchParticipation.mockResolvedValue({});
  const { result } = renderHook(() => useMainSchedule(), { wrapper });
  await waitFor(() => expect(result.current.joins[2]).toEqual({ status: 'owner' }));
  expect(result.current.joins[1]).toEqual({ status: 'done', restored: true });
  await act(async () => { await result.current.join({ id: 1 }); });
  expect(result.current.joins[1]).toEqual({ status: 'done' });
});

test('토큰이 없으면 실패를 재시도하지 않고 오류로 둔다', async () => {
  fetchRecruitingMatches.mockRejectedValue(new Error('down'));
  const { result } = renderHook(() => useMainSchedule(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(fetchRecruitingMatches).toHaveBeenCalledTimes(1);
});
