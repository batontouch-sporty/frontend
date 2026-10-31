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
      setError('시설 주소가 올바르지 않아요.');
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
      <main className="fl-container fd-main">
        <Link className="fd-back" to="/facilities">체육시설 목록으로 돌아가기</Link>
        {status === 'loading' && <p className="fl-empty" role="status">체육시설 상세 정보를 불러오고 있어요.</p>}
        {status === 'error' && (
          <div className="fl-empty" role="alert">
            {error}
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>다시 시도</button>
          </div>
        )}
        {status === 'success' && facility && selected && (
          <article className="fd-sheet">
            <header className="fd-top">
              <div className="fd-tags">
                <span className={`fl-status${facility.closed ? ' is-closed' : ''}`}>{facility.status}</span>
                <span className="fd-tag">공공체육시설</span>
                <span className="fd-tag">{facility.serviceType}</span>
                <span className="fd-tag">{facility.paymentMethod}</span>
              </div>
              <h1>{facility.serviceName}</h1>
              <dl className="fd-facts">
                <div><dt>장소</dt><dd>{[facility.region, facility.locationName].filter(Boolean).join(' ')}</dd></div>
                <div><dt>운영시간</dt><dd>{hours}</dd></div>
                <div><dt>연락처</dt><dd>{facility.contact}</dd></div>
              </dl>
            </header>

            <section className="fd-booking" aria-labelledby="fd-date-title">
              <h2 id="fd-date-title">날짜 선택</h2>
              <ReservationDateStrip
                facility={facility}
                selectedKey={selected.key}
                onSelect={(day) => setSelectedKey(day.key)}
              />
              <div className="fd-picked">
                <p className="fd-picked-date">
                  {selected.displayDate} ({selected.weekday})
                  <span className={`fl-status${selected.closed ? ' is-closed' : ''}`}>{selected.state}</span>
                </p>
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
              <p className="fd-note">코트별 실시간 대관 현황은 서울시 예약 페이지에서 확인할 수 있어요.</p>
            </section>
          </article>
        )}
      </main>
      <Footer />
    </div>
  );
}
