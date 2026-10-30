import Footer from '../../../components/layout/Footer';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../../../components/layout/Header';
import { facilityRequestError, fetchFacilities } from '../api/facilityApi';
import FacilityCard from '../components/FacilityCard';
import FacilityFilters, { FACILITY_TYPES } from '../components/FacilityFilters';
import '../css/facilityList.css';

const PAGE_SIZE = 6;

export default function FacilityListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const region = searchParams.get('region') || '';
  const serviceName = searchParams.get('query') || '';
  const serviceType = searchParams.get('serviceType') || '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const [draft, setDraft] = useState({ region, serviceName, serviceType });
  const [facilities, setFacilities] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setDraft({ region, serviceName, serviceType });
  }, [region, serviceName, serviceType]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setError('');
    fetchFacilities({ region, serviceName, serviceType }, controller.signal)
      .then((items) => {
        setFacilities(items);
        setStatus('success');
      })
      .catch((requestError) => {
        if (requestError.code === 'ERR_CANCELED') return;
        setFacilities([]);
        setError(facilityRequestError(requestError));
        setStatus('error');
      });
    return () => controller.abort();
  }, [region, serviceName, serviceType, reloadKey]);

  const replaceParams = (next) => {
    const params = new URLSearchParams();
    if (next.region) params.set('region', next.region);
    if (next.serviceName) params.set('query', next.serviceName);
    if (next.serviceType) params.set('serviceType', next.serviceType);
    setSearchParams(params);
  };

  const pageCount = Math.max(1, Math.ceil(facilities.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return facilities.slice(start, start + PAGE_SIZE);
  }, [facilities, currentPage]);

  const typeLabel = FACILITY_TYPES.find(([value]) => value === serviceType)?.[1] || '전체';

  return (
    <div className="fl-page">
      <Header />
      <main className="fl-shell">
        <p className="fl-kicker">PUBLIC & PRIVATE SPORTS FACILITIES</p>
        <h1>체육시설 및 구장 대관 검색</h1>
        <p className="fl-lead">공공 체육시설 위치, 시설 현황, 대관 예약 정보를 탐색하고 매치를 준비하세요.</p>
        <FacilityFilters
          region={draft.region}
          serviceName={draft.serviceName}
          serviceType={draft.serviceType}
          onRegionChange={(value) => setDraft((current) => ({ ...current, region: value }))}
          onServiceNameChange={(value) => setDraft((current) => ({ ...current, serviceName: value }))}
          onServiceTypeChange={(value) => replaceParams({ ...draft, serviceType: value })}
          onSearch={() => replaceParams(draft)}
        />
        <div className="fl-summary">
          <p>
            총 <strong>{facilities.length}</strong>개의 체육시설
            <span> | 지역: {region || '전체'}, 종목: {typeLabel}</span>
          </p>
          <Link className="fl-home" to="/">홈으로 가기</Link>
        </div>
        {status === 'loading' && <p className="fl-empty" role="status">체육시설 목록을 불러오고 있습니다.</p>}
        {status === 'error' && (
          <div className="fl-empty" role="alert">
            {error}
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>다시 시도</button>
          </div>
        )}
        {status === 'success' && visible.length === 0 && (
          <p className="fl-empty">조건에 맞는 체육시설이 없습니다. 검색 조건을 변경해주세요.</p>
        )}
        {status === 'success' && visible.map((facility) => (
          <FacilityCard key={facility.serviceId} facility={facility} />
        ))}
        {status === 'success' && facilities.length > 0 && (
          <nav className="fl-pager" aria-label="시설 목록 페이지">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setSearchParams(withPage(searchParams, currentPage - 1))}
            >
              이전 페이지
            </button>
            <span>{currentPage} / {pageCount}</span>
            <button
              type="button"
              disabled={currentPage >= pageCount}
              onClick={() => setSearchParams(withPage(searchParams, currentPage + 1))}
            >
              다음 페이지
            </button>
          </nav>
        )}
      </main>
      <Footer />
    </div>
  );
}

function withPage(searchParams, nextPage) {
  const params = new URLSearchParams(searchParams);
  if (nextPage <= 1) params.delete('page');
  else params.set('page', String(nextPage));
  return params;
}
