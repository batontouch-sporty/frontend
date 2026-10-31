import { Link, useNavigate } from 'react-router-dom';

// 행 전체가 상세로 가고, 상세보기·매치 생성은 그 위에서 따로 누른다.
export default function FacilityRow({ facility }) {
  const navigate = useNavigate();
  const feeLabel = facility.isFree === true ? '무료' : facility.isFree === false ? '유료' : '요금 정보없음';
  const hours = facility.startTime && facility.endTime
    ? `${facility.startTime} ~ ${facility.endTime}`
    : '운영시간 정보없음';
  const detailPath = `/facilities/${facility.serviceId}`;

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
    <article className={`fl-row${facility.closed ? ' is-closed' : ''}`}>
      <p className="fl-row-type">{facility.serviceType}</p>
      <div className="fl-row-main">
        <h3><Link to={detailPath}>{facility.serviceName}</Link></h3>
        <p>{facility.locationName || '장소 정보없음'} · {feeLabel}</p>
        <p>연락처 {facility.contact || '정보없음'}</p>
      </div>
      <p className="fl-row-hours">{hours}</p>
      <p className={`fl-status${facility.closed ? ' is-closed' : ''}`}>{facility.status}</p>
      <div className="fl-row-actions">
        <Link className="fl-detail" to={detailPath}>상세보기</Link>
        {facility.closed ? (
          <span className="fl-closed">마감</span>
        ) : (
          <button type="button" className="fl-create" onClick={createMatch}>매치 생성</button>
        )}
      </div>
    </article>
  );
}
