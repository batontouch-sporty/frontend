import Header from './Header';
import Footer from './Footer';

// 아직 준비 중이거나 존재하지 않는 경로에서도 공통 탐색 메뉴를 제공한다.
export default function PageMessage({ children }) {
  return <div className="sporty-message-page"><Header /><main>{children}</main><Footer /></div>;
}
