import { Link, useNavigate } from 'react-router-dom';

export default function FacilityCard({ facility }) {
  const navigate = useNavigate();
  const feeLabel = facility.isFree === true ? '무료' : facility.isFree === false ? '유료' : '요금 정보없음';
  const hours = facility.startTime && facility.endTime
    ? `${facility.startTime} ~ ${facility.endTime}`
    : '운영시간 정보없음';

  const createMatch = () => {
    navigate('/matches/new', {
      state: {
        facility: {
          serviceId: facility.serviceId,
          name: facility.serviceName,
          region: facility.region,
          locationName: facility.locationName,
        },
      },
    });
  };

  return (
    <article className="fl-card">
      <div className="fl-card-main">
        <div className="fl-card-tags">
          <span className="fl-tag">{facility.serviceType}</span>
          <span className={`fl-status${facility.closed ? ' is-closed' : ''}`}>{facility.status}</span>
          <span className="fl-fee">{feeLabel}</span>
        </div>
        <h2>{facility.serviceName}</h2>
      </div>
      <dl className="fl-card-meta">
        <div>
          <dt>장소</dt>
          <dd>{[facility.region, facility.locationName].filter(Boolean).join(' ') || '장소 정보없음'}</dd>
        </div>
        <div>
          <dt>운영시간</dt>
          <dd>{hours}</dd>
        </div>
        <div>
          <dt>연락처</dt>
          <dd>{facility.contact || '정보없음'}</dd>
        </div>
      </dl>
      <div className="fl-card-actions">
        <Link className="fl-detail" to={`/facilities/${facility.serviceId}`}>상세보기</Link>
        {facility.closed ? (
          <span className="fl-closed">마감</span>
        ) : (
          <button type="button" className="fl-create" onClick={createMatch}>매치 생성</button>
        )}
      </div>
    </article>
  );
}
