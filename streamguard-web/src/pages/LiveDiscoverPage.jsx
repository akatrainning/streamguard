import { useMemo, useState, useEffect, useRef, useCallback } from "react";

/* -- Theme tokens (consistent with App.css / index.css) -- */
const A    = "rgba(63,140,255,";   // accent base
const FACT = "#2fb47a";
const HYPE = "#d79b30";
const TRAP = "#e35b5b";

/* -- Global CSS (animations + card interactions) -- */
const GLOBAL_CSS = `
  @keyframes ldcFadeUp   { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ldcFadeIn   { from{opacity:0} to{opacity:1} }
  @keyframes ldcShimmer  { 0%{background-position:-200% center} 100%{background-position:200% center} }
  @keyframes ldcPulse    { 0%,100%{opacity:1} 50%{opacity:.3} }
  @keyframes ldcSpin     { from{transform:rotate(0)} to{transform:rotate(360deg)} }
  @keyframes ldcDot      { 0%,80%,100%{transform:scale(.35);opacity:.2} 40%{transform:scale(1);opacity:1} }
  @keyframes ldcLive     { 0%,100%{opacity:1} 50%{opacity:.25} }
  @keyframes ldcSlideIn  { from{opacity:0;transform:translateY(20px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes ldcModalBg  { from{opacity:0} to{opacity:1} }

  .ldc-card {
    transition: transform .22s cubic-bezier(.4,0,.2,1), box-shadow .22s cubic-bezier(.4,0,.2,1), border-color .18s;
  }
  .ldc-card:hover {
    transform: translateY(-4px) !important;
    box-shadow: 0 12px 32px rgba(0,0,0,.32), 0 0 0 1px ${A}.18) !important;
    border-color: ${A}.35) !important;
  }
  .ldc-card:hover .ldc-thumb { transform: scale(1.04); }
  .ldc-thumb { transition: transform .35s ease; }

  .ldc-btn-primary { transition: all .16s ease; }
  .ldc-btn-primary:hover {
    filter: brightness(1.12);
    box-shadow: 0 4px 16px ${A}.35);
  }

  .ldc-modal-overlay { animation: ldcModalBg .22s ease both; }
  .ldc-modal-body { animation: ldcSlideIn .32s cubic-bezier(.16,1,.3,1) both; }

  .ldc-input:focus {
    border-color: var(--accent) !important;
    box-shadow: 0 0 0 3px ${A}.12) !important;
  }
`;

/**
 * LiveDiscoverPage — 抖音直播间发现 + 对比分析
 */
export default function LiveDiscoverPage({
  apiBase = "http://localhost:8011",
  onConnectRoom,
  utterances = [],
  chatMessages = [],
}) {
  const [query, setQuery]           = useState("");
  const [searching, setSearching]   = useState(false);
  const [searchElapsed, setSearchElapsed] = useState(0);
  const searchTimerRef              = useRef(null);
  const [searchResult, setResult]   = useState(null);
  const [selectedIds, setSelected]  = useState([]);
  const [comparing, setComparing]   = useState(false);
  const [comparison, setComparison] = useState(null);
  const [showModal, setShowModal]   = useState(false);
  const [error, setError]           = useState("");

  // Cookie
  const [cookieStatus, setCookieStatus] = useState(null);
  const [authLoading, setAuthLoading]   = useState(false);
  const [showCookiePaste, setShowCookiePaste] = useState(false);
  const [cookiePasteText, setCookiePasteText] = useState("");

  useEffect(() => {
    fetch(`${apiBase}/consumer/cookie-status`)
      .then(r => r.json())
      .then(setCookieStatus)
      .catch(() => {});
  }, [apiBase]);

  const handleAuth = async () => {
    setAuthLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/consumer/auth-douyin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: query.trim() || "" }),
        signal: AbortSignal.timeout(330_000),
      });
      const data = await res.json();
      if (data.success) {
        setError("");
        fetch(`${apiBase}/consumer/cookie-status`)
          .then(r => r.json())
          .then(setCookieStatus)
          .catch(() => {});
        setCookieStatus(prev => ({
          ...prev,
          exists: data.cookies_saved > 0,
          count: data.cookies_saved,
          profile_exists: data.profile_saved ?? prev?.profile_exists,
        }));
      } else {
        setError(data.message || "登录失败，请重试");
      }
    } catch (e) {
      setError(e?.message || "请求失败");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUploadCookies = async () => {
    setError("");
    try {
      const cookies = JSON.parse(cookiePasteText.trim());
      if (!Array.isArray(cookies) || cookies.length === 0) {
        setError("Cookie 格式错误：必须为非空 JSON 数组");
        return;
      }
      const res = await fetch(`${apiBase}/consumer/upload-cookies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies }),
      });
      const data = await res.json();
      if (data.success) {
        setCookieStatus(prev => ({ ...prev, exists: true, count: data.saved }));
        setShowCookiePaste(false);
        setCookiePasteText("");
      } else {
        setError(data?.detail || "上传失败");
      }
    } catch (e) {
      setError("JSON 解析错误：" + (e?.message || "格式无效"));
    }
  };

  useEffect(() => {
    if (searching) {
      setSearchElapsed(0);
      searchTimerRef.current = setInterval(() => setSearchElapsed(s => s + 0.2), 200);
    } else {
      clearInterval(searchTimerRef.current);
    }
    return () => clearInterval(searchTimerRef.current);
  }, [searching]);

  const rooms = searchResult?.rooms || [];

  /* -- Search -- */
  const runSearch = async () => {
    const kw = query.trim();
    if (!kw) { setError("请先输入商品关键词，例如：蓝莓、蛋白粉、口红"); return; }
    setError(""); setResult(null); setSelected([]); setComparison(null); setShowModal(false);
    setSearching(true);
    try {
      const res = await fetch(
        `${apiBase}/consumer/search-live-streams?q=${encodeURIComponent(kw)}&max_results=12`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "搜索失败");
      setResult(data);
      setSelected((data.rooms || []).slice(0, 3).map(r => r.room_id));
    } catch (e) {
      setError(e?.message || "搜索失败");
    } finally {
      setSearching(false);
    }
  };

  /* -- Compare -- */
  const selectedRooms = useMemo(
    () => rooms.filter(r => selectedIds.includes(r.room_id)),
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
          user_profile: {},
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "对比失败");
      setComparison(data);
      setShowModal(true);
    } catch (e) {
      setError(e?.message || "对比失败");
    } finally {
      setComparing(false);
    }
  };

  const toggleSelect = id =>
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

  const handleEnter = roomId => {
    if (typeof onConnectRoom === "function") {
      onConnectRoom(roomId);
    } else {
      window.open(`https://live.douyin.com/${roomId}`, "_blank", "noopener");
    }
  };

  // Close modal on Escape
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape" && showModal) setShowModal(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showModal]);

  const authState = cookieStatus?.profile_exists ? "ok" : cookieStatus?.exists ? "warn" : "none";
  const AUTH_META = {
    ok:   { color: FACT, label: `已登录 · ${cookieStatus?.profile_size_mb || 0}MB · ${cookieStatus?.count || 0} cookies` },
    warn: { color: HYPE, label: `仅 Cookie (${cookieStatus?.count || 0} 条) · 建议重新登录` },
    none: { color: TRAP, label: "未登录 · 建议先登录以获取真实数据" },
  };
  const authMeta = AUTH_META[authState];

  /* -- Render -- */
  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{
        maxWidth: 1500, margin: "0 auto",
        padding: "20px 24px",
        display: "flex", flexDirection: "column", gap: 18,
        animation: "ldcFadeUp .35s ease",
      }}>

        {/* Page Title — same classes as 实时总览 */}
        <div className="sg-dashboard-head">
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <div className="sg-dashboard-title">直播发现</div>
            {/* {searchResult && !searching && (
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                共 {searchResult.total} 个直播间
                {searchResult.data_source !== "fallback_mock" && (
                  <span style={{ color: FACT, marginLeft: 8 }}>实时数据</span>
                )}
              </span>
            )} */}
          </div>
          {selectedIds.length > 0 && (
            <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
              已选 {selectedIds.length} 个
            </span>
          )}
        </div>

        {/* Search Panel — sg-ops-card style */}
        <div style={{
          background: "linear-gradient(180deg, rgba(18,29,45,.92), rgba(15,24,37,.95))",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "18px 20px",
          boxShadow: "var(--shadow-sm)",
        }}>
          {/* Search row */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <svg style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", opacity:.4, pointerEvents:"none" }}
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="ldc-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runSearch()}
                placeholder="输入商品关键词，如：蓝莓、蛋白粉、儿童防晒霜…"
                style={{
                  width: "100%", padding: "11px 16px 11px 42px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "linear-gradient(180deg, rgba(24,37,56,.9), rgba(21,33,49,.9))",
                  color: "var(--text-primary)", outline: "none",
                  fontSize: 13, boxSizing: "border-box",
                  transition: "border-color .18s, box-shadow .18s",
                  minHeight: 40,
                }}
              />
            </div>
            <button
              className="ldc-btn-primary"
              onClick={runSearch}
              disabled={searching}
              style={{
                padding: "0 26px", borderRadius: 8, border: "none",
                background: searching ? `${A}.3)` : "var(--accent)",
                color: "#fff",
                cursor: searching ? "not-allowed" : "pointer",
                fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                minHeight: 40,
              }}
            >
              {searching ? "搜索中…" : "搜索"}
            </button>
          </div>

          {/* Error */}
          {!!error && (
            <div style={{
              marginTop: 10, padding: "8px 14px", borderRadius: 8,
              background: "var(--trap-bg)", border: "1px solid var(--trap-border)",
              fontSize: 12, color: "var(--trap)",
              animation: "ldcFadeUp .2s ease",
            }}>{error}</div>
          )}

          {/* Auth bar */}
          {!searching && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "5px 13px", borderRadius: 20,
                background: `${authMeta.color}15`, border: `1px solid ${authMeta.color}35`,
                fontSize: 11, color: authMeta.color, flexShrink: 0,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: authMeta.color,
                  animation: authState === "ok" ? "ldcLive 2.5s ease-in-out infinite" : "none",
                }} />
                {authMeta.label}
              </div>
              <button onClick={handleAuth} disabled={authLoading}
                style={{
                  padding: "5px 14px", borderRadius: 20,
                  border: "1px solid var(--panel-border)",
                  background: "var(--accent-soft)", color: "var(--accent)",
                  cursor: "pointer", fontSize: 11, fontWeight: 600,
                }}
              >
                {authLoading ? "Chrome 已打开，请登录后关闭…" : authState === "ok" ? "刷新登录" : "打开 Chrome 登录"}
              </button>
              <button onClick={() => setShowCookiePaste(v => !v)}
                style={{
                  padding: "5px 12px", borderRadius: 20,
                  border: "1px solid rgba(255,255,255,.08)", background: "transparent",
                  color: "var(--text-muted)", cursor: "pointer", fontSize: 11,
                }}
              >
                {showCookiePaste ? "取消" : "粘贴 Cookie"}
              </button>
            </div>
          )}

          {/* Cookie paste */}
          {showCookiePaste && (
            <div style={{ marginTop: 10, display: "flex", gap: 8, animation: "ldcFadeUp .2s ease" }}>
              <textarea
                rows={3}
                value={cookiePasteText}
                onChange={e => setCookiePasteText(e.target.value)}
                placeholder='[{"name":"sessionid","value":"...","domain":".douyin.com"} ...]'
                style={{
                  flex: 1, padding: "8px 11px", borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "linear-gradient(180deg, rgba(24,37,56,.9), rgba(21,33,49,.9))",
                  color: "var(--text-primary)", fontFamily: "monospace", fontSize: 11,
                  minHeight: 60, resize: "vertical", outline: "none",
                }}
              />
              <button onClick={handleUploadCookies} disabled={!cookiePasteText.trim()}
                style={{
                  padding: "0 18px", borderRadius: 8, border: "none",
                  background: "var(--accent)", color: "#fff",
                  cursor: cookiePasteText.trim() ? "pointer" : "not-allowed",
                  fontSize: 12, fontWeight: 600, alignSelf: "flex-end", height: 38,
                }}
              >上传</button>
            </div>
          )}

          {/* Search progress */}
          {searching && <SearchProgress elapsed={searchElapsed} />}

          {/* Search result banner */}
          {searchResult && !searching && (
            <div style={{
              marginTop: 12, padding: "7px 14px", borderRadius: 8,
              display: "inline-flex", alignItems: "center", gap: 8,
              background: searchResult.data_source === "fallback_mock" ? "var(--hype-bg)" : "var(--fact-bg)",
              border: `1px solid ${searchResult.data_source === "fallback_mock" ? "var(--hype-border)" : "var(--fact-border)"}`,
              fontSize: 12, animation: "ldcFadeUp .3s ease",
            }}>
              {searchResult.data_source === "fallback_mock" ? (
                <span style={{ color: "var(--hype)" }}>
                  演示数据 — 点击上方「打开 Chrome 登录」后重新搜索可获取真实直播间
                </span>
              ) : (
                <span style={{ color: "var(--fact)" }}>
                  找到 <b>{searchResult.total}</b> 个「<b>{searchResult.keyword}</b>」直播间
                  {searchResult.search_note && (
                    <span style={{ opacity: .65, marginLeft: 6 }}>{searchResult.search_note}</span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Room Cards Grid */}
        {rooms.length > 0 && (
          <div style={{ animation: "ldcFadeUp .4s ease" }}>
            {/* Toolbar */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 14,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>直播间列表</span>
                <span style={{
                  padding: "2px 10px", borderRadius: 20,
                  background: "var(--accent-soft)",
                  border: "1px solid var(--panel-border)",
                  fontSize: 11, color: "var(--accent)", fontWeight: 600,
                }}>{rooms.length} 个</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>按推荐度排序 · 勾选 2+ 个进行对比</span>
              </div>
              <button
                className="ldc-btn-primary"
                onClick={runCompare}
                disabled={selectedIds.length < 2 || comparing}
                style={{
                  padding: "9px 22px", borderRadius: 8, border: "none",
                  background: selectedIds.length >= 2 ? "var(--accent)" : `${A}.15)`,
                  color: selectedIds.length >= 2 ? "#fff" : "rgba(255,255,255,.3)",
                  cursor: selectedIds.length >= 2 && !comparing ? "pointer" : "not-allowed",
                  fontSize: 13, fontWeight: 700,
                }}
              >
                {comparing ? "分析中…" : "对比分析"}
              </button>
            </div>

            {/* Grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(275px, 1fr))",
              gap: 14,
            }}>
              {rooms.map((room, idx) => (
                <LiveStreamCard
                  key={room.room_id}
                  room={room}
                  rank={idx + 1}
                  total={rooms.length}
                  selected={selectedIds.includes(room.room_id)}
                  onToggle={() => toggleSelect(room.room_id)}
                  onEnter={() => handleEnter(room.room_id)}
                  animDelay={idx * 50}
                />
              ))}
            </div>
          </div>
        )}

        {/* Comparing spinner */}
        {comparing && (
          <div style={{
            background: "linear-gradient(180deg, rgba(18,29,45,.92), rgba(15,24,37,.95))",
            border: "1px solid var(--border)", borderRadius: 12,
            padding: "22px", display: "flex", flexDirection: "column", gap: 14,
            animation: "ldcFadeUp .3s ease",
            boxShadow: "var(--shadow-sm)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: "var(--accent-soft)",
                border: "1px solid var(--panel-border)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  width: 18, height: 18, border: "2.5px solid transparent",
                  borderTopColor: "var(--accent)", borderRadius: "50%",
                  animation: "ldcSpin 1s linear infinite",
                }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>正在对比分析直播间…</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                  评估价格、品质、信任度等维度，通常需要 5~15 秒
                </div>
              </div>
            </div>
            <LoadingDots />
          </div>
        )}

        {/* Comparison Modal */}
        {showModal && comparison && !comparing && (
          <ComparisonModal
            comparison={comparison}
            keyword={query}
            selectedRooms={selectedRooms}
            onClose={() => setShowModal(false)}
          />
        )}

        {/* ── Feature Guide — 仅在未搜索时展示，搜索后自动消失 ── */}
        {!searchResult && !searching && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "32px 24px 24px",
            animation: "ldcFadeUp .45s ease",
          }}>
            {/* Title block */}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                如何使用直播发现
              </div>
              {/* <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                输入商品关键词开始搜索，AI 将为你实时筛选、评分并对比抖音直播间
              </div> */}
            </div>

            {/* Steps row */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 200px))",
              gap: 0,
              width: "100%", maxWidth: 860,
              position: "relative",
            }}>
              {/* Connector line */}
              <div style={{
                position: "absolute",
                top: 22, left: "calc(12.5% + 12px)", right: "calc(12.5% + 12px)",
                height: 1,
                background: `linear-gradient(90deg, ${A}.12), ${A}.22), ${A}.12))`,
                zIndex: 0,
              }} />

              {[
                { step: 1, title: "登录账号",   desc: "扫码授权抖音账号，解锁真实直播数据",                  color: "var(--accent)" },
                { step: 2, title: "搜索关键词", desc: "输入商品名称，Chrome 实时抓取当前直播列表",            color: FACT            },
                { step: 3, title: "AI 对比分析",desc: "勾选 2+ 直播间，获取价格、品质、信任度综合报告",       color: HYPE            },
                { step: 4, title: "进入监测",   desc: "一键切换至实时话术监测，FACT / HYPE / TRAP 实时标注", color: "var(--accent)"  },
              ].map(({ step, title, desc, color }) => (
                <div key={step} style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  padding: "0 14px", position: "relative", zIndex: 1,
                }}>
                  {/* Circle */}
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, fontWeight: 800, color: "#fff",
                    background: `linear-gradient(135deg, ${color}, ${color === "var(--accent)" ? A + ".7)" : color + "aa"})`,
                    boxShadow: `0 4px 16px ${color === "var(--accent)" ? A + ".25)" : color + "33"}`,
                    marginBottom: 12,
                    border: `2px solid ${color === "var(--accent)" ? A + ".35)" : color + "44"}`,
                  }}>
                    {step}
                  </div>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: "var(--text-primary)",
                    marginBottom: 6, textAlign: "center",
                  }}>{title}</div>
                  <div style={{
                    fontSize: 11, color: "var(--text-muted)", lineHeight: 1.65,
                    textAlign: "center",
                  }}>{desc}</div>
                </div>
              ))}
            </div>

            {/* Feature pills */}
            <div style={{
              display: "flex", gap: 10, marginTop: 28, flexWrap: "wrap", justifyContent: "center",
            }}>
              {[
                { icon: "◎", label: "Chrome CDP 真实抓取" },
                { icon: "▦", label: "AI 多维对比评分"      },
                { icon: "⚑", label: "实时话术风险识别"      },
                { icon: "◷", label: "历史会话回放"          },
              ].map(({ icon, label }) => (
                <div key={label} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 14px", borderRadius: 20,
                  background: "rgba(63,140,255,.07)",
                  border: "1px solid rgba(63,140,255,.16)",
                  fontSize: 11, color: "var(--text-secondary)",
                }}>
                  <span style={{ color: "var(--accent)", fontSize: 12 }}>{icon}</span>
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </>
  );
}

/* ================================================================
   LiveStreamCard
   ================================================================ */
function LiveStreamCard({ room, rank, total, selected, onToggle, onEnter, animDelay = 0 }) {
  const isTopThree = rank <= 3;
  const rankColors = ["var(--accent)", FACT, HYPE];
  const rankBorder = isTopThree ? rankColors[rank - 1] : "rgba(255,255,255,.25)";

  return (
    <div
      className="ldc-card"
      style={{
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 12, overflow: "hidden",
        background: selected
          ? `linear-gradient(180deg, ${A}.06), ${A}.03))`
          : "linear-gradient(180deg, rgba(18,29,45,.92), rgba(15,24,37,.95))",
        display: "flex", flexDirection: "column",
        boxShadow: selected ? `0 0 0 1px ${A}.2)` : "var(--shadow-sm)",
        animation: `ldcFadeUp .4s ease ${animDelay}ms both`,
      }}
    >
      {/* Thumbnail */}
      <div style={{ position: "relative", height: 148, background: "var(--bg-tertiary)", flexShrink: 0, overflow: "hidden" }}>
        {room.thumbnail_url ? (
          <img
            src={room.thumbnail_url}
            alt={room.room_title}
            className="ldc-thumb"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => { e.target.style.display = "none"; }}
          />
        ) : (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", color: "var(--text-muted)", fontSize: 13, opacity: .5,
          }}>暂无封面</div>
        )}
        {/* Dark gradient overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,.55) 100%)",
        }} />

        {/* Rank badge */}
        <div style={{
          position: "absolute", top: 9, left: 9,
          width: 26, height: 26, borderRadius: 8,
          background: isTopThree ? rankBorder : "rgba(0,0,0,.55)",
          color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 800,
          backdropFilter: "blur(6px)",
          boxShadow: isTopThree ? `0 2px 8px ${rankBorder}55` : "none",
        }}>
          {rank}
        </div>

        {/* Live indicator */}
        <div style={{
          position: "absolute", bottom: 9, right: 9,
          display: "flex", alignItems: "center", gap: 5,
          background: "rgba(227,91,91,.2)", color: "#fca5a5",
          border: "1px solid rgba(227,91,91,.3)",
          borderRadius: 20, padding: "2px 9px",
          fontSize: 10, fontWeight: 600, backdropFilter: "blur(6px)",
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%", background: TRAP,
            animation: "ldcLive 1.5s ease-in-out infinite",
          }} />
          直播中
        </div>

        {/* Viewer count */}
        {room.viewer_count > 0 && (
          <div style={{
            position: "absolute", bottom: 9, left: 9,
            background: "rgba(0,0,0,.5)", color: "var(--text-secondary)",
            borderRadius: 20, padding: "2px 9px",
            fontSize: 10, fontWeight: 500, backdropFilter: "blur(6px)",
          }}>
            {fmtViewers(room.viewer_count)} 观看
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "14px 15px", flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
        {/* Title */}
        <div style={{
          fontSize: 13, fontWeight: 700, lineHeight: 1.45, color: "var(--text-primary)",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {room.room_title || room.title || "直播中"}
        </div>

        {/* Anchor */}
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {room.anchor_name || room.streamer_name || "主播"}
        </div>

        {/* Ranking reason */}
        {room.reason && (
          <div style={{
            fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6,
            marginTop: 2, padding: "7px 10px", borderRadius: 8,
            background: "rgba(255,255,255,.025)",
            borderLeft: `2px solid ${isTopThree ? rankBorder : "var(--border)"}`,
          }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 3 }}>
              排序依据
            </span>
            <span style={{
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>
              {room.reason}
            </span>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 7, marginTop: "auto", paddingTop: 10 }}>
          <button
            className="ldc-btn-primary"
            onClick={onEnter}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 8, border: "none",
              background: "var(--accent)", color: "#fff",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            进入直播间
          </button>
          <button
            onClick={onToggle}
            style={{
              padding: "9px 12px", borderRadius: 8,
              border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
              background: selected ? "var(--accent-soft)" : "transparent",
              color: selected ? "var(--accent)" : "var(--text-muted)",
              fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
              transition: "all .15s",
              fontWeight: selected ? 600 : 400,
            }}
          >
            {selected ? "已选" : "对比"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   ComparisonModal — full-screen overlay
   ================================================================ */
function ComparisonModal({ comparison, keyword, selectedRooms, onClose }) {
  const { p0, p1, p2, engine, evidence_stats } = comparison || {};

  const VERDICT = {
    BUY:  { c: FACT, bg: "var(--fact-bg)", bd: "var(--fact-border)", t: "综合推荐购买" },
    WAIT: { c: HYPE, bg: "var(--hype-bg)", bd: "var(--hype-border)", t: "建议先观望"   },
    SKIP: { c: TRAP, bg: "var(--trap-bg)", bd: "var(--trap-border)", t: "不建议购买"   },
  };
  const vm = VERDICT[p0?.verdict || "WAIT"] || VERDICT.WAIT;
  const engineLabel = engine === "llm" ? "AI 分析" : "规则引擎";

  const overlayRef = useRef(null);
  const onOverlayClick = useCallback(e => {
    if (e.target === overlayRef.current) onClose();
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="ldc-modal-overlay"
      onClick={onOverlayClick}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(4,8,16,.78)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "40px 24px",
        overflowY: "auto",
      }}
    >
      <div
        className="ldc-modal-body"
        style={{
          width: "100%", maxWidth: 920,
          background: "linear-gradient(180deg, rgba(18,29,45,.97), rgba(12,20,32,.98))",
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "0 32px 80px rgba(0,0,0,.55)",
          overflow: "hidden",
        }}
      >
        {/* Modal header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 22px",
          borderBottom: "1px solid var(--border)",
          background: "rgba(255,255,255,.015)",
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>跨直播间对比分析</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
              关键词：{keyword} · {engineLabel}
              {evidence_stats && (
                <span style={{ marginLeft: 10 }}>
                  话术 {evidence_stats.utterance_count ?? 0} 条 · 弹幕 {evidence_stats.chat_count ?? 0} 条
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)",
            background: "transparent", color: "var(--text-muted)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, lineHeight: 1, transition: "all .15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,.06)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >&times;</button>
        </div>

        {/* Modal body */}
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* P0 Verdict */}
          {p0 && (
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr", gap: 12 }}>
              <div style={{
                border: `1.5px solid ${vm.bd}`, borderRadius: 12, padding: "16px",
                background: vm.bg, display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600 }}>
                  综合结论
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: vm.c, lineHeight: 1.3 }}>
                  {vm.t}
                </div>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 11px", borderRadius: 20,
                  background: `${vm.c}18`, border: `1px solid ${vm.c}35`,
                  fontSize: 11, color: vm.c, fontWeight: 700, width: "fit-content",
                }}>
                  置信度 {Math.round((p0.confidence || 0.5) * 100)}%
                </div>
              </div>
              <BulletBox title="推荐理由" items={p0.why_buy || []} accentColor={FACT} />
              <BulletBox title="谨慎因素" items={p0.why_not_buy || []} accentColor={TRAP} />
            </div>
          )}
          {!p0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              未收到结构化分析结果，请检查后端日志
            </div>
          )}

          {/* P1 Comparison Table */}
          {p1?.compare_dimensions?.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text-primary)" }}>
                直播间维度对比
              </div>
              <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--accent-soft)" }}>
                      <th style={TH}>直播间</th>
                      {p1.compare_dimensions.map(d => <th key={d} style={TH}>{d}</th>)}
                      <th style={TH}>综合分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(p1.products || []).map((p, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.02)" }}>
                        <td style={TD}><span style={{ fontWeight: 600 }}>{p.name}</span></td>
                        {p1.compare_dimensions.map(d => (
                          <td key={d} style={TD}><ScoreBar value={p.scores?.[d]} /></td>
                        ))}
                        <td style={TD}><ScoreBar value={p.overall} bold /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Ranked order */}
              {p1.ranked?.length > 0 && (
                <div style={{
                  marginTop: 10, padding: "10px 14px",
                  background: "var(--accent-soft)", borderRadius: 10,
                  border: "1px solid var(--panel-border)",
                }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>推荐顺序</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {p1.ranked.map((name, i) => (
                      <div key={i} style={{
                        padding: "3px 13px", borderRadius: 20, fontSize: 12,
                        background: i === 0 ? "var(--fact-bg)" : "rgba(255,255,255,.04)",
                        border: `1px solid ${i === 0 ? "var(--fact-border)" : "rgba(255,255,255,.08)"}`,
                        color: i === 0 ? "var(--fact)" : "var(--text-secondary)",
                        fontWeight: i === 0 ? 700 : 400,
                      }}>
                        {i + 1}. {name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* P2 Actions */}
          {p2 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
              <BulletBox title="问主播的关键问题" items={p2.ask_anchor_questions || []} accentColor="var(--accent)" />
              <BulletBox title="替代方案" items={p2.alternatives || []} accentColor="#38bdf8" />
              {p2.buy_timing && (
                <div style={{
                  border: "1px solid var(--hype-border)", borderRadius: 10,
                  padding: "12px 15px", background: "var(--hype-bg)",
                }}>
                  <div style={{ fontSize: 11, color: "var(--hype)", marginBottom: 7, fontWeight: 700 }}>最佳下单时机</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>{p2.buy_timing}</div>
                </div>
              )}
              <BulletBox title="行动计划" items={p2.action_plan || []} accentColor={FACT} />
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div style={{
          padding: "14px 22px",
          borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "flex-end",
          background: "rgba(255,255,255,.01)",
        }}>
          <button onClick={onClose} className="ldc-btn-primary" style={{
            padding: "9px 28px", borderRadius: 8, border: "none",
            background: "var(--accent)", color: "#fff",
            cursor: "pointer", fontSize: 13, fontWeight: 700,
          }}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   SearchProgress
   ================================================================ */
const SEARCH_STAGES = [
  { label: "启动真实 Chrome 浏览器",   start: 0,  end: 5  },
  { label: "打开抖音直播搜索页面",      start: 5,  end: 15 },
  { label: "截获直播间 API 数据",       start: 15, end: 28 },
  { label: "AI 评估直播间质量",         start: 28, end: 38 },
  { label: "整理并排序结果",            start: 38, end: 45 },
];
const SEARCH_TOTAL = 45;

function SearchProgress({ elapsed = 0 }) {
  const pct = Math.min(95, Math.round((elapsed / SEARCH_TOTAL) * 100));
  const activeIdx = SEARCH_STAGES.findIndex(s => elapsed >= s.start && elapsed < s.end);
  const current = activeIdx >= 0 ? activeIdx : SEARCH_STAGES.length - 1;
  const remain = Math.max(0, Math.round(SEARCH_TOTAL - elapsed));

  return (
    <div style={{
      marginTop: 15, padding: "16px 18px",
      background: "rgba(255,255,255,.025)", border: "1px solid var(--border)",
      borderRadius: 10, animation: "ldcFadeUp .3s ease",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }}>
        <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 9, color: "var(--text-primary)" }}>
          <div style={{
            width: 16, height: 16, border: "2px solid transparent",
            borderTopColor: "var(--accent)", borderRadius: "50%",
            animation: "ldcSpin 1s linear infinite",
          }} />
          正在抓取抖音直播间数据
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            padding: "2px 10px", borderRadius: 20,
            background: "var(--accent-soft)", border: "1px solid var(--panel-border)",
            fontSize: 11, color: "var(--accent)",
          }}>{Math.floor(elapsed)}s</span>
          {remain > 0 && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>~{remain}s</span>}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: "rgba(255,255,255,.06)", borderRadius: 2, marginBottom: 15, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: 2,
          background: "var(--accent)",
          transition: "width .3s ease",
          boxShadow: `0 0 10px ${A}.5)`,
        }} />
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {SEARCH_STAGES.map((stage, i) => {
          const done    = elapsed >= stage.end;
          const active  = i === current && !done;
          const pending = i > current;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              opacity: pending ? .28 : 1, transition: "opacity .35s",
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700,
                background: done ? "var(--fact-bg)" : active ? "var(--accent-soft)" : "rgba(255,255,255,.04)",
                border: `1.5px solid ${done ? "var(--fact)" : active ? "var(--accent)" : "rgba(255,255,255,.1)"}`,
                boxShadow: active ? `0 0 8px ${A}.4)` : "none",
                color: done ? "var(--fact)" : active ? "var(--accent)" : "var(--text-muted)",
                transition: "all .3s",
              }}>
                {done ? <CheckSVG size={10} /> : active ? <span style={{ animation: "ldcPulse 1s ease-in-out infinite" }}>&#9679;</span> : (i + 1)}
              </div>
              <span style={{
                fontSize: 12, flex: 1,
                color: done ? "var(--fact)" : active ? "var(--text-primary)" : "var(--text-muted)",
                fontWeight: active ? 700 : 400,
              }}>{stage.label}</span>
              {active && <span style={{ fontSize: 10, color: "var(--accent)" }}>进行中</span>}
              {done && <span style={{ fontSize: 10, color: "var(--fact)" }}>完成</span>}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 11, fontSize: 10, color: "var(--text-muted)", opacity: .55 }}>
        使用真实 Chrome + CDP 抓取，绕过机器人检测 · 缓存命中时仅需 1~2 秒
      </div>
    </div>
  );
}

/* -- CheckSVG -- */
function CheckSVG({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* -- LoadingDots -- */
function LoadingDots() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {[0,1,2,3,4,5,6,7].map(i => (
        <div key={i} style={{
          width: i % 2 === 0 ? 7 : 4, height: i % 2 === 0 ? 7 : 4,
          borderRadius: "50%",
          background: "var(--accent)",
          opacity: .5,
          animation: `ldcDot 1.3s ease-in-out ${i * 0.12}s infinite`,
        }} />
      ))}
    </div>
  );
}

/* -- BulletBox -- */
function BulletBox({ title, items = [], accentColor = "var(--accent)" }) {
  return (
    <div style={{
      border: `1px solid ${accentColor}28`,
      borderRadius: 10, padding: "13px 15px",
      background: `${accentColor}08`,
    }}>
      <div style={{ fontSize: 11, color: accentColor, marginBottom: 9, fontWeight: 700, letterSpacing: 0.3 }}>
        {title}
      </div>
      {!items.length && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>&mdash;</div>}
      {items.slice(0, 6).map((x, i) => (
        <div key={i} style={{
          fontSize: 12, color: "var(--text-secondary)", marginBottom: 6,
          lineHeight: 1.55, display: "flex", gap: 7,
        }}>
          <span style={{ color: accentColor, flexShrink: 0, marginTop: 1, fontWeight: 700 }}>&rsaquo;</span>
          <span>{x}</span>
        </div>
      ))}
    </div>
  );
}

/* -- ScoreBar -- */
function ScoreBar({ value, bold = false }) {
  const n = Number(value);
  const pct = Number.isFinite(n) ? Math.round(Math.max(0, Math.min(1, n)) * 100) : null;
  if (pct === null) return <span style={{ color: "var(--text-muted)", fontSize: 11 }}>&mdash;</span>;
  const c = pct >= 70 ? FACT : pct >= 45 ? HYPE : TRAP;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,.07)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: `linear-gradient(90deg, ${c}80, ${c})`,
          borderRadius: 2,
        }} />
      </div>
      <span style={{ fontSize: 11, color: c, fontWeight: bold ? 700 : 400, minWidth: 28, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

/* -- Helpers -- */
function fmtViewers(n) {
  if (!n) return "直播中";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

const TH = {
  textAlign: "left", fontSize: 11, color: "var(--text-muted)",
  padding: "9px 13px", borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap", fontWeight: 600, letterSpacing: .2,
  textTransform: "uppercase",
};

const TD = {
  fontSize: 12, color: "var(--text-secondary)",
  padding: "9px 13px", borderBottom: "1px solid rgba(255,255,255,.04)",
};
