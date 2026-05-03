import { useEffect, useRef, useState } from "react";
import StreamGuardMark from "../components/ui/StreamGuardMark";
import "./WelcomePage.css";

const ALERTS = [
  ["P0", "绝对化承诺", "trap"],
  ["P1", "价格刺激", "hype"],
  ["OK", "证据补全", "fact"],
];

const METRICS = [
  ["82", "理性指数"],
  ["12", "风险片段"],
  ["3.2k", "弹幕采样"],
];

const PACKETS = [
  "room.connect / 646454278948",
  "semantic.feed / 24ms",
  "claim.guard / 12 hits",
  "evidence.rag / synced",
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
          <div>
            <span>StreamGuard</span>
            <small>Live Risk Cockpit</small>
          </div>
        </div>
        <div className="welcome-live">
          <span />
          LIVE OPS
        </div>
      </header>

      <section className="welcome-command">
        <aside className="welcome-copy">
          <span className="welcome-eyebrow">STREAM RISK INTELLIGENCE</span>
          <h1>把直播风险压缩成一张可执行的主屏。</h1>
          <p>接入直播间，实时识别话术、弹幕情绪、夸大承诺与证据缺口。</p>
          <button className="welcome-enter" onClick={handleEnter} disabled={isExiting}>
            进入控制台
          </button>
        </aside>

        <div className="ops-screen" aria-label="实时监测主屏预览">
          <SignalField />
          <div className="ops-screen-header">
            <span className="mono">ROOM 646454278948</span>
            <span className="ops-screen-status">SIGNAL LOCKED</span>
          </div>

          <div className="ops-grid-map" aria-hidden="true">
            {Array.from({ length: 56 }).map((_, index) => (
              <span key={index} style={{ "--i": index }} />
            ))}
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
              {ALERTS.map(([id, title, tone], index) => (
                <div key={id} className={`alert-chip is-${tone}`} style={{ "--delay": `${index * 170}ms` }}>
                  <span className="mono">{id}</span>
                  <strong>{title}</strong>
                  <em>{tone.toUpperCase()}</em>
                </div>
              ))}
            </div>

            <div className="packet-console">
              {PACKETS.map((packet, index) => (
                <span key={packet} className="mono" style={{ "--delay": `${index * 120}ms` }}>
                  {packet}
                </span>
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
    let particles = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      const count = Math.round(Math.min(170, Math.max(84, rect.width / 7)));
      particles = Array.from({ length: count }, (_, index) => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        r: 0.6 + Math.random() * 1.7,
        speed: 0.16 + Math.random() * 0.46,
        phase: Math.random() * Math.PI * 2,
        tone: index % 11 === 0 ? "risk" : index % 5 === 0 ? "fact" : "base",
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
        particle.y += Math.sin(frame * 0.012 + particle.phase) * 0.22;
        if (particle.x > rect.width + 20) {
          particle.x = -20;
          particle.y = Math.random() * rect.height;
        }

        const dx = focusX - particle.x;
        const dy = focusY - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const alpha = Math.max(0.12, 1 - distance / rect.width);
        const color = particle.tone === "risk"
          ? `rgba(246, 255, 95, ${0.32 * alpha})`
          : particle.tone === "fact"
            ? `rgba(0, 217, 146, ${0.34 * alpha})`
            : `rgba(200, 197, 187, ${0.13 * alpha})`;

        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        ctx.fill();

        if (index % 5 === 0 && distance < 230) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0, 217, 146, ${0.08 * alpha})`;
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
