import "./WelcomePage.css";

export default function WelcomePage({ onEnter }) {
  return (
    <div className="welcome-page">
      <div className="welcome-grid" aria-hidden="true" />
      <div className="welcome-scanlines" aria-hidden="true" />
      <div className="welcome-glow" aria-hidden="true" />
      <div className="welcome-core">
        <div className="welcome-badge">
          <span className="mono">STREAMGUARD</span>
          <span className="welcome-status">SECURE</span>
        </div>
        <h1>StreamGuard</h1>
        <p>守护直播内容与舆情风险，实时感知异常与趋势信号。</p>
        <button className="welcome-enter" onClick={onEnter}>
          点击进入→
        </button>
        <div className="welcome-hint mono">Enter / 点击进入</div>
      </div>
      <div className="welcome-orbit" aria-hidden="true" />
    </div>
  );
}
