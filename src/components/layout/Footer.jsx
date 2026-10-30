import { Link } from 'react-router-dom';
import './footer.css';

// 공통 페이지 푸터. 아직 경로가 없는 약관·고객지원은 링크처럼 동작시키지 않는다.
export default function Footer() {
  return <footer className="sporty-footer">
    <div className="sporty-footer-inner">
      <div><Link className="sporty-footer-brand" to="/">Sporty</Link><p>함께 즐기는 스포츠, 함께 만드는 매치</p><small>© {new Date().getFullYear()} Sporty. All rights reserved.</small></div>
      <div className="sporty-footer-labels"><span>서비스 이용약관</span><span>개인정보 처리방침</span><span>고객지원센터</span></div>
    </div>
  </footer>;
}
