import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MainPage from './MainPage';

// AISearchBox는 실제 입력창과 버튼을 사용한다.
jest.mock('../components/AIConditionSummary', () => () => null);
jest.mock('../components/MatchListSection', () => () => null);

const INPUT_LABEL = '원하는 매치 조건을 자연스럽게 설명해 주세요';
const PROMPT = '내일 저녁 잠실에서 풋살 매치 만들어줘';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

function show(onGenerate) {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/" element={<MainPage onGenerate={onGenerate} />} />
      <Route path="/login" element={<h1>로그인 화면</h1>} />
    </Routes>
  </MemoryRouter>);
}

test('[AI-01] 비로그인 상태로 생성하면 AI를 호출하지 않고 문장을 저장한 뒤 로그인으로 이동한다', async () => {
  const onGenerate = jest.fn();
  show(onGenerate);
  fireEvent.change(screen.getByLabelText(INPUT_LABEL), { target: { value: PROMPT } });
  fireEvent.click(screen.getByRole('button', { name: 'AI 매치 생성' }));

  expect(await screen.findByRole('heading', { name: '로그인 화면' })).toBeInTheDocument();
  expect(onGenerate).not.toHaveBeenCalled();
  expect(window.alert).toHaveBeenCalledWith('AI 매치 생성은 로그인 후 이용할 수 있습니다. 로그인 화면으로 이동합니다.');
  expect(sessionStorage.getItem('aiDraftPrompt')).toBe(PROMPT);
});

test('[AI-01] 로그인 후 메인에 돌아오면 저장한 문장을 입력창에 채우고 저장값은 지운다', () => {
  localStorage.setItem('at', 'test-token');
  sessionStorage.setItem('aiDraftPrompt', PROMPT);
  show(jest.fn());

  expect(screen.getByLabelText(INPUT_LABEL)).toHaveValue(PROMPT);
  expect(sessionStorage.getItem('aiDraftPrompt')).toBeNull();
});
