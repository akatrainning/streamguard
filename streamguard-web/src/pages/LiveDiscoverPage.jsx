import { useMemo, useState, useEffect, useRef } from "react";

/**
 * LiveDiscoverPage — 抖音直播间发现 + 对比分析
 *
 * 流程：
 *  1. 输入商品关键词（如"蓝莓"） → 搜索抖音所有正在卖该商品的直播间
 *  2. 结果按综合推荐分降序排列（LLM评估标题风险 + 观看人数）
 *  3. 点击"进入直播间" → 回调 onConnectRoom(roomId)，切换到仪表板监控该直播间
 *  4. 勾选 2+ 个直播间 → "对比分析" → P1/P2 跨直播间商品对比
 */
export default function LiveDiscoverPage({
  apiBase = "http://localhost:8011",
  onConnectRoom,          // (roomId: string) => void
  utterances = [],
  chatMessages = [],
}) {
  const [query, setQuery]           = useState("");
  const [searching, setSearching]   = useState(false);
  const [searchElapsed, setSearchElapsed] = useState(0); // 搜索已耗秒数
  const searchTimerRef              = useRef(null);
  const [searchResult, setResult]   = useState(null);   // { keyword, rooms, total, data_source }
  const [selectedIds, setSelected]  = useState([]);
  const [comparing, setComparing]   = useState(false);
  const [comparison, setComparison] = useState(null);   // full-suite response
  const [budget, setBudget]         = useState("");
  const [need, setNeed]             = useState("");
  const [error, setError]           = useState("");

  // 搜索计时器：每 200ms 更新已耗时
  useEffect(() => {
    if (searching) {
      setSearchElapsed(0);
      searchTimerRef.current = setInterval(() => {
        setSearchElapsed((s) => s + 0.2);
      }, 200);
    } else {
      clearInterval(searchTimerRef.current);
    }
    return () => clearInterval(searchTimerRef.current);
  }, [searching]);

  const rooms = searchResult?.rooms || [];

  /* ── Search ────────────────────────────────────────── */
  const runSearch = async () => {
    const kw = query.trim();
    if (!kw) { setError("请先输入商品关键词，例如：蓝莓、蛋白粉、口红"); return; }
    setError(""); setResult(null); setSelected([]); setComparison(null);
    setSearching(true);
    try {
      const res = await fetch(
        `${apiBase}/consumer/search-live-streams?q=${encodeURIComponent(kw)}&max_results=12`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "搜索失败");
      setResult(data);
      // Pre-select top 3 for quick comparison
      setSelected((data.rooms || []).slice(0, 3).map((r) => r.room_id));
    } catch (e) {
      setError(e?.message || "搜索失败");
    } finally {
      setSearching(false);
    }
  };

  /* ── Compare ────────────────────────────────────────── */
  const selectedRooms = useMemo(
    () => rooms.filter((r) => selectedIds.includes(r.room_id)),
    [rooms, selectedIds]
  );

  const runCompare = async () => {
    if (selectedRooms.length < 2) { setError("请至少勾选 2 个直播间进行对比"); return; }
    setError(""); setComparing(true); setComparison(null);
    try {
      const res = await fetch(`${apiBase}/consumer/compare-streams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: query.trim(),
          rooms: selectedRooms,
          user_profile: { budget: budget.trim(), core_need: need.trim() },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "对比失败");
      setComparison(data);
    } catch (e) {
      setError(e?.message || "对比失败");
    } finally {
      setComparing(false);
    }
  };

  const toggleSelect = (id) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  /* ── Enter room ─────────────────────────────────────── */
  const handleEnter = (roomId) => {
    if (typeof onConnectRoom === "function") {
      onConnectRoom(roomId);
    } else {
      window.open(`https://live.douyin.com/${roomId}`, "_blank", "noopener");
    }
  };

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Search bar */}
      <Panel title="发现直播间" subtitle="搜索抖音正在卖该商品的直播间，按综合推荐度排列">
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.8fr 0.8fr auto", gap: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="商品关键词，如：蓝莓、蛋白粉、儿童防晒霜"
            style={inputStyle}
          />
          <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="预算（可选）" style={inputStyle} />
          <input value={need} onChange={(e) => setNeed(e.target.value)} placeholder="核心需求（可选）" style={inputStyle} />
          <button style={primaryBtnStyle} onClick={runSearch} disabled={searching}>
            {searching ? "搜索中…" : "🔍 搜直播间"}
          </button>
        </div>

        {searching && (
          <SearchProgress elapsed={searchElapsed} />
        )}

        {searchResult && !searching && (
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
            找到 <b>{searchResult.total}</b> 个正在销售"<b>{searchResult.keyword}</b>"的直播间
            {searchResult.data_source === "none" && (
              <span style={{ marginLeft: 8, color: "var(--hype)" }}>
                ⚠ 抖音返回空结果（可能触发反爬，建议稍后重试或更换关键词）
              </span>
            )}
          </div>
        )}

        {!!error && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--trap)" }}>⚠ {error}</div>
        )}
      </Panel>

      {/* Results grid */}
      {rooms.length > 0 && (
        <Panel
          title={`直播间列表（${rooms.length} 个）`}
          subtitle="按推荐度降序 · 勾选 2+ 个进行跨直播间对比分析"
          action={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                已选 {selectedIds.length} 个
              </span>
              <button
                style={{ ...primaryBtnStyle, opacity: selectedIds.length >= 2 ? 1 : 0.4 }}
                disabled={selectedIds.length < 2 || comparing}
                onClick={runCompare}
              >
                {comparing ? "分析中…" : "📊 对比分析"}
              </button>
            </div>
          }
        >
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}>
            {rooms.map((room, idx) => (
              <LiveStreamCard
                key={room.room_id}
                room={room}
                rank={idx + 1}
                selected={selectedIds.includes(room.room_id)}
                onToggle={() => toggleSelect(room.room_id)}
                onEnter={() => handleEnter(room.room_id)}
              />
            ))}
          </div>
        </Panel>
      )}

      {/* Comparison loading */}
      {comparing && (
        <div style={{
          background: "var(--bg-secondary)", border: "1px solid var(--border)",
          borderRadius: 10, padding: "18px 16px",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20, animation: "searchSpin 1.5s linear infinite", display: "inline-block" }}>🤖</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>AI 正在对比分析直播间…</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                调用大模型评估价格、品质、信任度等维度，通常需要 5~15 秒
              </div>
            </div>
          </div>
          <CompareDotsBar />
        </div>
      )}

      {/* Comparison result */}
      {comparison && !comparing && (
        <ComparisonResult comparison={comparison} keyword={query} selectedRooms={selectedRooms} />
      )}
    </div>
  );
}

/* ══ LiveStreamCard ══════════════════════════════════════ */
function LiveStreamCard({ room, rank, selected, onToggle, onEnter }) {
  const score = room.recommendation_score ?? 0.5;
  const scoreColor =
    score >= 0.7 ? "var(--fact)" : score >= 0.45 ? "var(--hype)" : "var(--trap)";
  const riskMap = {
    low:    { c: "var(--fact)",  t: "低风险" },
    medium: { c: "var(--hype)",  t: "中风险" },
    high:   { c: "var(--trap)",  t: "高风险" },
  };
  const riskInfo = riskMap[room.risk_level || "medium"] || riskMap.medium;

  return (
    <div
      style={{
        border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--bg-secondary)",
        display: "flex",
        flexDirection: "column",
        transition: "border-color .15s",
      }}
    >
      {/* Thumbnail */}
      <div style={{ position: "relative", height: 140, background: "var(--bg-tertiary)", flexShrink: 0 }}>
        {room.thumbnail_url ? (
          <img
            src={room.thumbnail_url}
            alt={room.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 36 }}>
            🎥
          </div>
        )}

        {/* Rank badge */}
        <div style={{
          position: "absolute", top: 6, left: 6,
          background: "rgba(0,0,0,.6)", color: "#fff",
          borderRadius: 20, padding: "2px 7px", fontSize: 11, fontWeight: 700,
        }}>
          #{rank}
        </div>

        {/* Score badge */}
        <div style={{
          position: "absolute", top: 6, right: 6,
          background: scoreColor, color: "#fff",
          borderRadius: 20, padding: "2px 8px", fontSize: 12, fontWeight: 800,
        }}>
          {Math.round(score * 100)}分
        </div>

        {/* Risk badge */}
        <div style={{
          position: "absolute", bottom: 6, left: 6,
          background: riskInfo.c, color: "#fff",
          borderRadius: 20, padding: "2px 7px", fontSize: 10,
        }}>
          {riskInfo.t}
        </div>

        {/* Live indicator */}
        <div style={{
          position: "absolute", bottom: 6, right: 6,
          background: "rgba(255,50,50,.85)", color: "#fff",
          borderRadius: 20, padding: "2px 7px", fontSize: 10, fontWeight: 700,
        }}>
          🔴 直播中
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, wordBreak: "break-all" }}>
          {room.room_title || room.title || "直播中"}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          🎙️ {room.anchor_name || room.streamer_name || "主播"}
          {room.viewer_count > 0 && (
            <span style={{ marginLeft: 8 }}>👥 {fmtViewers(room.viewer_count)}</span>
          )}
        </div>
        {room.reason && (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 2 }}>
            {room.reason}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, marginTop: "auto", paddingTop: 8 }}>
          <button
            onClick={onEnter}
            style={{
              flex: 1,
              padding: "7px 0",
              borderRadius: 7,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            进入直播间
          </button>
          <button
            onClick={onToggle}
            style={{
              padding: "7px 10px",
              borderRadius: 7,
              border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
              background: selected ? "var(--accent)" : "var(--bg-tertiary)",
              color: selected ? "#fff" : "var(--text-primary)",
              fontSize: 12,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {selected ? "✓ 对比中" : "加入对比"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══ ComparisonResult ════════════════════════════════════ */
function ComparisonResult({ comparison, keyword, selectedRooms }) {
  const { p0, p1, p2, engine, evidence_stats } = comparison || {};

  const verdictMap = {
    BUY:  { c: "var(--fact)",  t: "综合推荐购买", icon: "✅" },
    WAIT: { c: "var(--hype)",  t: "建议先观望",   icon: "⏳" },
    SKIP: { c: "var(--trap)",  t: "不建议购买",   icon: "❌" },
  };
  const vm = verdictMap[(p0?.verdict || "WAIT")] || verdictMap.WAIT;
  const engineLabel = engine === "llm" ? "🤖 AI 分析" : "📐 规则引擎";

  return (
    <Panel
      title="跨直播间对比分析"
      subtitle={`关键词：${keyword} · ${engineLabel}`}
    >
      {/* P0 Verdict */}
      {p0 && (
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div style={{
            border: `1.5px solid ${vm.c}`, borderRadius: 8, padding: 12,
            background: "var(--bg-tertiary)", display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>综合结论</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: vm.c }}>
              {vm.icon} {vm.t}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              置信度 {Math.round((p0.confidence || 0.5) * 100)}%
            </div>
            {evidence_stats && (
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.6 }}>
                话术分析 {evidence_stats.utterance_count ?? 0} 条<br/>
                弹幕分析 {evidence_stats.chat_count ?? 0} 条
              </div>
            )}
          </div>
          <BulletBox title="推荐理由" items={p0.why_buy || []} />
          <BulletBox title="谨慎因素" items={p0.why_not_buy || []} danger />
        </div>
      )}
      {!p0 && (
        <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          ⚠ 未收到结构化分析结果，请检查后端日志
        </div>
      )}

      {/* P1 Comparison Table */}
      {p1?.compare_dimensions?.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>直播间维度对比</div>
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--bg-tertiary)" }}>
                  <th style={TH}>直播间</th>
                  {p1.compare_dimensions.map((d) => <th key={d} style={TH}>{d}</th>)}
                  <th style={TH}>综合分</th>
                </tr>
              </thead>
              <tbody>
                {(p1.products || []).map((p, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--bg-tertiary)" }}>
                    <td style={TD}>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                    </td>
                    {p1.compare_dimensions.map((d) => (
                      <td key={d} style={TD}>
                        <ScoreBar value={p.scores?.[d]} />
                      </td>
                    ))}
                    <td style={TD}>
                      <ScoreBar value={p.overall} bold />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Ranked recommendation */}
          {p1.ranked?.length > 0 && (
            <div style={{ marginTop: 8, padding: 10, background: "var(--bg-tertiary)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>推荐顺序</div>
              {p1.ranked.map((name, i) => (
                <div key={i} style={{ fontSize: 12, color: i === 0 ? "var(--fact)" : "var(--text-secondary)", marginBottom: 3 }}>
                  {i === 0 ? "🏆" : `${i + 1}.`} {name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* P2 Action toolkit */}
      {p2 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <BulletBox title="问主播的关键问题" items={p2.ask_anchor_questions || []} />
          <BulletBox title="替代方案" items={p2.alternatives || []} />
          {p2.buy_timing && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--bg-tertiary)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>最佳下单时机</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>{p2.buy_timing}</div>
            </div>
          )}
          <BulletBox title="行动计划" items={p2.action_plan || []} />
        </div>
      )}
    </Panel>
  );
}

/* ══ SearchProgress ══════════════════════════════════════ */
const SEARCH_STAGES = [
  { icon: "🚀", label: "启动无头浏览器",     start: 0,  end: 5  },
  { icon: "🌐", label: "打开抖音搜索页面",   start: 5,  end: 15 },
  { icon: "📡", label: "截获直播间 API 数据", start: 15, end: 28 },
  { icon: "🤖", label: "AI 评估直播间质量",  start: 28, end: 38 },
  { icon: "✨", label: "整理并排序结果",     start: 38, end: 45 },
];
const SEARCH_TOTAL = 45; // 预估总耗时（秒）

function SearchProgress({ elapsed = 0 }) {
  // 进度 0~95%（保留 5% 给最终完成）
  const pct = Math.min(95, Math.round((elapsed / SEARCH_TOTAL) * 100));
  const activeStageIdx = SEARCH_STAGES.findIndex(
    (s) => elapsed >= s.start && elapsed < s.end
  );
  const currentStage = activeStageIdx >= 0 ? activeStageIdx : SEARCH_STAGES.length - 1;
  const remainSec = Math.max(0, Math.round(SEARCH_TOTAL - elapsed));

  return (
    <div style={{
      marginTop: 12, padding: "14px 16px",
      background: "var(--bg-tertiary)",
      border: "1px solid var(--border)",
      borderRadius: 10,
    }}>
      {/* 顶部：标题 + 已耗时 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ animation: "searchSpin 1.2s linear infinite", display: "inline-block", fontSize: 14 }}>⏳</span>
          正在抓取抖音直播间数据
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          已耗时 {Math.floor(elapsed)}s
          {remainSec > 0 && <span style={{ marginLeft: 4 }}>· 预计还需 ~{remainSec}s</span>}
        </div>
      </div>

      {/* 进度条 */}
      <div style={{
        height: 6, background: "var(--border)", borderRadius: 3, marginBottom: 12, overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 3,
          background: "linear-gradient(90deg, var(--accent), var(--fact))",
          transition: "width 0.3s ease",
          boxShadow: "0 0 8px rgba(88,166,255,0.5)",
        }} />
      </div>

      {/* 阶段步骤 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {SEARCH_STAGES.map((stage, i) => {
          const done    = elapsed >= stage.end;
          const active  = i === currentStage && !done;
          const pending = i > currentStage;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              opacity: pending ? 0.35 : 1,
              transition: "opacity 0.3s",
            }}>
              {/* 状态图标 */}
              <div style={{
                width: 18, height: 18, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, flexShrink: 0,
                background: done
                  ? "rgba(63,185,80,0.15)"
                  : active
                    ? "rgba(88,166,255,0.15)"
                    : "var(--border)",
                border: `1.5px solid ${done ? "var(--fact)" : active ? "var(--accent)" : "var(--border)"}`,
              }}>
                {done ? "✓" : active
                  ? <span style={{ animation: "searchPulse 1s ease-in-out infinite", display: "inline-block", fontSize: 8 }}>●</span>
                  : "○"}
              </div>
              {/* 阶段图标 + 文字 */}
              <span style={{ fontSize: 11 }}>{stage.icon}</span>
              <span style={{
                fontSize: 12,
                color: done ? "var(--fact)" : active ? "var(--text-primary)" : "var(--text-muted)",
                fontWeight: active ? 600 : 400,
              }}>
                {stage.label}
              </span>
              {active && (
                <span style={{ fontSize: 10, color: "var(--accent)", marginLeft: "auto" }}>
                  进行中…
                </span>
              )}
              {done && (
                <span style={{ fontSize: 10, color: "var(--fact)", marginLeft: "auto" }}>
                  完成
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6 }}>
        💡 首次搜索需启动无头浏览器，约 20~45 秒；缓存命中时仅需 1~2 秒
      </div>

      {/* 内联动画样式 */}
      <style>{`
        @keyframes searchSpin  { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes searchPulse { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:0.4; transform:scale(0.7) } }
      `}</style>
    </div>
  );
}

/* ══ CompareDotsBar ══════════════════════════════════════ */
function CompareDotsBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} style={{
          width: i % 2 === 0 ? 8 : 5,
          height: i % 2 === 0 ? 8 : 5,
          borderRadius: "50%",
          background: "var(--accent)",
          animation: `compareDot 1.2s ease-in-out ${i * 0.12}s infinite`,
        }} />
      ))}
      <style>{`
        @keyframes compareDot {
          0%, 80%, 100% { transform: scale(0.4); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* ══ helpers ══════════════════════════════════════════════ */
function Panel({ title, subtitle, action, children }) {
  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 10, padding: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
          {subtitle && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>{subtitle}</span>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function BulletBox({ title, items = [], danger = false }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--bg-tertiary)" }}>
      <div style={{ fontSize: 11, color: danger ? "var(--trap)" : "var(--text-muted)", marginBottom: 4 }}>{title}</div>
      {!items.length && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>--</div>}
      {items.slice(0, 6).map((x, i) => (
        <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, lineHeight: 1.5 }}>• {x}</div>
      ))}
    </div>
  );
}

function ScoreBar({ value, bold = false }) {
  const n = Number(value);
  const pct = Number.isFinite(n) ? Math.round(Math.max(0, Math.min(1, n)) * 100) : null;
  if (pct === null) return <span style={{ color: "var(--text-muted)", fontSize: 11 }}>--</span>;
  const c = pct >= 70 ? "var(--fact)" : pct >= 45 ? "var(--hype)" : "var(--trap)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ flex: 1, height: 5, background: "var(--border)", borderRadius: 3 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: c, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: c, fontWeight: bold ? 700 : 400, minWidth: 26 }}>{pct}%</span>
    </div>
  );
}

function fmtViewers(n) {
  if (!n) return "直播中";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

/* ══ styles ══════════════════════════════════════════════ */
const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  outline: "none",
  fontSize: 12,
  boxSizing: "border-box",
};

const primaryBtnStyle = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: "var(--accent)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const TH = {
  textAlign: "left",
  fontSize: 11,
  color: "var(--text-muted)",
  padding: "8px 10px",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

const TD = {
  fontSize: 12,
  color: "var(--text-secondary)",
  padding: "8px 10px",
  borderBottom: "1px solid var(--border)",
};
