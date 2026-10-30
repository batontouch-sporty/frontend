import DistrictSelect from '../../../components/common/DistrictSelect';

export const FACILITY_TYPES = [
  ['', '전체 종목 ALL'],
  ['풋살장', '풋살장'],
  ['축구장', '축구장'],
  ['테니스장', '테니스장'],
  ['배드민턴장', '배드민턴장'],
  ['농구장', '농구장'],
  ['다목적경기장', '수영장/다목적관'],
];

export default function FacilityFilters({
  region,
  serviceName,
  serviceType,
  onRegionChange,
  onServiceNameChange,
  onServiceTypeChange,
  onSearch,
}) {
  return (
    <form className="fl-filters" onSubmit={(event) => { event.preventDefault(); onSearch?.(); }}>
      <div className="fl-chips" role="group" aria-label="시설 종류">
        {FACILITY_TYPES.map(([value, label]) => (
          <button
            key={value || 'all'}
            type="button"
            aria-pressed={serviceType === value}
            onClick={() => onServiceTypeChange?.(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="fl-search-row">
        <label className="fl-field">
          <span>지역 선택 (region)</span>
          <DistrictSelect aria-label="지역 선택" valueType="name" placeholder="전체 지역" value={region} onChange={(event) => onRegionChange?.(event.target.value)} />
        </label>
        <label className="fl-field fl-field-grow">
          <span>통합 검색어 (name / facility_name)</span>
          <input
            type="search"
            aria-label="시설 검색어"
            placeholder="지역/종목 검색"
            value={serviceName}
            onChange={(event) => onServiceNameChange?.(event.target.value)}
          />
        </label>
        <button type="submit" className="fl-search-button">시설 검색</button>
      </div>
    </form>
  );
}
