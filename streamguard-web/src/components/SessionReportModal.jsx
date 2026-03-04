/**
 * SessionReportModal — 监控结束后的会话总结报告
 *
 * Props:
 *  snapshot   — { utterances, stats, rationalityIndex, riskData, roomId, startTime, endTime }
 *  apiBase    — 后端地址，用于调用 /session/summary
 *  onClose    — 关闭报告回调（触发"连接新直播间"逻辑）
 */
import { useEffect, useState, useRef, useCallback } from "react";

// ─── 颜色常量（与 index.css 保持一致）─────────────────────────────
const C = {
  fact:  "#3fb950",
  hype:  "#d29922",
  trap:  "#f85149",
  info:  "#58a6ff",
  accent: "#58a6ff",
};
const LEVEL_META = {
  high:   { color: C.trap,  bg: "rgba(248,81,73,0.10)",   icon: "🚨", label: "高风险" },
  medium: { color: C.hype,  bg: "rgba(210,153,34,0.10)",  icon: "⚠️",  label: "中风险" },
  low:    { color: C.fact,  bg: "rgba(63,185,80,0.10)",   icon: "✅",  label: "低风险" },
  info:   { color: C.info,  bg: "rgba(88,166,255,0.10)",  icon: "💡",  label: "建议"   },
};

// ─── 工具函数 ────────────────────────────────────────────────────
function fmtDuration(startTime, endTime) {
  if (!startTime || !endTime) return "--";
  const secs = Math.round((endTime - startTime) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}
function fmtTime(ts) {
  if (!ts) return "--";
  return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
}
function scoreColor(score) {
  if (score < 0.35) return C.trap;
  if (score < 0.6)  return C.hype;
  return C.fact;
}

// ─── 子组件：进度条 ───────────────────────────────────────────────
function BarRow({ label, value, total, color }) {
  const pct = total > 0 ? Math.round(value / total * 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ color, fontWeight: 600 }}>{value} 条 &nbsp;<span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--bg)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.8s ease" }} />
      </div>
    </div>
  );
}

// ─── 子组件：AI 建议卡片 ──────────────────────────────────────────
function AdviceCard({ item, idx }) {
  const meta = LEVEL_META[item.level] || LEVEL_META.info;
  return (
    <div style={{
      padding: "12px 14px",
      borderRadius: 8,
      border: `1px solid ${meta.color}33`,
      background: meta.bg,
      display: "flex",
      gap: 12,
      alignItems: "flex-start",
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{meta.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10,
            background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}44`,
          }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{item.title}</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>{item.body}</p>
      </div>
    </div>
  );
}

// ─── 子组件：高风险话术列表 ───────────────────────────────────────
function RiskRow({ u, idx }) {
  const [open, setOpen] = useState(false);
  const tc = u.type === "trap" ? C.trap : u.type === "hype" ? C.hype : C.fact;
  return (
    <div
      onClick={() => setOpen(o => !o)}
      style={{
        padding: "8px 12px", borderRadius: 6, cursor: "pointer",
        border: `1px solid ${tc}33`,
        background: open ? `${tc}0d` : "transparent",
        marginBottom: 4, transition: "background 0.2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontSize: 9, padding: "1px 6px", borderRadius: 4, fontWeight: 700,
          background: `${tc}22`, color: tc, border: `1px solid ${tc}44`, flexShrink: 0,
        }}>
          {u.type?.toUpperCase()}
        </span>
        <span style={{ flex: 1, fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: open ? "normal" : "nowrap" }}>
          {u.text}
        </span>
        <span style={{ fontSize: 11, color: tc, fontWeight: 600, flexShrink: 0 }}>
          {u.score !== undefined ? (u.score * 100).toFixed(0) + "分" : ""}
        </span>
        <span style={{ fontSize: 9, color: "var(--text-muted)", flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </div>
    </div>
  );
}

// ─── 导出函数 ────────────────────────────────────────────────────
function doExportTxt(snapshot, aiAdvice) {
  const { utterances = [], stats = {}, rationalityIndex = 0, roomId, startTime, endTime } = snapshot;
  const lines = [
    "═══════════════════════════════════════════",
    "       StreamGuard 监控会话总结报告",
    "═══════════════════════════════════════════",
    `生成时间：${new Date().toLocaleString("zh-CN")}`,
    `直播间：${roomId || "未知"}`,
    `监控时段：${fmtTime(startTime)} - ${fmtTime(endTime)}`,
    `监控时长：${fmtDuration(startTime, endTime)}`,
    "",
    "─── 数据概况 ───",
    `话术总数：${stats.total || 0} 条`,
    `理性指数：${rationalityIndex} 分`,
    `事实型(FACT)：${stats.fact || 0} 条`,
    `夸大型(HYPE)：${stats.hype || 0} 条`,
    `陷阱型(TRAP)：${stats.trap || 0} 条`,
    "",
    "─── AI 综合建议 ───",
    ...(aiAdvice || []).map(a => `[${(LEVEL_META[a.level] || LEVEL_META.info).label}] ${a.title}：${a.body}`),
    "",
    "─── 全部话术记录 ───",
    ...utterances.map((u, i) =>
      `[${String(i + 1).padStart(3, "0")}][${(u.type || "?").toUpperCase()}] score:${u.score ?? "?"} | ${u.text}`
    ),
    "",
    "═══════════════════════════════════════════",
    "       Powered by StreamGuard",
    "═══════════════════════════════════════════",
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `streamguard_report_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function doExportJson(snapshot, aiAdvice) {
  const data = {
    meta: {
      tool: "StreamGuard",
      version: "2.3",
      generatedAt: new Date().toISOString(),
      roomId: snapshot.roomId,
      startTime: snapshot.startTime,
      endTime: snapshot.endTime,
      durationSeconds: snapshot.startTime && snapshot.endTime
        ? Math.round((snapshot.endTime - snapshot.startTime) / 1000)
        : null,
    },
    summary: {
      rationalityIndex: snapshot.rationalityIndex,
      stats: snapshot.stats,
    },
    aiAdvice,
    utterances: snapshot.utterances,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `streamguard_report_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── 主组件 ──────────────────────────────────────────────────────
export default function SessionReportModal({ snapshot, apiBase, onClose, onDismiss }) {
  console.log("[SessionReportModal] 组件被渲染！snapshot:", snapshot);
  const [aiAdvice, setAiAdvice]     = useState(null);
  const [aiSummary, setAiSummary]   = useState("");
  const [aiLoading, setAiLoading]   = useState(true);
  const [aiError, setAiError]       = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const fetchedRef = useRef(false);
  const dismissModal = onDismiss || onClose;

  const { utterances = [], chatMessages = [], stats = {}, rationalityIndex = 0, roomId, startTime, endTime } = snapshot || {};
  const total   = stats.total || 0;
  const trapPct = total > 0 ? Math.round((stats.trap || 0) / total * 100) : 0;

  // 按风险从高到低排序话术（score 越低 = 越危险）
  const sortedByRisk = [...utterances].sort((a, b) => (a.score ?? 1) - (b.score ?? 1));
  const topRisks = sortedByRisk.filter(u => u.type === "trap" || u.type === "hype").slice(0, 10);

  // 请求 AI 建议
  useEffect(() => {
    if (fetchedRef.current || !snapshot) return;
    fetchedRef.current = true;

    const durationSeconds = startTime && endTime
      ? Math.round((endTime - startTime) / 1000)
      : 0;

    fetch(`${apiBase}/session/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        utterances: utterances.slice(0, 100),
        chatMessages: chatMessages.slice(0, 80),
        stats,
        rationalityIndex,
        roomId,
        durationSeconds,
      }),
    })
      .then(r => r.json())
      .then(data => {
        setAiAdvice(data.ai_advice || []);
        setAiSummary(data.ai_summary || "");
        setAiLoading(false);
      })
      .catch(e => {
        setAiError("AI分析服务暂时不可用");
        setAiLoading(false);
      });
  }, []);

  // 理性指数颜色
  const riColor = rationalityIndex >= 75 ? C.fact : rationalityIndex >= 50 ? C.hype : C.trap;

  // 防止背景滚动
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000,
      background: "rgba(0,0,0,0.80)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        width: "min(960px, 100%)",
        maxHeight: "94vh",
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
      }}>

        {/* ── Header 栏 ── */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
          background: "var(--bg-tertiary)",
        }}>
          <span style={{ fontSize: 20 }}>📊</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
              本次监控总结报告
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {roomId ? `直播间 ${roomId}` : "模拟数据"}
              &nbsp;·&nbsp;
              {fmtTime(startTime)} — {fmtTime(endTime)}
              &nbsp;·&nbsp;
              {fmtDuration(startTime, endTime)}
            </div>
          </div>
          {/* 导出按钮组 */}
          <div style={{ display: "flex", gap: 6 }}>
            <ExportBtn
              label="导出 TXT"
              icon="📄"
              onClick={() => doExportTxt(snapshot, aiAdvice)}
            />
            <ExportBtn
              label="导出 JSON"
              icon="🗂"
              onClick={() => doExportJson(snapshot, aiAdvice)}
            />
            <ExportBtn
              label="打印 / PDF"
              icon="🖨"
              onClick={() => window.print()}
            />
          </div>
          {/* 关闭触发确认 */}
          <button
            onClick={dismissModal}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--bg)", color: "var(--text-muted)",
              fontSize: 12, cursor: "pointer", marginLeft: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* ── 内容区（可滚动）── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>

          {/* 第一行：核心指标卡片 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            <MetricCard label="话术总数" value={total} unit="条" color={C.info} icon="💬" />
            <MetricCard label="理性指数" value={rationalityIndex} unit="分" color={riColor} icon="🧠" />
            <MetricCard label="陷阱话术" value={stats.trap || 0} unit={`条 (${trapPct}%)`} color={trapPct >= 20 ? C.trap : C.hype} icon="⚠️" />
            <MetricCard label="监控时长" value={fmtDuration(startTime, endTime)} unit="" color={C.info} icon="⏱" />
          </div>

          {/* 第二行：话术分布 + 风险话术 TOP */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
            {/* 分布图 */}
            <Section title="话术类型分布" icon="📈">
              <BarRow label="✅ 事实型 (FACT)" value={stats.fact || 0} total={total} color={C.fact} />
              <BarRow label="⚠️ 夸大型 (HYPE)" value={stats.hype || 0} total={total} color={C.hype} />
              <BarRow label="🚨 陷阱型 (TRAP)" value={stats.trap || 0} total={total} color={C.trap} />
              {/* 理性指数可视化 */}
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: "var(--text-secondary)" }}>理性指数</span>
                  <span style={{ color: riColor, fontWeight: 700 }}>{rationalityIndex} 分</span>
                </div>
                <div style={{ height: 10, borderRadius: 5, background: "var(--bg)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${rationalityIndex}%`, borderRadius: 5,
                    background: `linear-gradient(90deg, ${C.trap} 0%, ${C.hype} 40%, ${C.fact} 80%)`,
                    backgroundSize: "100% 100%",
                    backgroundPosition: `${100 - rationalityIndex}% 0`,
                    transition: "width 0.9s ease",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>
                  <span>高风险 0</span><span>100 低风险</span>
                </div>
              </div>
            </Section>

            {/* 高风险话术 TOP */}
            <Section title={`高风险话术 TOP ${topRisks.length}`} icon="🔍">
              {topRisks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: 12 }}>
                  🎉 本次未发现明显高风险话术
                </div>
              ) : (
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                  {topRisks.map((u, i) => <RiskRow key={u.id || i} u={u} idx={i} />)}
                </div>
              )}
            </Section>
          </div>

          {/* AI 综合建议 */}
          <Section title="AI 综合建议" icon="🤖" style={{ marginBottom: 20 }}>
            {aiLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0", color: "var(--text-muted)", fontSize: 12 }}>
                <LoadingDot />
                AI 正在综合分析主播话术和观众弹幕，请稍候…
              </div>
            ) : aiError ? (
              <div style={{ color: C.hype, fontSize: 12, padding: "12px 0" }}>⚠️ {aiError}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* AI 内容总结段落 */}
                {aiSummary && (
                  <div style={{
                    padding: "12px 14px",
                    borderRadius: 8,
                    background: "rgba(88,166,255,0.06)",
                    border: "1px solid rgba(88,166,255,0.2)",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.7,
                    marginBottom: 4,
                  }}>
                    <span style={{ fontWeight: 600, color: C.info, marginRight: 6 }}>📝 内容总结</span>
                    {aiSummary}
                  </div>
                )}
                {(aiAdvice || []).map((item, i) => (
                  <AdviceCard key={i} item={item} idx={i} />
                ))}
                {aiAdvice?.length === 0 && (
                  <div style={{ color: "var(--text-muted)", fontSize: 12 }}>暂无 AI 建议</div>
                )}
              </div>
            )}
          </Section>

        </div>

        {/* ── 底部操作栏 ── */}
        <div style={{
          padding: "14px 20px",
          borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "var(--bg-tertiary)", flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            报告生成于 {new Date().toLocaleString("zh-CN")} · Powered by StreamGuard
          </span>
          <button
            onClick={() => setShowConfirm(true)}
            style={{
              padding: "8px 24px", borderRadius: 8,
              background: "var(--accent)", border: "none",
              color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
              boxShadow: "0 2px 10px rgba(88,166,255,0.3)",
            }}
          >
            关闭报告并连接新直播间 →
          </button>
        </div>
      </div>

      {/* 二次确认弹窗 */}
      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 2100,
          background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 12, padding: 28,
            width: 360, textAlign: "center",
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🔄</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>
              确认关闭报告？
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.7 }}>
              关闭后本次会话数据将被清空，<br />
              可在关闭前先导出报告留存。
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: "8px 20px", borderRadius: 8,
                  background: "var(--bg-tertiary)", border: "1px solid var(--border)",
                  color: "var(--text-secondary)", cursor: "pointer", fontSize: 13,
                }}
              >
                取消
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: "8px 20px", borderRadius: 8,
                  background: C.accent, border: "none",
                  color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
                }}
              >
                确认，连接新直播间
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 小型复用组件 ─────────────────────────────────────────────────

function Section({ title, icon, children, style }) {
  return (
    <div style={{
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 10, padding: "16px 16px",
      ...style,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginBottom: 14, color: "var(--text-secondary)",
        fontSize: 12, fontWeight: 600,
      }}>
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function MetricCard({ label, value, unit, color, icon }) {
  return (
    <div style={{
      background: "var(--bg)",
      border: `1px solid ${color}44`,
      borderRadius: 10, padding: "14px 16px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {unit && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{unit}</div>}
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>{label}</div>
    </div>
  );
}

function ExportBtn({ label, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px", borderRadius: 6,
        background: "var(--bg)", border: "1px solid var(--border)",
        color: "var(--text-secondary)", fontSize: 11, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 5,
        transition: "border-color 0.2s, color 0.2s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.color = "var(--accent)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function LoadingDot() {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "var(--accent)",
          animation: `blink 1.2s ${i * 0.3}s infinite`,
        }} />
      ))}
    </div>
  );
}
