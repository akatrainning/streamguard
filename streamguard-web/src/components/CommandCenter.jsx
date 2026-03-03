import { useMemo, useState } from "react";

export default function CommandCenter({
  dataSource,
  sourceConfig,
  connection,
  utterances,
  chatMessages,
  messageTotals,
  recentLimits,
  onReconnect,
}) {
  const [watchInput, setWatchInput] = useState("最后, 限时, 第一, 全网最低");
  const [audioSecs, setAudioSecs] = useState(20);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [audioResult, setAudioResult] = useState(null);

  const watchWords = useMemo(() => (
    watchInput
      .split(/[，,\s]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 20)
  ), [watchInput]);

  const corpus = useMemo(() => {
    const u = utterances.map(x => x.text || "");
    const c = chatMessages.map(x => x.text || "");
    return [...u, ...c].join("\n");
  }, [utterances, chatMessages]);

  const watchStats = useMemo(() => {
    return watchWords.map(w => ({
      word: w,
      count: corpus ? (corpus.match(new RegExp(escapeRegExp(w), "g")) || []).length : 0,
    })).sort((a, b) => b.count - a.count);
  }, [watchWords, corpus]);

  const totalMsgs = messageTotals?.total ?? (utterances.length + chatMessages.length);
  const totalUtterances = messageTotals?.utterances ?? utterances.length;
  const totalChats = messageTotals?.chats ?? chatMessages.length;
  const activeMins = Math.max(1, Math.round(totalMsgs / 20));
  const throughput = Math.round(totalMsgs / activeMins);
  const lastSeen = connection.lastMessageAt
    ? new Date(connection.lastMessageAt).toLocaleTimeString("zh-CN", { hour12: false })
    : "--";

  const apiBase = (sourceConfig?.wsBase || "ws://localhost:8010").replace(/^ws/i, "http");

  const runAudioAnalysis = async () => {
    if (dataSource !== "douyin") {
      setAudioError("当前仅抖音数据源支持直播间音频分析");
      return;
    }
    if (!sourceConfig?.roomId) {
      setAudioError("请先填写并连接直播间房间号");
      return;
    }

    setAudioLoading(true);
    setAudioError("");
    try {
      const sec = Math.max(8, Math.min(90, Number(audioSecs) || 20));
      const url = `${apiBase}/douyin/audio-analyze/${sourceConfig.roomId}?seconds=${sec}`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || "音频分析失败");
      }
      setAudioResult(data);
    } catch (e) {
      setAudioError(e?.message || "音频分析失败");
    } finally {
      setAudioLoading(false);
    }
  };

  const exportSnapshot = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      source: dataSource,
      roomId: sourceConfig?.roomId || null,
      wsBase: sourceConfig?.wsBase || "ws://localhost:8000",
      connection: {
        connected: connection.connected,
        connecting: connection.connecting,
        attempts: connection.connectionAttempts,
        lastMessageAt: connection.lastMessageAt,
        error: connection.error,
      },
      kpi: {
        utterances: totalUtterances,
        chats: totalChats,
        totalMessages: totalMsgs,
        recentWindow: {
          utterances: recentLimits?.utterances ?? utterances.length,
          chats: recentLimits?.chats ?? chatMessages.length,
        },
        throughputPerMin: throughput,
      },
      watchStats,
      recentUtterances: utterances.slice(0, 20),
      recentChats: chatMessages.slice(0, 40),
      statusLog: connection.statusLog || [],
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `streamguard_snapshot_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 10, overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>运营指挥台</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onReconnect} style={btnStyle}>重连</button>
          <button onClick={exportSnapshot} style={btnStyle}>导出快照</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr", gap: 12, padding: 12 }}>
        {/* Connection diagnostics */}
        <Card title="连接诊断">
          <KV k="数据源" v={dataSource || "--"} />
          <KV k="房间" v={sourceConfig?.roomId || "--"} mono />
          <KV k="状态" v={connection.connected ? "已连接" : connection.connecting ? "连接中" : "未连接"} color={connection.connected ? "var(--fact)" : connection.connecting ? "var(--hype)" : "var(--trap)"} />
          <KV k="尝试次数" v={connection.connectionAttempts ?? 0} mono />
          <KV k="最近消息" v={lastSeen} mono />
          {connection.error && <div style={{ marginTop: 6, fontSize: 11, color: "var(--trap)" }}>{connection.error}</div>}
        </Card>

        {/* Throughput */}
        <Card title="吞吐与负载">
          <KV k="语义条数(累计)" v={totalUtterances} mono />
          <KV k="聊天条数(累计)" v={totalChats} mono />
          <KV k="总消息(累计)" v={totalMsgs} mono />
          <KV k="最近语义缓存" v={`${utterances.length}/${recentLimits?.utterances ?? utterances.length}`} mono />
          <KV k="最近聊天缓存" v={`${chatMessages.length}/${recentLimits?.chats ?? chatMessages.length}`} mono />
          <KV k="估算速率" v={`${throughput}/min`} mono />
          <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)" }}>
            仅限制前端最近 N 条显示；累计计数不封顶，不影响抓流频率。
          </div>
        </Card>

        {/* Watchlist */}
        <Card title="关键词哨兵">
          <input
            value={watchInput}
            onChange={e => setWatchInput(e.target.value)}
            placeholder="输入关键词，逗号分隔"
            style={{
              width: "100%", padding: "6px 8px", borderRadius: 6,
              background: "var(--bg-tertiary)", border: "1px solid var(--border)",
              color: "var(--text-primary)", fontSize: 12, outline: "none",
            }}
          />
          <div style={{ marginTop: 8, maxHeight: 130, overflowY: "auto" }}>
            {watchStats.length === 0 && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>暂无关键词</div>}
            {watchStats.map(item => (
              <div key={item.word} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: "var(--text-secondary)" }}>{item.word}</span>
                <span className="mono" style={{ color: item.count > 0 ? "var(--trap)" : "var(--text-muted)" }}>{item.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Status log */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px" }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>连接日志</div>
        <div style={{
          maxHeight: 88, overflowY: "auto",
          background: "var(--bg-tertiary)", borderRadius: 6,
          border: "1px solid var(--border)", padding: "6px 8px",
        }}>
          {(connection.statusLog || []).slice(0, 8).map((line, i) => (
            <div key={i} className="mono" style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>{line}</div>
          ))}
          {(!connection.statusLog || connection.statusLog.length === 0) && (
            <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>-- no logs --</div>
          )}
        </div>
      </div>

      {/* Audio semantic analysis */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px" }}>
        <Card title="直播间音频→ASR→语义分析（手动触发）">
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>采样时长(秒)</span>
            <input
              type="number"
              min={8}
              max={90}
              value={audioSecs}
              onChange={(e) => setAudioSecs(e.target.value)}
              style={{
                width: 72,
                padding: "4px 6px",
                borderRadius: 6,
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                fontSize: 12,
              }}
            />
            <button onClick={runAudioAnalysis} style={btnStyle} disabled={audioLoading}>
              {audioLoading ? "分析中..." : "开始音频分析"}
            </button>
          </div>

          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
            仅在你手动点击时抓取一次音频片段，不做自动高频轮询，降低反爬风险。
          </div>

          {audioError && (
            <div style={{ fontSize: 11, color: "var(--trap)", marginBottom: 8 }}>
              {audioError}
            </div>
          )}

          {audioResult && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: 8,
                background: "var(--bg-secondary)",
              }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>转写文本</div>
                <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {audioResult.transcript || "--"}
                </div>
              </div>

              <div style={{
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: 8,
                background: "var(--bg-secondary)",
              }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>整体语义结论</div>
                <KV k="类别" v={audioResult.analysis?.type || "--"} mono />
                <KV k="得分" v={audioResult.analysis?.score ?? "--"} mono />
                <KV k="引擎" v={audioResult.analysis?.engine || "--"} mono />
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                  {(audioResult.analysis?.violations || []).slice(0, 4).map((x, i) => (
                    <div key={i}>• {x}</div>
                  ))}
                </div>
              </div>

              <div style={{
                gridColumn: "1 / -1",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: 8,
                background: "var(--bg-secondary)",
              }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>逐句风险（规则引擎）</div>
                <div style={{ maxHeight: 140, overflowY: "auto" }}>
                  {(audioResult.sentence_analysis || []).map((row) => (
                    <div key={row.idx} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: "1px dashed var(--border)" }}>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        [{row.idx}] {row.text}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                        type={row.analysis?.type} score={row.analysis?.score}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 8,
      padding: 10, background: "var(--bg-tertiary)",
    }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function KV({ k, v, mono, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
      <span style={{ color: "var(--text-muted)" }}>{k}</span>
      <span className={mono ? "mono" : ""} style={{ color: color || "var(--text-secondary)" }}>{v}</span>
    </div>
  );
}

const btnStyle = {
  padding: "3px 8px",
  borderRadius: 6,
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  color: "var(--text-secondary)",
  fontSize: 11,
  cursor: "pointer",
};

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
