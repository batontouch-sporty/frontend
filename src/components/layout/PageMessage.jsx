import { Link } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

// 아직 준비 중이거나 존재하지 않는 경로에서도 공통 탐색 메뉴와 메인으로 돌아갈 길을 제공한다.
export default function PageMessage({ children }) {
  return <div className="sporty-message-page"><Header /><main><h1>{children}</h1><Link to="/">메인으로 가기</Link></main><Footer /></div>;
}
