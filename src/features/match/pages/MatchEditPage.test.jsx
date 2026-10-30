import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import MatchEditPage from './MatchEditPage';
import { RequireMatchAuth } from './MatchCreatePage';
import { getMatchDetail, modifyMatch } from '../api/matchApi';

jest.mock('../api/matchApi', () => ({ getMatchDetail: jest.fn(), modifyMatch: jest.fn() }));

const match = { matchId: 42, isOwner: true, serviceId: 7, serviceName: null, sportType: 'TENNIS', title: '야간 테니스', description: null, startAt: '2026-10-01T23:00:00', endAt: '2026-10-02T01:00:00', maxParticipant: 4, skillLevel: 'INTERMEDIATE', genderGroup: 'FEMALE' };
function Destination() { const location = useLocation(); return <p data-testid="destination">{location.pathname + location.search}</p>; }
function showPage(path = '/matches/42/edit') {
  return render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Link to="/matches/43/edit">다른 매치</Link>
    <Routes><Route path="/matches/:matchId/edit" element={<RequireMatchAuth><MatchEditPage /></RequireMatchAuth>} /><Route path="*" element={<Destination />} /></Routes>
  </MemoryRouter>);
}
beforeEach(() => { localStorage.setItem('at', 'token'); getMatchDetail.mockResolvedValue(match); modifyMatch.mockResolvedValue(match); });
afterEach(() => { localStorage.clear(); jest.resetAllMocks(); });

test('loads existing fields and saves once before navigating to detail', async () => {
  let finish;
  modifyMatch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  showPage();
  expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');
  expect(await screen.findByLabelText('매치 제목')).toHaveValue(match.title);
  expect(screen.getByLabelText('경기 날짜')).toHaveValue('2026-10-01');
  expect(screen.getByLabelText('종료 날짜 (미선택 시 경기 당일)')).toHaveValue('2026-10-02');
  expect(screen.getByLabelText('성별 구성')).toHaveValue('FEMALE');
  expect(screen.getByRole('button', { name: /테니스/ })).toBeDisabled();
  expect(screen.queryByRole('button', { name: '시설 검색' })).not.toBeInTheDocument();
  expect(screen.getByText('시설명 정보 없음')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('매치 제목'), { target: { value: '수정한 제목' } });
  fireEvent.click(screen.getByRole('button', { name: '매치 수정 완료하기' }));
  fireEvent.click(screen.getByRole('button', { name: '매치 저장 중…' }));
  expect(modifyMatch).toHaveBeenCalledTimes(1);
  expect(modifyMatch).toHaveBeenCalledWith('42', expect.objectContaining({ title: '수정한 제목', description: '', startAt: '2026-10-01T23:00', endAt: '2026-10-02T01:00' }));
  await act(async () => finish(match));
  expect(await screen.findByTestId('destination')).toHaveTextContent('/matches/42');
});

test('redirects anonymous users before fetching', async () => {
  localStorage.clear(); showPage();
  expect(await screen.findByTestId('destination')).toHaveTextContent('/login?redirect=%2Fmatches%2F42%2Fedit');
  expect(getMatchDetail).not.toHaveBeenCalled();
});

test.each([false, null])('blocks editing when isOwner is %s', async isOwner => {
  getMatchDetail.mockResolvedValue({ ...match, isOwner }); showPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다');
  expect(screen.queryByLabelText('매치 제목')).not.toBeInTheDocument();
});

test.each([403, 404])('displays lookup error %s without a form', async status => {
  getMatchDetail.mockRejectedValue({ response: { status } }); showPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(status === 403 ? '권한이 없습니다' : '찾을 수 없습니다');
  expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
});

test('retries failed lookup', async () => {
  getMatchDetail.mockRejectedValueOnce(new Error('network')); showPage();
  fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
  expect(await screen.findByLabelText('매치 제목')).toHaveValue(match.title);
});

test.each(['load', 'save'])('redirects expired authentication on %s', async stage => {
  (stage === 'load' ? getMatchDetail : modifyMatch).mockRejectedValue({ response: { status: 401 } });
  showPage();
  if (stage === 'save') fireEvent.click(await screen.findByRole('button', { name: '매치 수정 완료하기' }));
  expect(await screen.findByTestId('destination')).toHaveTextContent('/login?redirect=%2Fmatches%2F42%2Fedit');
  expect(localStorage.getItem('at')).toBeNull();
});

test.each([400, 403, 404, 500])('preserves edits after save error %s', async status => {
  modifyMatch.mockRejectedValue({ response: { status } }); showPage();
  fireEvent.change(await screen.findByLabelText('매치 제목'), { target: { value: '유지할 제목' } });
  fireEvent.click(screen.getByRole('button', { name: '매치 수정 완료하기' }));
  await waitFor(() => expect(screen.getByRole('alert')).not.toBeEmptyDOMElement());
  expect(screen.getByLabelText('매치 제목')).toHaveValue('유지할 제목');
  expect(screen.getByRole('button', { name: '매치 수정 완료하기' })).toBeEnabled();
});

test('rejects invalid dates before saving', async () => {
  showPage();
  fireEvent.change(await screen.findByLabelText('종료 날짜 (미선택 시 경기 당일)'), { target: { value: '2026-09-30' } });
  fireEvent.click(screen.getByRole('button', { name: '매치 수정 완료하기' }));
  expect(screen.getByText('종료 일시는 시작 일시보다 늦어야 합니다.')).toBeInTheDocument();
  expect(modifyMatch).not.toHaveBeenCalled();
});

test('ignores old lookup after route change', async () => {
  let finish;
  getMatchDetail.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ ...match, matchId: 43, title: '다음 매치' });
  showPage(); fireEvent.click(screen.getByRole('link', { name: '다른 매치' }));
  expect(await screen.findByLabelText('매치 제목')).toHaveValue('다음 매치');
  await act(async () => finish(match));
  expect(screen.getByLabelText('매치 제목')).toHaveValue('다음 매치');
  expect(getMatchDetail.mock.calls[0][1].aborted).toBe(true);
});
