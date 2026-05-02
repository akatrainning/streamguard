import { useEffect, useRef, useState } from "react";
import StreamGuardMark from "../components/ui/StreamGuardMark";
import "./WelcomePage.css";

const ALERTS = [
  ["A1", "价格刺激", "HIGH"],
  ["B3", "弹幕质疑", "WATCH"],
  ["C2", "节奏升温", "LIVE"],
];

const METRICS = [
  ["82", "理性指数"],
  ["12", "风险片段"],
  ["3.2k", "弹幕采样"],
];

export default function WelcomePage({ onEnter }) {
  const [isExiting, setIsExiting] = useState(false);

  const handleEnter = () => {
    if (isExiting) return;
    setIsExiting(true);
    window.setTimeout(() => onEnter?.(), 520);
  };

  return (
    <main className={`welcome-page ${isExiting ? "is-exiting" : ""}`}>
      <header className="welcome-topbar">
        <div className="welcome-brand">
          <StreamGuardMark gradientId="sgWelcomeMark" />
          <div className="sg-lockup-copy">
            <span className="sg-lockup-title">StreamGuard</span>
            <small className="sg-lockup-subtitle">Live Monitoring Console</small>
          </div>
        </div>
        <div className="welcome-live">
          <span />
          LIVE OPS
        </div>
      </header>

      <section className="welcome-command">
        <div className="welcome-copy">
          <span className="welcome-eyebrow">STREAM RISK INTELLIGENCE</span>
          <h1>直播风险主屏</h1>
          <p>把主播话术、弹幕情绪和异常信号压缩到一个可行动的实时视图。</p>
          <button className="welcome-enter" onClick={handleEnter} disabled={isExiting}>
            进入控制台
          </button>
        </div>

        <div className="ops-screen" aria-label="实时监测主屏预览">
          <SignalField />
          <div className="ops-screen-header">
            <span className="mono">ROOM 646454278948</span>
            <span className="ops-screen-status">ON AIR</span>
          </div>

          <div className="ops-visual">
            <div className="broadcast-shot">
              <div className="broadcast-anchor" />
              <div className="broadcast-product" />
              <div className="broadcast-scan" />
              <div className="broadcast-caption">
                <span>semantic capture</span>
                <strong>00:18:42</strong>
              </div>
            </div>

            <div className="risk-lens">
              <div className="risk-lens-ring" />
              <div className="risk-lens-value">
                <strong>82</strong>
                <span>RATIONALITY</span>
              </div>
            </div>

            <div className="alert-column">
              {ALERTS.map(([id, title, level], index) => (
                <div key={id} className="alert-chip" style={{ "--delay": `${index * 170}ms` }}>
                  <span className="mono">{id}</span>
                  <strong>{title}</strong>
                  <em>{level}</em>
                </div>
              ))}
            </div>
          </div>

          <div className="ops-bottom">
            <div className="ops-metrics">
              {METRICS.map(([value, label]) => (
                <div key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="ops-wave">
              {Array.from({ length: 36 }).map((_, index) => (
                <span key={index} style={{ "--i": index }} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function SignalField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext("2d");
    let frame = 0;
    let raf = 0;
    let width = 0;
    let height = 0;
    let particles = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.floor(rect.width * ratio));
      height = Math.max(1, Math.floor(rect.height * ratio));
      canvas.width = width;
      canvas.height = height;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      const count = Math.round(Math.min(180, Math.max(90, rect.width / 7)));
      particles = Array.from({ length: count }, (_, index) => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        r: 0.7 + Math.random() * 1.7,
        speed: 0.18 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        tone: index % 9 === 0 ? "risk" : index % 5 === 0 ? "fact" : "base",
      }));
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.globalCompositeOperation = "lighter";

      const focusX = rect.width * 0.72;
      const focusY = rect.height * 0.45;

      particles.forEach((particle, index) => {
        particle.x += particle.speed;
        particle.y += Math.sin(frame * 0.012 + particle.phase) * 0.24;
        if (particle.x > rect.width + 20) {
          particle.x = -20;
          particle.y = Math.random() * rect.height;
        }

        const dx = focusX - particle.x;
        const dy = focusY - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const alpha = Math.max(0.12, 1 - distance / rect.width);
        const color = particle.tone === "risk"
          ? `rgba(215, 155, 48, ${0.36 * alpha})`
          : particle.tone === "fact"
            ? `rgba(47, 180, 122, ${0.32 * alpha})`
            : `rgba(63, 140, 255, ${0.28 * alpha})`;

        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        ctx.fill();

        if (index % 4 === 0 && distance < 240) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(63, 140, 255, ${0.09 * alpha})`;
          ctx.lineWidth = 1;
          ctx.moveTo(particle.x, particle.y);
          ctx.lineTo(focusX, focusY);
          ctx.stroke();
        }
      });

      ctx.globalCompositeOperation = "source-over";
      frame += 1;
      raf = window.requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas className="ops-signal-field" ref={canvasRef} aria-hidden="true" />;
}
