import { useMemo, useState, useEffect, useRef, useCallback } from "react";

/* -- Theme tokens (consistent with App.css / index.css) -- */
const A    = "rgba(63,140,255,";   // accent base
const FACT = "#2fb47a";
const HYPE = "#d79b30";
const HYPE_TEXT = "#111";
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
 * LiveDiscoverPage 鈥?鎶栭煶鐩存挱闂村彂鐜?+ 瀵规瘮鍒嗘瀽
 */
export default function LiveDiscoverPage({
  apiBase = "http://localhost:8012",
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
        setError(data.message || "鐧诲綍澶辫触锛岃閲嶈瘯");
      }
    } catch (e) {
      setError(e?.message || "璇锋眰澶辫触");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUploadCookies = async () => {
    setError("");
    try {
      const cookies = JSON.parse(cookiePasteText.trim());
      if (!Array.isArray(cookies) || cookies.length === 0) {
        setError("Cookie 鏍煎紡閿欒锛氬繀椤讳负闈炵┖ JSON 鏁扮粍");
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
        setError(data?.detail || "涓婁紶澶辫触");
      }
    } catch (e) {
      setError("JSON 瑙ｆ瀽閿欒锛? + (e?.message || "鏍煎紡鏃犳晥"));
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
    if (!kw) { setError("璇峰厛杈撳叆鍟嗗搧鍏抽敭璇嶏紝渚嬪锛氳摑鑾撱€佽泲鐧界矇銆佸彛绾?); return; }
    setError(""); setResult(null); setSelected([]); setComparison(null); setShowModal(false);
    setSearching(true);
    try {
      const res = await fetch(
        `${apiBase}/consumer/search-live-streams?q=${encodeURIComponent(kw)}&max_results=12`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "鎼滅储澶辫触");
      setResult(data);
      setSelected((data.rooms || []).slice(0, 3).map(r => r.room_id));
    } catch (e) {
      setError(e?.message || "鎼滅储澶辫触");
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
    if (selectedRooms.length < 2) { setError("璇疯嚦灏戝嬀閫?2 涓洿鎾棿杩涜瀵规瘮"); return; }
    setError(""); setComparing(true); setComparison(null);
    try {
      // 浼犲叆褰撳墠宸茬洃鍚埌鐨勮瘽鏈笌寮瑰箷浣滀负鍒嗘瀽璇佹嵁
      const us = utterances.slice(0, 60).map(u => ({ text: u.text, type: u.type, score: u.score }));
      const cs = chatMessages.slice(0, 100).map(c => ({ text: c.text, intent: c.intent, sentiment: c.sentiment }));
      const res = await fetch(`${apiBase}/consumer/compare-streams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: query.trim(),
          rooms: selectedRooms,
          user_profile: {},
          stream_context: { utterances: us, chats: cs },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "瀵规瘮澶辫触");
      setComparison(data);
      setShowModal(true);
    } catch (e) {
      setError(e?.message || "瀵规瘮澶辫触");
    } finally {
      setComparing(false);
    }
  };

  const toggleSelect = id =>
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

  const handleEnter = room => {
    const roomId = room?.room_id || room;
    if (typeof onConnectRoom === "function") {
      onConnectRoom(room);
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
    ok:   { color: FACT, label: `宸茬櫥褰?路 ${cookieStatus?.profile_size_mb || 0}MB 路 ${cookieStatus?.count || 0} cookies` },
    warn: { color: HYPE, label: `浠?Cookie (${cookieStatus?.count || 0} 鏉? 路 寤鸿閲嶆柊鐧诲綍` },
    none: { color: TRAP, label: "鏈櫥褰?路 寤鸿鍏堢櫥褰曚互鑾峰彇鐪熷疄鏁版嵁" },
  }; 
  const authMeta = AUTH_META[authState];
  const authTextColor = authState === "warn" ? HYPE_TEXT : authMeta.color;

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

        {/* Page Title 鈥?same classes as 瀹炴椂鎬昏 */}
        <div className="sg-dashboard-head">
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <div className="sg-dashboard-title">鐩存挱鍙戠幇</div>
            {/* {searchResult && !searching && (
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                鍏?{searchResult.total} 涓洿鎾棿
                {searchResult.data_source !== "fallback_mock" && (
                  <span style={{ color: FACT, marginLeft: 8 }}>瀹炴椂鏁版嵁</span>
                )}
              </span>
            )} */}
          </div>
          {selectedIds.length > 0 && (
            <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
              宸查€?{selectedIds.length} 涓?
            </span>
          )}
        </div>

        {/* Search Panel 鈥?sg-ops-card style */}
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
                placeholder="杈撳叆鍟嗗搧鍏抽敭璇嶏紝濡傦細钃濊帗銆佽泲鐧界矇銆佸効绔ラ槻鏅掗湝鈥?
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
                color: "#black", 
                cursor: searching ? "not-allowed" : "pointer",
                fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                minHeight: 40,
              }}
            >
              {searching ? "鎼滅储涓€? : "鎼滅储"}
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
                fontSize: 11, color: authTextColor, flexShrink: 0,
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
                {authLoading ? "Chrome 宸叉墦寮€锛岃鐧诲綍鍚庡叧闂€? : authState === "ok" ? "鍒锋柊鐧诲綍" : "鎵撳紑 Chrome 鐧诲綍"}
              </button>
              <button onClick={() => setShowCookiePaste(v => !v)}
                style={{
                  padding: "5px 12px", borderRadius: 20,
                  border: "1px solid rgba(255,255,255,.08)", background: "transparent",
                  color: "var(--text-muted)", cursor: "pointer", fontSize: 11,
                }}
              >
                {showCookiePaste ? "鍙栨秷" : "绮樿创 Cookie"}
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
              >涓婁紶</button>
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
                <span style={{ color: HYPE_TEXT }}>
                  婕旂ず鏁版嵁 鈥?鐐瑰嚮涓婃柟銆屾墦寮€ Chrome 鐧诲綍銆嶅悗閲嶆柊鎼滅储鍙幏鍙栫湡瀹炵洿鎾棿
                </span>
              ) : (
                <span style={{ color: "var(--fact)" }}>
                  鎵惧埌 <b>{searchResult.total}</b> 涓€?b>{searchResult.keyword}</b>銆嶇洿鎾棿
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
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>鐩存挱闂村垪琛?/span>
                <span style={{
                  padding: "2px 10px", borderRadius: 20,
                  background: "var(--accent-soft)",
                  border: "1px solid var(--panel-border)",
                  fontSize: 11, color: "var(--accent)", fontWeight: 600,
                }}>{rooms.length} 涓?/span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>鎸夋帹鑽愬害鎺掑簭 路 鍕鹃€?2+ 涓繘琛屽姣?/span>
              </div>
              <button
                className="ldc-btn-primary"
                onClick={runCompare}
                disabled={selectedIds.length < 2 || comparing}
                style={{
                  padding: "9px 22px", borderRadius: 8, border: "none",
                  background: selectedIds.length >= 2 ? "var(--accent)" : `${A}.15)`,
                  color: selectedIds.length >= 2 ? "#black" : "rgba(255,255,255,.3)",
                  cursor: selectedIds.length >= 2 && !comparing ? "pointer" : "not-allowed",
                  fontSize: 13, fontWeight: 700,
                }}
              >
                {comparing ? "鍒嗘瀽涓€? : "瀵规瘮鍒嗘瀽"}
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
                  onEnter={() => handleEnter(room)}
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
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>姝ｅ湪瀵规瘮鍒嗘瀽鐩存挱闂粹€?/div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                  璇勪及浠锋牸銆佸搧璐ㄣ€佷俊浠诲害绛夌淮搴︼紝閫氬父闇€瑕?5~15 绉?
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

        {/* 鈹€鈹€ Feature Guide 鈥?浠呭湪鏈悳绱㈡椂灞曠ず锛屾悳绱㈠悗鑷姩娑堝け 鈹€鈹€ */}
        {!searchResult && !searching && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "32px 24px 24px",
            animation: "ldcFadeUp .45s ease",
          }}>
            {/* Title block */}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                濡備綍浣跨敤鐩存挱鍙戠幇
              </div>
              {/* <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                杈撳叆鍟嗗搧鍏抽敭璇嶅紑濮嬫悳绱紝AI 灏嗕负浣犲疄鏃剁瓫閫夈€佽瘎鍒嗗苟瀵规瘮鎶栭煶鐩存挱闂?
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
                { step: 1, title: "鐧诲綍璐﹀彿",   desc: "鎵爜鎺堟潈鎶栭煶璐﹀彿锛岃В閿佺湡瀹炵洿鎾暟鎹?,                  color: "var(--accent)" },
                { step: 2, title: "鎼滅储鍏抽敭璇?, desc: "杈撳叆鍟嗗搧鍚嶇О锛孋hrome 瀹炴椂鎶撳彇褰撳墠鐩存挱鍒楄〃",            color: FACT            },
                { step: 3, title: "AI 瀵规瘮鍒嗘瀽",desc: "鍕鹃€?2+ 鐩存挱闂达紝鑾峰彇浠锋牸銆佸搧璐ㄣ€佷俊浠诲害缁煎悎鎶ュ憡",       color: HYPE            },
                { step: 4, title: "杩涘叆鐩戞祴",   desc: "涓€閿垏鎹㈣嚦瀹炴椂璇濇湳鐩戞祴锛孎ACT / HYPE / TRAP 瀹炴椂鏍囨敞", color: "var(--accent)"  },
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
                { icon: "鈼?, label: "Chrome CDP 鐪熷疄鎶撳彇" },
                { icon: "鈻?, label: "AI 澶氱淮瀵规瘮璇勫垎"      },
                { icon: "鈿?, label: "瀹炴椂璇濇湳椋庨櫓璇嗗埆"      },
                { icon: "鈼?, label: "鍘嗗彶浼氳瘽鍥炴斁"          },
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
          }}>鏆傛棤灏侀潰</div>
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
          鐩存挱涓?
        </div>

        {/* Viewer count 鈥?always show; use fmtViewers for formatting */}
        <div style={{
          position: "absolute", bottom: 9, left: 9,
          background: "rgba(0,0,0,.5)", color: "var(--text-secondary)",
          borderRadius: 20, padding: "2px 9px",
          fontSize: 10, fontWeight: 500, backdropFilter: "blur(6px)",
        }}>
          {room.viewer_count > 0 ? `${fmtViewers(room.viewer_count)} 瑙傜湅` : "鐑挱涓?}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: "14px 15px", flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
        {/* Title */}
        <div style={{
          fontSize: 13, fontWeight: 700, lineHeight: 1.45, color: "var(--text-primary)",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {room.room_title || room.title || "鐩存挱涓?}
        </div>

        {/* Anchor */}
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {room.anchor_name || room.streamer_name || "涓绘挱"}
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
              鎺掑簭渚濇嵁
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
              background: "var(--accent)", color: "#black",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            杩涘叆鐩存挱闂?
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
            {selected ? "宸查€? : "瀵规瘮"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   ComparisonModal 鈥?full-screen overlay
   ================================================================ */
function ComparisonModal({ comparison, keyword, selectedRooms, onClose }) {
  const { p0, p1, p2, engine, evidence_stats } = comparison || {};

  const VERDICT = {
    BUY:  { c: FACT, bg: "var(--fact-bg)", bd: "var(--fact-border)", t: "缁煎悎鎺ㄨ崘璐拱" },
    WAIT: { c: HYPE, bg: "var(--hype-bg)", bd: "var(--hype-border)", t: "寤鸿鍏堣鏈?   },
    SKIP: { c: TRAP, bg: "var(--trap-bg)", bd: "var(--trap-border)", t: "涓嶅缓璁喘涔?   },
  };
  const vm = VERDICT[p0?.verdict || "WAIT"] || VERDICT.WAIT;
  const isWait = (p0?.verdict || "WAIT") === "WAIT";
  const engineLabel = engine === "llm" ? "AI 鍒嗘瀽" : "瑙勫垯寮曟搸";

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
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>璺ㄧ洿鎾棿瀵规瘮鍒嗘瀽</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
              鍏抽敭璇嶏細{keyword} 路 {engineLabel}
              {evidence_stats && (evidence_stats.utterance_count > 0 || evidence_stats.chat_count > 0) ? (
                <span style={{ marginLeft: 10, color: FACT }}>
                  鉁?璇濇湳 {evidence_stats.utterance_count} 鏉?路 寮瑰箷 {evidence_stats.chat_count} 鏉″凡绾冲叆鍒嗘瀽
                </span>
              ) : (
                <span style={{ marginLeft: 10, color: "var(--text-muted)" }}>
                  鍩轰簬鐩存挱闂存爣棰樹笌鎺ㄨ崘鍒嗗垎鏋愶紙鍙厛寮€鍚洃鎺у啀瀵规瘮浠ヨ幏寰楁洿绮惧噯缁撴灉锛?
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
                <div style={{ fontSize: 10, color: isWait ? HYPE_TEXT : "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600 }}>
                  缁煎悎缁撹
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: isWait ? HYPE_TEXT : vm.c, lineHeight: 1.3 }}>
                  {vm.t}
                </div>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 11px", borderRadius: 20,
                  background: `${vm.c}18`, border: `1px solid ${vm.c}35`,
                  fontSize: 11, color: isWait ? HYPE_TEXT : vm.c, fontWeight: 700, width: "fit-content",
                }}>
                  缃俊搴?{Math.round((p0.confidence || 0.5) * 100)}%
                </div>
              </div>
              <BulletBox title="鎺ㄨ崘鐞嗙敱" items={p0.why_buy || []} accentColor={FACT} />
              <BulletBox title="璋ㄦ厧鍥犵礌" items={p0.why_not_buy || []} accentColor={TRAP} />
            </div>
          )}
          {!p0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              鏈敹鍒扮粨鏋勫寲鍒嗘瀽缁撴灉锛岃妫€鏌ュ悗绔棩蹇?
            </div>
          )}

          {/* P1 Comparison Table */}
          {p1?.compare_dimensions?.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text-primary)" }}>
                鐩存挱闂寸淮搴﹀姣?
              </div>
              <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--accent-soft)" }}>
                      <th style={TH}>鐩存挱闂?/th>
                      {p1.compare_dimensions.map(d => <th key={d} style={TH}>{d}</th>)}
                      <th style={TH}>缁煎悎鍒?/th>
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
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>鎺ㄨ崘椤哄簭</div>
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
              <BulletBox title="闂富鎾殑鍏抽敭闂" items={p2.ask_anchor_questions || []} accentColor="var(--accent)" />
              <BulletBox title="鏇夸唬鏂规" items={p2.alternatives || []} accentColor="#38bdf8" />
              {p2.buy_timing && (
                <div style={{
                  border: "1px solid var(--hype-border)", borderRadius: 10,
                  padding: "12px 15px", background: "var(--hype-bg)",
                }}>
                  <div style={{ fontSize: 11, color: HYPE_TEXT, marginBottom: 7, fontWeight: 700 }}>鏈€浣充笅鍗曟椂鏈?/div>
                  <div style={{ fontSize: 12, color: HYPE_TEXT, lineHeight: 1.7 }}>{p2.buy_timing}</div>
                </div>
              )}
              <BulletBox title="琛屽姩璁″垝" items={p2.action_plan || []} accentColor={FACT} />
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
            background: "var(--accent)", color: "#black",
            cursor: "pointer", fontSize: 13, fontWeight: 700,
          }}>
            鍏抽棴
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
  { label: "鍚姩鐪熷疄 Chrome 娴忚鍣?,   start: 0,  end: 5  },
  { label: "鎵撳紑鎶栭煶鐩存挱鎼滅储椤甸潰",      start: 5,  end: 15 },
  { label: "鎴幏鐩存挱闂?API 鏁版嵁",       start: 15, end: 28 },
  { label: "AI 璇勪及鐩存挱闂磋川閲?,         start: 28, end: 38 },
  { label: "鏁寸悊骞舵帓搴忕粨鏋?,            start: 38, end: 45 },
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
          姝ｅ湪鎶撳彇鎶栭煶鐩存挱闂存暟鎹?
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
              {active && <span style={{ fontSize: 10, color: "var(--accent)" }}>杩涜涓?/span>}
              {done && <span style={{ fontSize: 10, color: "var(--fact)" }}>瀹屾垚</span>}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 11, fontSize: 10, color: "var(--text-muted)", opacity: .55 }}>
        浣跨敤鐪熷疄 Chrome + CDP 鎶撳彇锛岀粫杩囨満鍣ㄤ汉妫€娴?路 缂撳瓨鍛戒腑鏃朵粎闇€ 1~2 绉?
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
  if (!n) return "鐩存挱涓?;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}涓嘸;
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

