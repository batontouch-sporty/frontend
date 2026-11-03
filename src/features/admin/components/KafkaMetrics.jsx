import { finiteSample } from './MonitoringVisualizations';

const kst = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const value = raw => {
  const parsed = finiteSample(raw);
  return parsed !== null && parsed >= 0 ? parsed : null;
};
const lagValue = raw => Number.isSafeInteger(value(raw)) ? value(raw) : null;
const status = request => request?.kind === 'error' ? '조회 실패' : request?.kind === 'success' ? null : '조회 중';
const labels = (metric, keys) => keys.every(key => typeof metric?.[key] === 'string' && metric[key])
  ? keys.map(key => metric[key]) : null;
const keyOf = parts => JSON.stringify(parts);

function samples(request, keys, trend = false) {
  const rows = new Map();
  if (request?.kind !== 'success') return rows;
  request.data.forEach(item => {
    const parts = labels(item.metric, keys);
    if (!parts) return;
    const key = keyOf(parts);
    if (rows.has(key)) { rows.set(key, { parts, raw: null }); return; }
    rows.set(key, { parts, raw: trend ? item.values?.at(-1)?.[1] : item.value?.[1] });
  });
  return rows;
}

export function buildCounterRows(countRequest, trendRequest, keys) {
  const counts = samples(countRequest, keys);
  const rates = samples(trendRequest, keys, true);
  return [...new Set([...counts.keys(), ...rates.keys()])].sort().map(key => {
    const count = counts.get(key);
    const rate = rates.get(key);
    return { parts: count?.parts || rate?.parts,
      count: status(countRequest) || (value(count?.raw) === null ? '미수집' : `${value(count.raw).toFixed(1)}건`),
      rate: status(trendRequest) || (value(rate?.raw) === null ? '미수집' : `${value(rate.raw).toFixed(3)}건/초`),
    };
  });
}

export function buildLagRows(lagRequest, maxRequest) {
  const totals = samples(lagRequest, ['consumergroup', 'topic']);
  const maximums = samples(maxRequest, ['consumergroup', 'topic']);
  return [...new Set([...totals.keys(), ...maximums.keys()])].sort().map(key => {
    const total = totals.get(key);
    const maximum = maximums.get(key);
    return { parts: total?.parts || maximum?.parts,
      total: status(lagRequest) || (lagValue(total?.raw) === null ? '미수집' : `${lagValue(total.raw)}건`),
      maximum: status(maxRequest) || (lagValue(maximum?.raw) === null ? '미수집' : `${lagValue(maximum.raw)}건`),
    };
  });
}

export function lagKpi(lag, exporter, brokers) {
  if (status(exporter)) return status(exporter);
  const targets = exporter.data.filter(item => item.metric?.job === 'kafka-exporter').map(item => finiteSample(item.value?.[1]));
  if (!targets.length || targets.some(item => item !== 0 && item !== 1)) return '미수집';
  if (targets.some(item => item === 0)) return 'Exporter DOWN';
  if (status(brokers)) return status(brokers);
  const connected = brokers.data.filter(item => item.metric?.job === 'kafka-exporter').map(item => value(item.value?.[1]));
  if (!connected.length || connected.some(item => item === null)) return '미수집';
  if (connected.every(item => item === 0)) return 'Broker 미연결';
  if (status(lag)) return status(lag);
  if (lag.data.some(item => item.metric?.consumergroup === 'notification-service' && !labels(item.metric, ['consumergroup', 'topic']))) return '미수집';
  const rows = samples(lag, ['consumergroup', 'topic']);
  const notification = [...rows.values()].filter(item => item?.parts[0] === 'notification-service');
  if (!notification.length || notification.some(item => lagValue(item.raw) === null)) return '미수집';
  return `${notification.reduce((sum, item) => sum + lagValue(item.raw), 0).toLocaleString('ko-KR')}건`;
}

function Trend({ request, keys }) {
  if (status(request)) return <p role={request?.kind === 'error' ? 'alert' : 'status'}>{status(request)}</p>;
  const rows = request.data.flatMap(item => {
    const parts = labels(item.metric, keys);
    return parts ? (item.values || []).slice(-5).map(([time, raw]) => ({ parts, time, rate: value(raw) })) : [];
  });
  if (!rows.length) return <p>미수집</p>;
  return <div className="scroll-table"><table className="detail-table"><thead><tr><th scope="col">시각 (KST)</th>{keys.map(key => <th scope="col" key={key}>{key === 'group' ? '그룹' : '토픽'}</th>)}<th scope="col">발생률</th></tr></thead><tbody>
    {rows.map(({ parts, time, rate }, index) => <tr key={`${keyOf(parts)}-${time}-${index}`}><td><time dateTime={new Date(time * 1000).toISOString()}>{kst.format(new Date(time * 1000))}</time></td>{parts.map((part, partIndex) => <td key={partIndex}>{part}</td>)}<td>{rate === null ? '미수집' : `${rate.toFixed(3)}건/초`}</td></tr>)}
  </tbody></table></div>;
}

function CounterTable({ count, trend, keys }) {
  const rows = buildCounterRows(count, trend, keys);
  if (!rows.length) return <p role={count?.kind === 'error' || trend?.kind === 'error' ? 'alert' : 'status'}>{status(count) || status(trend) || '미수집'}</p>;
  return <div className="scroll-table"><table className="detail-table"><thead><tr>{keys.map(key => <th scope="col" key={key}>{key === 'group' ? '그룹' : '토픽'}</th>)}<th scope="col">선택 기간</th><th scope="col">최근 처리율</th></tr></thead><tbody>
    {rows.map(row => <tr key={keyOf(row.parts)}>{row.parts.map((part, index) => <td key={index}>{part}</td>)}<td>{row.count}</td><td>{row.rate}</td></tr>)}
  </tbody></table></div>;
}

export default function KafkaMetrics({ data, lag, exporter, brokers, rangeLabel }) {
  const { processedCount, processedTrend, dltCount, dltTrend, maxLag } = data;
  const lagRows = buildLagRows(lag, maxLag);
  const brokerValues = brokers?.kind === 'success' ? brokers.data.filter(item => item.metric?.job === 'kafka-exporter').map(item => value(item.value?.[1])) : [];
  const targets = exporter?.kind === 'success' ? exporter.data.filter(item => item.metric?.job === 'kafka-exporter').map(item => finiteSample(item.value?.[1])) : [];
  const brokerStatus = status(brokers) || (!brokerValues.length || brokerValues.some(item => item === null) ? '미수집'
    : brokerValues.every(item => item === 0) ? 'Broker 미연결' : `Broker ${Math.max(...brokerValues).toFixed(0)}개`);
  return <div className="content-grid equal">
    <article className="panel"><div className="panel-head"><div><h3 className="panel-title">Consumer 처리 성공</h3><p className="panel-sub">{rangeLabel} · notification-service · DB 커밋 뒤 기록</p></div><span className="tiny-tag">A30 · A31</span></div>
      <CounterTable count={processedCount} trend={processedTrend} keys={['topic', 'group']} />
      <p className="panel-sub">선택 기간 증가량은 추정 소수일 수 있습니다. 처리율은 5분 rate의 마지막 값입니다.</p></article>
    <article className="panel"><div className="panel-head"><div><h3 className="panel-title">Consumer Group Lag</h3><p className="panel-sub">Kafka Exporter · 그룹·토픽별 파티션 합계와 최대</p></div><span className="tiny-tag">A30</span></div>
      <p className="panel-sub">Exporter: {status(exporter) || (targets.length && targets.every(item => item === 0 || item === 1) ? targets.some(item => item === 0) ? 'DOWN' : 'UP' : '미수집')} · {brokerStatus}</p>
      {lagRows.length ? <div className="scroll-table"><table className="detail-table"><thead><tr><th scope="col">그룹</th><th scope="col">토픽</th><th scope="col">Lag 합계</th><th scope="col">최대 파티션</th></tr></thead><tbody>
        {lagRows.map(row => <tr key={keyOf(row.parts)}><td>{row.parts[0]}</td><td>{row.parts[1]}</td><td>{row.total}</td><td>{row.maximum}</td></tr>)}
      </tbody></table></div> : <p role={lag?.kind === 'error' || maxLag?.kind === 'error' ? 'alert' : 'status'}>{status(lag) || status(maxLag) || '미수집'}</p>}
      <p className="panel-sub">커밋 오프셋이 없는 그룹은 0으로 채우지 않습니다.</p></article>
    <article className="panel"><div className="panel-head"><div><h3 className="panel-title">DLT 발행 성공</h3><p className="panel-sub">{rangeLabel} · 원본 토픽별 Broker ACK 성공</p></div><span className="tiny-tag">A30 · A31</span></div>
      <CounterTable count={dltCount} trend={dltTrend} keys={['topic']} />
      <h4 className="subsection-title">DLT 발행 추이 · 건/초</h4><Trend request={dltTrend} keys={['topic']} />
      <p className="panel-sub">DLT 잔량이나 고유 실패 이벤트 수가 아닙니다.</p></article>
    <article className="panel"><h3 className="panel-title">Producer 발행</h3><p className="panel-sub">성공 발행 건수 계측 미확인</p></article>
  </div>;
}
