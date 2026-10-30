import { districts } from '../../constants/districts';
import './districtSelect.css';

// valueType="name": region(강남구), 기본값 "code": district(GANGNAM).
// 각 페이지의 state·검증·검색 핸들러는 그대로 사용하고, 옵션과 모양만 공통 관리한다.
export default function DistrictSelect({ valueType = 'code', placeholder = '자치구 선택', className = '', value = '', ...props }) {
  return <select {...props} value={value} className={`sporty-district-select ${className}`.trim()}>
    <option value="">{placeholder}</option>
    {districts.map(([code, name]) => <option key={code} value={valueType === 'name' ? name : code}>{name}</option>)}
  </select>;
}
