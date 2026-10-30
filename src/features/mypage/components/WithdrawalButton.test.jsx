import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import WithdrawalButton from './WithdrawalButton';
import { withdrawUser } from '../api/myPageApi';
jest.mock('../api/myPageApi', () => ({ withdrawUser: jest.fn() }));
function Location() { return <p data-testid="path">{useLocation().pathname}</p>; }
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => { localStorage.setItem('at', 'test'); localStorage.setItem('rt', 'test'); localStorage.setItem('userId', '7'); });
afterEach(() => { localStorage.clear(); jest.clearAllMocks(); });
const show = () => render(<MemoryRouter initialEntries={['/mypage']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><WithdrawalButton /><Location /></MemoryRouter>);
test('버튼 클릭만으로 탈퇴하지 않으며 성공 204 후 세션을 지우고 로그인으로 이동한다', async () => {
  withdrawUser.mockResolvedValue({ status: 204 }); show();
  fireEvent.click(screen.getByRole('button', { name: '회원탈퇴', exact: true }));
  expect(withdrawUser).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'password' } });
  fireEvent.click(screen.getByRole('button', { name: '회원탈퇴 확인' }));
  await screen.findByText('/login');
  expect(localStorage.getItem('at')).toBeNull();
  expect(localStorage.getItem('rt')).toBeNull();
  expect(localStorage.getItem('userId')).toBeNull();
});
test('비밀번호 오류 시 세션은 유지하고 닫았다 열면 입력은 비운다', async () => {
  withdrawUser.mockRejectedValue({ response: { status: 400 } }); show();
  fireEvent.click(screen.getByRole('button', { name: '회원탈퇴', exact: true }));
  fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: '회원탈퇴 확인' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('비밀번호를 확인');
  expect(localStorage.getItem('at')).toBe('test');
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  fireEvent.click(screen.getByRole('button', { name: '회원탈퇴', exact: true }));
  expect(screen.getByLabelText('현재 비밀번호')).toHaveValue('');
});
