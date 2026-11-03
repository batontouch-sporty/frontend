// 포인트 보증금 정책. 금액은 포인트 서비스 v4.0 기준 고정값이다.
export const DEPOSIT_POINTS = 10;

// 동기 오류 code와 상태 조회의 failureCode를 같은 문구로 안내한다.
const REASONS = {
  INSUFFICIENT_POINTS: `보증 포인트가 부족해요. ${DEPOSIT_POINTS}점 이상 있어야 신청할 수 있어요.`,
  PARTICIPATION_SUSPENDED: '노쇼로 참여가 정지된 상태예요. 정지 기간이 끝난 뒤 다시 신청해 주세요.',
  PARTICIPATION_IN_PROGRESS: '이 매치에 보낸 요청을 아직 처리하고 있어요. 잠시 후 결과를 확인해 주세요.',
  REQUEST_CANCELLED: '처리 시간이 지나 요청이 취소됐어요. 다시 신청해 주세요.',
  USER_NOT_ACTIVE: '현재 계정 상태로는 신청할 수 없어요.',
  CONFIRMATION_FAILED: '모집이 마감되었거나 정원이 차서 확정하지 못했어요.',
};
const REFUNDS = {
  PENDING: ' 차감된 보증 포인트는 반환 처리 중이에요.',
  COMPLETED: ' 차감된 보증 포인트는 반환됐어요.',
};

export const depositErrorMessage = code => REASONS[code];

// status: CONFIRMED 외 상태 조회 결과. PENDING은 대기 시간 초과, UNKNOWN은 조회 실패다.
export function requestResultMessage({ status, failureCode, refundStatus }) {
  if (status === 'PENDING') return '아직 요청을 처리하고 있어요. 잠시 후 마이페이지 내 일정에서 결과를 확인해 주세요.';
  if (status === 'UNKNOWN') return '처리 결과를 확인하지 못했어요. 잠시 후 마이페이지 내 일정에서 결과를 확인해 주세요.';
  return (REASONS[failureCode] || '요청이 확정되지 않았어요.') + (REFUNDS[refundStatus] || '');
}
