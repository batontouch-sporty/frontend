import { finiteSample } from './MonitoringVisualizations';

const clients = ['MemberClient', 'FacilityClient'];
const breakers = ['MemberClientgetLong', 'MemberClientprofilesList', 'FacilityClientgetLong'];
const clientName = name => `com.example.sporty.match.integration.${name}`;
const number = item => {
  const value = finiteSample(item.value?.[1]);
  return value !== null && value >= 0 ? value : null;
};
const status = request => request?.kind === 'error' ? '조회 실패' : request?.kind === 'success' ? null : '조회 중';
const amount = value => `${value.toFixed(1)}건`;

export function buildFeignRows(request) {
  if (request?.kind !== 'success') return [];
  return clients.map(client => {
    const counts = request.counts.filter(item => item.metric?.clientName === clientName(client));
    if (!counts.length) return { client, calls: '미수집', failures: '미수집', rate: '미수집', mean: '미수집' };
    if (counts.some(item => !item.metric?.http_status_code || number(item) === null)
      || new Set(counts.map(item => item.metric.http_status_code)).size !== counts.length) {
      return { client, calls: '미수집', failures: '미수집', rate: '미수집', mean: '미수집' };
    }
    const total = counts.reduce((sum, item) => sum + number(item), 0);
    const failed = counts.filter(item => /^5\d\d$/.test(item.metric.http_status_code))
      .reduce((sum, item) => sum + number(item), 0);
    const sums = request.sums.filter(item => item.metric?.clientName === clientName(client));
    const mean = !total ? '요청 없음' : sums.length !== 1 || number(sums[0]) === null
      ? '미수집' : `${(number(sums[0]) / total * 1000).toFixed(0)} ms`;
    return { client, calls: amount(total), failures: amount(failed),
      rate: total ? `${(failed / total * 100).toFixed(1)}%` : '요청 없음', mean };
  });
}

export function buildBreakerRows(stateRequest, rateRequest) {
  return breakers.flatMap(name => {
    const states = stateRequest?.kind === 'success' ? stateRequest.data.filter(item => item.metric?.name === name) : [];
    const rates = rateRequest?.kind === 'success' ? rateRequest.data.filter(item => item.metric?.name === name) : [];
    const instances = [...new Set([...states, ...rates].map(item => item.metric?.instance).filter(Boolean))];
    return (instances.length ? instances : [null]).map(instance => {
      const active = states.filter(item => item.metric?.instance === instance && finiteSample(item.value?.[1]) === 1)
        .map(item => ({ closed: 'CLOSED', open: 'OPEN', half_open: 'HALF_OPEN' })[item.metric?.state])
        .filter(Boolean);
      const state = status(stateRequest) || (active.length ? [...new Set(active)].join(' / ') : '미수집');
      const values = rates.filter(item => item.metric?.instance === instance);
      const raw = values.length === 1 ? finiteSample(values[0].value?.[1]) : null;
      const failureRate = status(rateRequest) || (raw === -1 ? '미계산' : raw !== null && raw >= 0 && raw <= 100
        ? `${raw.toFixed(1)}%` : '미수집');
      return { name, instance, state, failureRate };
    });
  });
}

export default function FeignMetrics({ data, rangeLabel }) {
  const { calls, state, failureRate } = data;
  const rows = buildFeignRows(calls);
  const breakerRows = buildBreakerRows(state, failureRate);
  return <div className="content-grid equal">
    <article className="panel"><div className="panel-head"><div><h3 className="panel-title">OpenFeign HTTP</h3><p className="panel-sub">{rangeLabel} · Match Service · 선택 기간 증가량</p></div><span className="tiny-tag">A30</span></div>
      {status(calls) ? <p role={calls?.kind === 'error' ? 'alert' : 'status'}>{status(calls)}</p> : <div className="scroll-table"><table className="detail-table"><thead><tr><th scope="col">Client</th><th scope="col">호출량</th><th scope="col">HTTP 5xx</th><th scope="col">5xx율</th><th scope="col">평균 지연</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.client}><td>{row.client}</td><td>{row.calls}</td><td>{row.failures}</td><td>{row.rate}</td><td>{row.mean}</td></tr>)}
      </tbody></table></div>}
      <p className="panel-sub">HTTP 404는 5xx에 포함하지 않습니다. 평균은 Timer sum/count를 ms로 환산합니다.</p></article>
    <article className="panel"><div className="panel-head"><div><h3 className="panel-title">Circuit Breaker</h3><p className="panel-sub">Match Service · 현재 상태와 실패율</p></div><span className="tiny-tag">A30</span></div>
      <div className="scroll-table"><table className="detail-table"><thead><tr><th scope="col">회로</th><th scope="col">인스턴스</th><th scope="col">상태</th><th scope="col">실패율</th></tr></thead><tbody>
        {breakerRows.map(row => <tr key={`${row.name}-${row.instance}`}><td>{row.name}</td><td>{row.instance || '—'}</td><td><strong>{row.state}</strong></td><td>{row.failureRate}</td></tr>)}
      </tbody></table></div><p className="panel-sub">실패율 -1은 최소 호출 수 미충족으로 미계산입니다. Feign HTTP와 CB 보호 호출은 별도 계측입니다.</p></article>
  </div>;
}
