import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
import SignUpPage from './SignUpPage';

jest.mock('../../../api/axios', () => ({ post: jest.fn(), get: jest.fn() }));
// 두 파일 모두 이름이 visibility.svg라 기본 변환으로는 구분되지 않는다.
jest.mock('../assets/visibility.svg', () => ({ __esModule: true, default: 'eye-slashed.svg' }));
jest.mock('../assets/login/visibility.svg', () => ({ __esModule: true, default: 'eye-open.svg' }));

test.each([['로그인', LoginPage], ['회원가입', SignUpPage]])('%s: 숨김은 빗금 눈, 보임은 뜬 눈을 보여 준다', (_, Page) => {
  render(<MemoryRouter><Page /></MemoryRouter>);
  const icon = () => within(screen.getByRole('button', { name: /비밀번호 (보기|숨기기)/ })).getByRole('presentation');

  expect(icon()).toHaveAttribute('src', 'eye-slashed.svg');
  expect(screen.getByRole('button', { name: '비밀번호 보기' })).not.toHaveAttribute('aria-pressed');

  fireEvent.click(screen.getByRole('button', { name: '비밀번호 보기' }));

  expect(icon()).toHaveAttribute('src', 'eye-open.svg');
  expect(screen.getByRole('button', { name: '비밀번호 숨기기' })).not.toHaveAttribute('aria-pressed');
});
