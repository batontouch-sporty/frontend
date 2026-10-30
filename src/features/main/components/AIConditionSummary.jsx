import check from '../assets/check.svg';
import { toConditionSummary } from '../api/aiMatchApi';
import '../css/main.css';

// [AI-02] AI 매치 검색 — 분석된 맞춤 조건 표시
// 표시 전용: conditions는 [{ label, value }]이다. 예시/외부 props도 동일한 5개 항목 순서로 제한한다.
// onEdit는 편집 화면을 여는 연결점일 뿐 조건 저장/재검색을 수행하지 않는다. 콜백 미연결 시 버튼은 비활성화된다.
const AIConditionSummary = ({
  conditions,
  onEdit
}) => {
  const summaryConditions = toConditionSummary(conditions);
  return (
    <section className="ms-summary ms-panel" aria-label="AI가 분석한 나의 맞춤 조건">
        <div className="ms-summary-heading">
            <div className="ms-summary-title">
                <img src={check} width="20" height="20" alt="" />
                <div>
                    <h2>AI가 분석한 나의 맞춤 조건</h2>
                    <p>입력한 문장을 바탕으로 최적의 탐색 조건을 완성했어요</p>
                </div>
            </div>
            <button type="button" className="ms-edit" onClick={onEdit} disabled={!onEdit}><span aria-hidden="true">⚙</span> 조건 직접 수정</button>
        </div>
        <dl className="ms-conditions">{summaryConditions.map(condition => <div key={condition.label} className="ms-condition">
                <dt>{condition.label}</dt>
                <dd>
                    {condition.value}
                </dd>
            </div>)}</dl>
    </section>
  );
};
export default AIConditionSummary;
