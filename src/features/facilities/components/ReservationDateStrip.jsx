import { buildReservationDates } from '../api/facilityApi';

export default function ReservationDateStrip({ facility, selectedKey, onSelect }) {
  const days = buildReservationDates(facility);

  return (
    <div className="fd-days" role="listbox" aria-label="예약 가능 날짜">
      {days.map((day) => {
        const selected = day.key === selectedKey;
        return (
          <button
            key={day.key}
            type="button"
            role="option"
            aria-selected={selected}
            className={`fd-day${selected ? ' is-selected' : ''}${day.closed ? ' is-closed' : ''}`}
            onClick={() => onSelect(day)}
          >
            <span className="fd-day-label">{day.label}</span>
            <strong>{day.day}<small>({day.weekday})</small></strong>
            <span className="fd-day-state">{day.state}</span>
          </button>
        );
      })}
    </div>
  );
}
