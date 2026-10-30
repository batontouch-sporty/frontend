import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import MyMatches from './MyMatches';
import { loadMyMatches } from '../api/myPageApi';
import api from '../../../api/axios';

jest.mock('../../../api/axios', () => ({ get: jest.fn() }));
afterEach(() => jest.resetAllMocks());

const match = { matchId: 7, title: '주말 풋살', role: 'OWNER', startAt: '2026-10-03T18:00:00',
  region: '성동구', facilityName: '풋살장', sportType: 'FUTSAL', numCurrentParticipant: 7,
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

test('실제 응답 필드를 표시하고 생성·참여 카드에서 각각 상세로 이동할 수 있다', async () => {
  api.get.mockResolvedValue({ data: [match, { ...match, matchId: 9, title: '저녁 풋살', role: 'PARTICIPANT', isFree: true }] });
  showList();
  expect(await screen.findByText('내가 만든 매치')).toBeInTheDocument();
  expect(screen.getByText('참여한 매치')).toBeInTheDocument();
  expect(screen.getAllByText('10월 03일 토요일 · 18:00')).toHaveLength(2);
  expect(screen.getAllByText('성동구 풋살장')).toHaveLength(2);
  expect(screen.getByText('풋살 · 참여 인원 7/12명 · 유료')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '주말 풋살 상세 보기' })).toHaveAttribute('href', '/matches/7');
  fireEvent.click(screen.getByRole('link', { name: '저녁 풋살 상세 보기' }));
  expect(screen.getByText('매치 상세 9')).toBeInTheDocument();
});

test('조회 실패 후 재시도하며 빈 목록을 안내한다', async () => {
  api.get.mockRejectedValueOnce(new Error('server')).mockResolvedValueOnce({ data: [] });
  showList();
  expect(await screen.findByRole('alert')).toHaveTextContent('불러오지 못했습니다');
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('아직 만들거나 참여한 매치가 없습니다.')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(2);
});

test('401 응답은 부모의 로그인 이동 처리를 호출한다', async () => {
  api.get.mockRejectedValue({ response: { status: 401 } });
  const onUnauthorized = jest.fn();
  showList(onUnauthorized);
  await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
});
