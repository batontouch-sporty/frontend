import { render, screen } from '@testing-library/react';
import AISearchBox from './AISearchBox';

test('추천 키워드 그룹 없이 입력 예시만 보여 준다', () => {
  render(<AISearchBox />);

  expect(screen.queryByRole('group', { name: '추천 키워드' })).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText('예: 토요일 저녁 마포구 풋살 초보')).toBeInTheDocument();
});
