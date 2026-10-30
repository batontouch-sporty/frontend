import Footer from '../../../components/layout/Footer';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Header from '../../../components/layout/Header';
import ReservationDateStrip from '../components/ReservationDateStrip';
import { buildReservationDates, facilityRequestError, fetchFacility } from '../api/facilityApi';
import '../css/facilityList.css';
import '../css/facilityDetail.css';

export default function FacilityDetailPage() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const [facility, setFacility] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedKey, setSelectedKey] = useState('');
  const numericId = Number(serviceId);

  useEffect(() => {
    if (!Number.isSafeInteger(numericId) || numericId < 1) {
      setFacility(null);
      setStatus('error');
      setError('잘못된 서비스 ID입니다.');
      return undefined;
    }

    const controller = new AbortController();
    setStatus('loading');
    setError('');
    fetchFacility(numericId, controller.signal)
      .then((detail) => {
        setFacility(detail);
        setSelectedKey(buildReservationDates(detail)[0]?.key || '');
        setStatus('success');
      })
      .catch((requestError) => {
        if (requestError.code === 'ERR_CANCELED') return;
        setFacility(null);
        setError(facilityRequestError(requestError, 'detail'));
        setStatus('error');
      });
    return () => controller.abort();
  }, [numericId, reloadKey]);

  const days = useMemo(() => (facility ? buildReservationDates(facility) : []), [facility]);
  const selected = days.find((day) => day.key === selectedKey) || days[0];
  const hours = facility?.startTime && facility?.endTime
    ? `${facility.startTime} ~ ${facility.endTime}`
    : '정보없음';

  const createMatch = () => {
    navigate('/matches/new', {
      state: {
        facility: {
          serviceId: facility.id,
          name: facility.serviceName,
          region: facility.region,
          locationName: facility.locationName,
        },
      },
    });
  };

  return (
    <div className="fl-page">
      <Header />
      <main className="fl-shell fd-shell">
        <div className="fd-toolbar">
          <Link className="fd-back" to="/facilities">← 체육시설 목록으로 돌아가기</Link>
          <Link className="fd-home" to="/">← 홈으로 가기</Link>
        </div>
        {status === 'loading' && <p className="fl-empty" role="status">체육시설 상세 정보를 불러오고 있습니다.</p>}
        {status === 'error' && (
          <div className="fl-empty" role="alert">
            {error}
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>다시 시도</button>
          </div>
        )}
        {status === 'success' && facility && selected && (
          <>
            <article className="fd-hero">
              <div className="fl-card-tags">
                <span className="fl-tag">{facility.serviceType}</span>
                <span className="fl-tag is-soft">공공체육시설</span>
                <span className={`fl-status${facility.closed ? ' is-closed' : ''}`}>{facility.status}</span>
                <span className="fl-fee">{facility.paymentMethod}</span>
              </div>
              <h1>{facility.serviceName}</h1>
              <ul className="fd-meta">
                <li>장소 {[facility.region, facility.locationName].filter(Boolean).join(' ')}</li>
                <li>운영시간 {hours}</li>
                <li>연락처 {facility.contact}</li>
              </ul>
            </article>

            <section className="fd-panel" aria-labelledby="fd-date-title">
              <div className="fd-panel-heading">
                <h2 id="fd-date-title"><span>1</span> 날짜 선택</h2>
                <p>접수 마감일 기준으로 앞으로 7일의 예약 가능 여부를 보여줍니다.</p>
              </div>
              <ReservationDateStrip
                facility={facility}
                selectedKey={selected.key}
                onSelect={(day) => setSelectedKey(day.key)}
              />
            </section>

            <section className="fd-panel" aria-labelledby="fd-slot-title">
              <div className="fd-panel-heading">
                <h2 id="fd-slot-title"><span>2</span> 선택한 날짜의 예약 정보 <em>{selected.displayDate} ({selected.weekday})</em></h2>
                <p>코트별 실시간 대관 현황은 서울시 예약 페이지에서 확인할 수 있습니다.</p>
              </div>
              <div className="fd-slot">
                <div>
                  <p className="fd-slot-name">
                    {facility.serviceName}
                    <span className={`fl-status${selected.closed ? ' is-closed' : ''}`}>{selected.state}</span>
                  </p>
                  <p>운영 시간: {hours}</p>
                  <p>접수 마감: {facility.reservationDeadlineAt || '정보없음'}</p>
                </div>
                <div className="fd-actions">
                  {facility.url && (
                    <a className="fl-create" href={facility.url} target="_blank" rel="noreferrer">예약 신청</a>
                  )}
                  {facility.closed ? (
                    <span className="fl-closed">대관 마감</span>
                  ) : (
                    <button type="button" className="fl-detail" onClick={createMatch}>매치 생성</button>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
