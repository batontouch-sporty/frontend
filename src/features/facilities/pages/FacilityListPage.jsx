import Footer from '../../../components/layout/Footer';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../../../components/layout/Header';
import { facilityRequestError, fetchFacilities } from '../api/facilityApi';
import FacilityRow from '../components/FacilityRow';
import FacilityFilters from '../components/FacilityFilters';
import '../css/facilityList.css';

const PAGE_SIZE = 6;

// 현재 페이지의 시설만 자치구별로 묶는다. 같은 구가 다음 페이지로 이어지면 거기서 제목이 다시 나온다.
function groupByRegion(items) {
  const groups = new Map();
  items.forEach((facility) => {
    const region = facility.region || '지역 정보없음';
    groups.set(region, [...(groups.get(region) || []), facility]);
  });
  return [...groups];
}

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

  return (
    <div className="fl-page">
      <Header />
      <main>
        <section className="fl-hero">
          <div className="fl-container">
            <h1>체육시설 찾기</h1>
            <p className="fl-lead">시설 위치와 대관 정보를 확인하고 매치를 준비해요.</p>
            <FacilityFilters
              region={draft.region}
              serviceName={draft.serviceName}
              serviceType={draft.serviceType}
              onRegionChange={(value) => setDraft((current) => ({ ...current, region: value }))}
              onServiceNameChange={(value) => setDraft((current) => ({ ...current, serviceName: value }))}
              onServiceTypeChange={(value) => replaceParams({ ...draft, serviceType: value })}
              onSearch={() => replaceParams(draft)}
            />
          </div>
        </section>
        <div className="fl-container fl-body">
          {status === 'loading' && <p className="fl-empty" role="status">체육시설 목록을 불러오고 있어요.</p>}
          {status === 'error' && (
            <div className="fl-empty" role="alert">
              {error}
              <button type="button" onClick={() => setReloadKey((value) => value + 1)}>다시 시도</button>
            </div>
          )}
          {status === 'success' && visible.length === 0 && (
            <p className="fl-empty">조건에 맞는 체육시설이 없어요. 검색 조건을 바꿔 보세요.</p>
          )}
          {status === 'success' && facilities.length > 0 && (
            <p className="fl-summary">총 <strong>{facilities.length}</strong>개의 체육시설</p>
          )}
          {status === 'success' && groupByRegion(visible).map(([groupName, items]) => (
            <section className="fl-group" key={groupName}>
              <h2>{groupName}</h2>
              <div className="fl-list">
                {items.map((facility) => <FacilityRow key={facility.serviceId} facility={facility} />)}
              </div>
            </section>
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
        </div>
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
