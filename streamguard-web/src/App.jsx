import React, { useState, useEffect } from 'react';
import './App.css';

// 模拟直播视频背板
const LiveStream = () => (
  <div className="live-stream-container glass-card neon-border-violet">
    <div className="live-badge">LIVE</div>
    <div className="stream-overlay">
      <div className="host-info">
        <div className="avatar"></div>
        <span>主播：理性哨兵-AI</span>
      </div>
    </div>
    <div className="video-placeholder">
      <div className="pulse-circle"></div>
      <p>正在捕获直播流数据...</p>
    </div>
  </div>
);

// 理性指数仪表盘组件
const RationalityDashboard = ({ score }) => (
  <div className="dashboard-panel glass-card">
    <h3>理性消费指数</h3>
    <div className="gauge-container">
      <div className="gauge-value" style={{ '--value': `${score}%`, color: score > 70 ? 'var(--success)' : 'var(--warning)' }}>
        {score}
      </div>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" className="gauge-bg" />
        <circle cx="50" cy="50" r="45" className="gauge-progress" style={{
          strokeDashoffset: 282 - (282 * score) / 100,
          stroke: score > 70 ? 'var(--success)' : 'var(--warning)'
        }} />
      </svg>
    </div>
    <div className="status-tags">
      <span className={score > 80 ? 'active' : ''}>语义对齐: 优</span>
      <span className={score < 60 ? 'warning' : ''}>话术压力: 中</span>
    </div>
  </div>
);

// 决策建议弹窗
const DecisionModal = ({ isOpen, onClose, score }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content glass-card neon-border-violet">
        <h2>理性决策报告</h2>
        <div className="report-body">
          <div className="report-item">
            <h4>💡 核心诊断:</h4>
            <p>{score > 75 ? "当前主播陈述与事实基本一致，可以考虑购买。" : "主播存在夸大宣传风险，建议保持冷静。"}</p>
          </div>
          <div className="report-item">
            <h4>🚩 风险预警:</h4>
            <ul>
              {score < 90 && <li>价格波动：近30天最低价为当前价格的 85%</li>}
              {score < 80 && <li>话术陷阱：检测到“饥饿营销”相关诱导词汇</li>}
              {score < 70 && <li>语义冲突：材质描述与详情页存在微小差异</li>}
            </ul>
          </div>
        </div>
        <button className="confirm-btn secondary" onClick={onClose}>返回直播间</button>
      </div>
    </div>
  );
};

function App() {
  const [score, setScore] = useState(85);
  const [feeds, setFeeds] = useState([
    { id: 1, type: 'fact', time: '20:15:02', msg: '主播提到“纯棉材质”', tag: '语义一致 (对齐详情页)' },
    { id: 2, type: 'hype', time: '20:15:15', msg: '主播使用关键词“最后3分钟”', tag: '压力话术识别' },
    { id: 3, type: 'danger', time: '20:15:45', msg: '主播称“历史最低”', tag: '语义冲突: 近30天存在更低价' }
  ]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setScore(s => {
        const delta = Math.floor(Math.random() * 5) - 2;
        return Math.min(100, Math.max(0, s + delta));
      });

      // 模拟新的语义流增加
      if (Math.random() > 0.7) {
        setFeeds(prev => [
          {
            id: Date.now(),
            type: Math.random() > 0.5 ? 'fact' : 'hype',
            time: new Date().toLocaleTimeString([], { hour12: false }),
            msg: Math.random() > 0.5 ? '正在校验主播材质描述...' : '正在监控库存话术...',
            tag: '后台处理中'
          },
          ...prev.slice(0, 9)
        ]);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      <header className="main-header">
        <h1 className="neon-text-cyan">StreamGuard <span>v1.0</span></h1>
        <div className="system-status">
          <span className="dot pulse"></span> 系统就绪: 语义对齐引擎已连接
        </div>
      </header>

      <main className="layout-grid">
        <section className="left-panel">
          <LiveStream />
          <div className="semantic-feed glass-card">
            <h4>实时语义流分析</h4>
            <div className="feed-list">
              {feeds.map(item => (
                <div key={item.id} className={`feed-item ${item.type}`}>
                  <span className="time">{item.time}</span>
                  <p>{item.msg} — <span className="tag">{item.tag}</span></p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="right-panel">
          <RationalityDashboard score={score} />

          <div className="risk-analysis glass-card">
            <h3>多维风险评估</h3>
            <div className="bar-grid">
              {[
                { label: '描述真实度', val: 92 },
                { label: '价格透明度', val: 78 },
                { label: '受诱导冲动指数', val: 45 }
              ].map(item => (
                <div key={item.label} className="bar-item">
                  <span>{item.label}</span>
                  <div className="bar-bg">
                    <div className="bar-fill" style={{ width: `${item.val}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="decision-nexus">
            <button className="confirm-btn" onClick={() => setIsModalOpen(true)}>
              查看理性决策建议
            </button>
          </div>
        </section>
      </main>

      <DecisionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        score={score}
      />
    </div>
  );
}

export default App;
