import { useState } from 'react';
import DistrictSelect from '../../../components/common/DistrictSelect';
import { SPORTS } from '../data/sports';
import { DATE_TABS } from '../utils/matchDates';

const Choices = ({ label, options, value, onSelect, className = 'ml-choices' }) => <div className={className} role="group" aria-label={label}>
  {options.map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} disabled={!onSelect} onClick={() => onSelect(key)}>{text}</button>)}
</div>;

// 상태 관리/검색은 부모가 담당. 종목과 날짜는 바로, 지역·요금·상태·선호 종목은 조건 적용을 눌러 반영한다.
export default function MatchListFilters({ profile, filters = {}, dateTab = '', onSportChange, onDateTab, onFilterChange, onApply, onReset }) {
  const pick = name => onFilterChange && (value => onFilterChange(name, value));
  const [open, setOpen] = useState(false);
  const active = [filters.region, filters.isFree, filters.status, filters.preferredOnly].filter(Boolean).length;
  return <section className="ml-filters" aria-label="매치 필터">
    <nav className="ml-sports" aria-label="운동 종목">
      <button type="button" aria-pressed={!filters.sportType} disabled={!onSportChange} onClick={() => onSportChange('')}>전체 매치</button>
      {SPORTS.map(([value, label, icon]) => <button key={value} type="button" aria-pressed={filters.sportType === value} disabled={!onSportChange} onClick={() => onSportChange(value)}><img src={icon} width="18" height="18" alt="" />{label}</button>)}
    </nav>
    <Choices className="ml-date-tabs" label="날짜" options={DATE_TABS} value={dateTab} onSelect={onDateTab} />
    <button className="ml-filter-toggle" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? '조건 접기' : `조건 더 보기${active ? ` (${active})` : ''}`}</button>
    <div className={`ml-filter-row${open ? ' is-open' : ''}`}>
      <div className="ml-region"><DistrictSelect aria-label="자치구" valueType="name" placeholder="전체 지역" value={filters.region || ''} disabled={!onFilterChange} onChange={event => onFilterChange?.('region', event.target.value)} /></div>
      <div className="ml-choice"><span>요금</span><Choices label="요금" options={[['', '전체'], ['Y', '무료'], ['N', '유료 대관']]} value={filters.isFree || ''} onSelect={pick('isFree')} /></div>
      <div className="ml-choice"><span>상태</span><Choices label="매치 상태" options={[['', '전체'], ['RECRUITING', '모집중'], ['CLOSED', '마감']]} value={filters.status || ''} onSelect={pick('status')} /></div>
      <label className="ml-preference" title={profile ? undefined : '로그인하면 쓸 수 있어요'}><input type="checkbox" role="switch" checked={!!filters.preferredOnly} disabled={!profile || !onFilterChange} onChange={event => onFilterChange?.('preferredOnly', event.target.checked)} />내 선호 종목만</label>
      <div className="ml-filter-actions">
        <button className="ml-reset" type="button" disabled={!onReset} onClick={onReset}>전체 초기화</button>
        <button className="ml-apply" type="button" disabled={!onApply} onClick={onApply}>조건 적용</button>
      </div>
    </div>
  </section>;
}
