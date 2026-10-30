import { fireEvent, render, screen } from '@testing-library/react';
import DistrictSelect from './DistrictSelect';

test.each([
  ['code', 'GANGNAM'],
  ['name', '강남구'],
])('자치구는 같은 25개 목록을 표시하며 %s 계약의 값을 전달한다', (valueType, selectedValue) => {
  const onChange = jest.fn();
  render(<DistrictSelect aria-label="자치구" name="district" valueType={valueType} value="" onChange={event => onChange(event.target.name, event.target.value)} />);
  expect(screen.getAllByRole('option')).toHaveLength(26);
  const option = screen.getByRole('option', { name: '강남구' });
  expect(option).toHaveValue(selectedValue);
  fireEvent.change(screen.getByRole('combobox', { name: '자치구' }), { target: { value: selectedValue } });
  expect(onChange).toHaveBeenCalledWith('district', selectedValue);
});

test('기존 선택값과 필수 입력·비활성화·접근성 속성을 유지한다', () => {
  render(<DistrictSelect aria-label="활동 자치구" value="SEONGDONG" required disabled aria-invalid="true" />);
  const select = screen.getByRole('combobox', { name: '활동 자치구' });
  expect(select).toHaveDisplayValue('성동구');
  expect(select).toBeRequired();
  expect(select).toBeDisabled();
  expect(select).toHaveAttribute('aria-invalid', 'true');
});
