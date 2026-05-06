import { useEffect, useMemo, useState } from "react";

function formatTime(ts) {
  if (!ts) return "--:--:--";
  return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
}

function formatDuration(startTime, endTime) {
  if (!startTime || !endTime) return "--";
  const seconds = Math.max(0, Math.round((endTime - startTime) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return minutes > 0 ? `${minutes} 分 ${remain} 秒` : `${remain} 秒`;
}

function exportSnapshotJson(snapshot, aiSummary, aiAdvice) {
  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      roomId: snapshot?.roomId || null,
      startTime: snapshot?.startTime || null,
      endTime: snapshot?.endTime || null,
    },
    summary: {
      aiSummary,
      aiAdvice,
      rationalityIndex: snapshot?.rationalityIndex || 0,
      stats: snapshot?.stats || {},
    },
    utterances: snapshot?.utterances || [],
    chatMessages: snapshot?.chatMessages || [],
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `streamguard_report_${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

const primaryButtonStyle = {
  border: "1px solid color-mix(in oklab, var(--accent) 54%, black 46%)",
  background: "linear-gradient(180deg, color-mix(in oklab, var(--accent) 92%, white 8%), var(--accent-hover))",
  color: "var(--accent-contrast)",
  borderRadius: 8,
  padding: "8px 18px",
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "var(--accent-shadow-sm)",
};

const secondaryButtonStyle = {
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text-secondary)",
  borderRadius: 8,
  padding: "8px 14px",
  cursor: "pointer",
};

function MetricCard({ label, value, tone = "default" }) {
  const color = tone === "fact"
    ? "var(--fact)"
    : tone === "hype"
      ? "var(--hype)"
      : tone === "trap"
        ? "var(--trap)"
        : "var(--text-primary)";

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "var(--bg)" }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 24, lineHeight: 1.15, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export default function StableSessionReportModal({ snapshot, apiBase, onClose, onDismiss }) {
  const [aiSummary, setAiSummary] = useState("");
  const [aiAdvice, setAiAdvice] = useState([]);
  const [aiLoading, setAiLoading] = useState(true);

  const stats = useMemo(() => {
    const utterances = snapshot?.utterances || [];
    const fact = utterances.filter((item) => item?.type === "fact").length;
    const hype = utterances.filter((item) => item?.type === "hype").length;
    const trap = utterances.filter((item) => item?.type === "trap").length;
    return { total: utterances.length, fact, hype, trap };
  }, [snapshot]);

  const topRisks = useMemo(() => {
    const utterances = snapshot?.utterances || [];
    return [...utterances]
      .filter((item) => item?.type === "trap" || item?.type === "hype")
      .sort((a, b) => (a?.score ?? 1) - (b?.score ?? 1))
      .slice(0, 5);
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    const durationSeconds = snapshot.startTime && snapshot.endTime
      ? Math.max(0, Math.round((snapshot.endTime - snapshot.startTime) / 1000))
      : 0;

    setAiLoading(true);

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
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setAiSummary(data?.ai_summary || "");
        setAiAdvice(Array.isArray(data?.ai_advice) ? data.ai_advice : []);
      })
      .catch(() => {
        if (cancelled) return;
        setAiSummary("");
        setAiAdvice([]);
      })
      .finally(() => {
        if (!cancelled) setAiLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiBase, snapshot, stats]);

  if (!snapshot) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0, 0, 0, 0.72)",
      }}
    >
      <section
        style={{
          width: "min(960px, 100%)",
          maxHeight: "92vh",
          overflow: "auto",
          border: "1px solid var(--border)",
          borderRadius: 14,
          background: "var(--bg-secondary)",
          boxShadow: "0 24px 72px rgba(0, 0, 0, 0.48)",
        }}
      >
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-secondary)",
          }}
        >
          <div>
            <div style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 700 }}>本次监控总结报告</div>
            <div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 12 }}>
              直播间 {snapshot.roomId || "--"} · {formatTime(snapshot.startTime)} - {formatTime(snapshot.endTime)} · {formatDuration(snapshot.startTime, snapshot.endTime)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => exportSnapshotJson(snapshot, aiSummary, aiAdvice)} style={secondaryButtonStyle}>导出 JSON</button>
            <button type="button" onClick={onDismiss || onClose} style={secondaryButtonStyle}>关闭</button>
          </div>
        </header>

        <div style={{ display: "grid", gap: 14, padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <MetricCard label="话术总数" value={stats.total} />
            <MetricCard label="事实" value={stats.fact} tone="fact" />
            <MetricCard label="夸大" value={stats.hype} tone="hype" />
            <MetricCard label="陷阱" value={stats.trap} tone="trap" />
          </div>

          <section style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: "var(--bg)" }}>
            <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>AI 综合分析</div>
            {aiLoading ? (
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>正在生成 AI 报告...</div>
            ) : (
              <>
                <div style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
                  {aiSummary || "本次会话暂无可生成摘要的数据。"}
                </div>
                {aiAdvice.length > 0 && (
                  <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--text-secondary)" }}>
                    {aiAdvice.slice(0, 5).map((item, index) => (
                      <li key={index} style={{ marginBottom: 6 }}>
                        <strong style={{ color: "var(--text-primary)" }}>{item.title || "建议"}</strong>
                        <span>：{item.body || ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <section style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: "var(--bg)" }}>
            <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>高风险话术</div>
            {topRisks.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>本次会话未发现明显高风险话术。</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {topRisks.map((item, index) => {
                  const tone = item?.type === "trap" ? "var(--trap)" : "var(--hype)";
                  const toneBg = item?.type === "trap" ? "var(--trap-bg)" : "var(--hype-bg)";
                  const toneBorder = item?.type === "trap" ? "var(--trap-border)" : "var(--hype-border)";
                  return (
                    <div key={`${item?.id || index}-${index}`} style={{ border: `1px solid ${toneBorder}`, borderRadius: 8, padding: 10, background: toneBg }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                        <strong style={{ color: tone, fontSize: 12 }}>{(item?.type || "risk").toUpperCase()}</strong>
                        <span style={{ color: tone, fontSize: 12 }}>
                          {item?.score !== undefined ? `${Math.round((item.score || 0) * 100)} 分` : "--"}
                        </span>
                      </div>
                      <div style={{ color: "var(--text-primary)", fontSize: 13, lineHeight: 1.6 }}>{item?.text || "--"}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: 14, borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={onClose} style={primaryButtonStyle}>关闭报告并继续</button>
        </footer>
      </section>
    </div>
  );
}