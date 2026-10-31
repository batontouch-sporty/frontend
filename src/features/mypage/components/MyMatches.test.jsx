import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import MyMatches from './MyMatches';
import { loadMyMatches } from '../api/myPageApi';
import api from '../../../api/axios';

jest.mock('../../../api/axios', () => ({ get: jest.fn() }));
afterEach(() => jest.resetAllMocks());

// /api/matches/me 응답 그대로. 실력·성별 필드는 없다.
const match = { matchId: 7, title: '주말 풋살', role: 'OWNER', startAt: '2099-10-03T18:00:00', endAt: '2099-10-03T20:00:00',
  status: 'RECRUITING', region: '성동구', facilityName: '풋살장', sportType: 'FUTSAL', numCurrentParticipant: 7,
  maxParticipant: 12, isFree: false };

function Detail() { return <p>매치 상세 {useParams().matchId}</p>; }
function showList(onUnauthorized = jest.fn()) {
  return render(<MemoryRouter initialEntries={['/mypage']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/mypage" element={<MyMatches loadMyMatches={loadMyMatches} onUnauthorized={onUnauthorized} />} />
      <Route path="/matches/:matchId" element={<Detail />} />
    </Routes>
  </MemoryRouter>);
}

const titles = () => screen.getAllByRole('link').map(link => link.textContent).filter(text => text.includes('풋살'));

test('다가오는 매치를 시간순으로 보여 주고 내가 만든 매치만 표시하며 상세로 이동한다', async () => {
  api.get.mockResolvedValue({ data: [match, { ...match, matchId: 9, title: '이른 풋살', role: 'PARTICIPANT', isFree: true, startAt: '2099-10-02T18:00:00', endAt: '2099-10-02T20:00:00' }] });
  showList();
  expect(await screen.findByText('내가 만든 매치')).toBeInTheDocument();
  expect(titles()).toEqual(['이른 풋살', '주말 풋살']);
  expect(screen.getAllByRole('article')[1]).toHaveTextContent('10.03');
  expect(screen.getAllByRole('article')[1]).toHaveTextContent('성동구 풋살장');
  expect(screen.getByText('내가 만든 매치').closest('li')).toHaveTextContent('주말 풋살');
  expect(screen.getByRole('link', { name: '주말 풋살' })).toHaveAttribute('href', '/matches/7');
  fireEvent.click(screen.getByRole('link', { name: '이른 풋살' }));
  expect(screen.getByText('매치 상세 9')).toBeInTheDocument();
});

test('끝났거나 취소된 매치는 지난 매치로 내리고 다가오는 매치가 없으면 매치 찾기로 안내한다', async () => {
  api.get.mockResolvedValue({ data: [
    { ...match, title: '어제 풋살', matchId: 1, startAt: '2020-01-01T10:00:00', endAt: '2020-01-01T12:00:00' },
    { ...match, title: '취소 풋살', matchId: 2, status: 'CANCELLED' },
  ] });
  showList();
  expect(await screen.findByText('지난 매치 2개')).toBeInTheDocument();
  expect(screen.getByText('다가오는 매치가 없어요.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '매치 찾으러 가기' })).toHaveAttribute('href', '/matches/search');
});

test('진행 중인 경기는 종료 전까지 다가오는 매치에 남긴다', async () => {
  api.get.mockResolvedValue({ data: [{ ...match, status: 'IN_PROGRESS', startAt: '2020-01-01T10:00:00', endAt: '2099-01-01T12:00:00' }] });
  showList();
  expect(await screen.findByRole('link', { name: '주말 풋살' })).toBeInTheDocument();
  expect(screen.queryByText(/지난 매치/)).not.toBeInTheDocument();
});

test('조회 실패 후 재시도하며 빈 목록을 안내한다', async () => {
  api.get.mockRejectedValueOnce(new Error('server')).mockResolvedValueOnce({ data: [] });
  showList();
  expect(await screen.findByRole('alert')).toHaveTextContent('불러오지 못했어요');
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('다가오는 매치가 없어요.')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(2);
});

test('401 응답은 부모의 로그인 이동 처리를 호출한다', async () => {
  api.get.mockRejectedValue({ response: { status: 401 } });
  const onUnauthorized = jest.fn();
  showList(onUnauthorized);
  await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
});
