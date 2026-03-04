import { useEffect, useMemo, useState } from "react";

function fmtTime(ts) {
  if (!ts) return "--:--:--";
  return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
}

function fmtDuration(startTime, endTime) {
  if (!startTime || !endTime) return "--";
  const sec = Math.max(0, Math.round((endTime - startTime) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

export default function StableSessionReportModal({ snapshot, apiBase, onClose, onDismiss }) {
  const [aiSummary, setAiSummary] = useState("");
  const [aiAdvice, setAiAdvice] = useState([]);
  const [aiLoading, setAiLoading] = useState(true);

  const stats = useMemo(() => {
    const utterances = snapshot?.utterances || [];
    const fact = utterances.filter((u) => u?.type === "fact").length;
    const hype = utterances.filter((u) => u?.type === "hype").length;
    const trap = utterances.filter((u) => u?.type === "trap").length;
    return { total: utterances.length, fact, hype, trap };
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    const durationSeconds = snapshot.startTime && snapshot.endTime
      ? Math.max(0, Math.round((snapshot.endTime - snapshot.startTime) / 1000))
      : 0;
    fetch(`${apiBase}/session/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        utterances: (snapshot.utterances || []).slice(0, 120),
        chatMessages: (snapshot.chatMessages || []).slice(0, 120),
        stats,
        rationalityIndex: snapshot.rationalityIndex || 0,
        roomId: snapshot.roomId || null,
        durationSeconds,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setAiSummary(data?.ai_summary || "");
        setAiAdvice(Array.isArray(data?.ai_advice) ? data.ai_advice : []);
      })
      .catch((e) => {
        console.error("[StableSessionReportModal] AI summary request failed:", e);
      })
      .finally(() => {
        if (!cancelled) setAiLoading(false);
      });
    return () => { cancelled = true; };
  }, [apiBase, snapshot, stats]);

  if (!snapshot) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 2200,
      background: "rgba(0,0,0,0.72)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        width: "min(960px, 100%)",
        maxHeight: "92vh",
        overflow: "auto",
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "var(--bg-secondary)",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          background: "var(--bg-secondary)",
          zIndex: 1,
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>
            本次监控总结报告
          </div>
          <button
            onClick={onDismiss}
            style={{
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-secondary)",
              borderRadius: 8,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16, display: "grid", gap: 14 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            直播间 {snapshot.roomId || "--"} · {fmtTime(snapshot.startTime)} - {fmtTime(snapshot.endTime)} · {fmtDuration(snapshot.startTime, snapshot.endTime)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 10 }}>
            <Card label="话术总数" value={stats.total} />
            <Card label="事实" value={stats.fact} />
            <Card label="夸大" value={stats.hype} />
            <Card label="陷阱" value={stats.trap} />
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>AI 综合分析</div>
            {aiLoading ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>正在生成 AI 报告...</div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  {aiSummary || "本次会话暂无可生成摘要的数据。"}
                </div>
                {aiAdvice.length > 0 && (
                  <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--text-secondary)" }}>
                    {aiAdvice.slice(0, 5).map((item, i) => (
                      <li key={i} style={{ marginBottom: 6 }}>
                        <strong>{item.title || "建议"}</strong>：{item.body || ""}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{
          borderTop: "1px solid var(--border)",
          padding: 14,
          display: "flex",
          justifyContent: "flex-end",
        }}>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              borderRadius: 8,
              padding: "8px 18px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            确定关闭并继续连接
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

