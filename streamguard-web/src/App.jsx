import { useRef, useCallback, useState, useMemo, useEffect } from "react";
import "./App.css";
import { useSimulatedStream } from "./hooks/useSimulatedStream";
import { useRealStream } from "./hooks/useRealStream";
import Header, { NAV_TABS } from "./components/Header";
import VideoPlayer from "./components/VideoPlayer";
import LiveStreamPanel from "./components/LiveStreamPanel";
import SemanticFeed from "./components/SemanticFeed";
import RationalityGauge from "./components/RationalityGauge";
import RiskRadar from "./components/RiskRadar";
import TopologyGraph from "./components/TopologyGraph";
import AlertBanner from "./components/AlertBanner";
import RationalityGate from "./components/RationalityGate";
import DataSourceSelector from "./components/DataSourceSelector";
import CommandCenter from "./components/CommandCenter";
import SessionReportModal from "./components/SessionReportModal";
import SwitchRoomModal from "./components/SwitchRoomModal";
import HistoryPage from "./pages/HistoryPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import RulesPage from "./pages/RulesPage";
import ConsumerAdvisorPage from "./pages/ConsumerAdvisorPage";
import LiveDiscoverPage from "./pages/LiveDiscoverPage";
import WelcomePage from "./pages/WelcomePage";
import { buildHistoryEntry, saveSession } from "./utils/historyStorage";

export default function App() {
  const [dataSource, setDataSource] = useState(null);
  const [sourceConfig, setSourceConfig] = useState({});
  const [page, setPage] = useState("dashboard");
  const [dashboardSection, setDashboardSection] = useState("ops");
  const [entryStep, setEntryStep] = useState("welcome");
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  // 蝥???詨?嗆?
  const [sessionSnapshot, setSessionSnapshot] = useState(null); // ??null ????????
  const [showReportModal, setShowReportModal] = useState(false);
  const sessionStartRef = useRef(null); // ????????????
  const endingRef = useRef(false);
  const feedRef = useRef(null);
  // ??湔?渡＆霈文撕蝒?
  const [pendingRoomId, setPendingRoomId] = useState(null); // 撘寧?銝剜蝷箇
  const pendingRoomIdRef = useRef(null);                    // handleReportClose 霂餃???

  const simulated = useSimulatedStream();
  const realStream = useRealStream({
    mode: dataSource === "douyin" ? "douyin" : "mock",
    roomId: sourceConfig.roomId,
    wsBase: sourceConfig.wsBase || "ws://localhost:8011",
    enabled: dataSource === "douyin",
  });

  // 需啣?擐活餈?園嚗鈭??輯恣蝞?
  const isConnected = realStream.connected;
  if (isConnected && !sessionStartRef.current) {
    sessionStartRef.current = Date.now();
  }

  const streamData = useMemo(() => {
    if (!dataSource) return null;
    if (dataSource === "mock") return simulated;
    // Real data source should expose real connection state directly.
    // Do not silently fall back to mock, otherwise connection issues are hidden.
    return realStream;
  }, [dataSource, simulated, realStream]);

  const {
    utterances = [], chatMessages = [], rationalityIndex = 0,
    riskData = [], alerts = [], viewerCount = 0,
    showGate = false, setShowGate = () => {},
    isPaused = false, setIsPaused = () => {},
    reset = () => {}, exportReport = () => {},
    sessionStats = {},
    messageTotals = { utterances: 0, chats: 0, total: 0 },
    recentLimits = { utterances: 0, chats: 0 },
  } = streamData || {};

  const apiBase = (sourceConfig.wsBase || "ws://localhost:8011").replace(/^ws/i, "http");

  useEffect(() => {
    if (!sessionSnapshot) {
      setShowReportModal(false);
      endingRef.current = false;
      return;
    }
    const timer = setTimeout(() => setShowReportModal(true), 100);
    return () => clearTimeout(timer);
  }, [sessionSnapshot]);


  /** ?孵"蝏??"嚗蝏翰?????剖?餈 ??撘孵?亙? */
  const handleEndSession = useCallback(() => {
    if (endingRef.current) return;
    endingRef.current = true;

    const snap = {
      utterances: [...utterances],
      chatMessages: [...chatMessages],
      stats: { ...sessionStats },
      rationalityIndex,
      riskData: [...riskData],
      roomId: sourceConfig.roomId || null,
      startTime: sessionStartRef.current,
      endTime: Date.now(),
      viewerCount,
    };

    try {
      const entry = buildHistoryEntry(snap, viewerCount || 0);
      saveSession(entry, snap, apiBase);
      console.log("[history] session saved:", entry.id);
    } catch (e) {
      console.error("[history] save failed:", e);
    }

    setSessionSnapshot(snap);
    realStream.disconnect?.();
  }, [utterances, chatMessages, sessionStats, rationalityIndex, riskData, sourceConfig.roomId, viewerCount, apiBase, realStream]);

  /** 报告关闭 → 若有待切换房间则跳转，否则回到数据源选择 */
  const handleReportClose = useCallback(() => {
    setShowReportModal(false);
    setSessionSnapshot(null);
    reset();
    sessionStartRef.current = null;

    const nextRoom = pendingRoomIdRef.current;
    if (nextRoom) {
      // 连接新直播间：返回到输入界面，跳过欢迎动画
      pendingRoomIdRef.current = null;
      setPendingRoomId(null);
      setDataSource(null);
      setSourceConfig({});
      setEntryStep("app");  // 跳过欢迎页
      setPage("entry");
      return;
    }

    // 没有待切换的房间，返回数据源选择界面
    setDataSource(null);
    setSourceConfig({});
    setEntryStep("app");  // 跳过欢迎页
    setPage("entry");
  }, [reset]);

  // Close report modal only, then resume live connection when possible.
  const handleReportDismiss = useCallback(() => {
    setShowReportModal(false);
    setSessionSnapshot(null);
    reset();
    sessionStartRef.current = null;
    if (dataSource === "douyin" && sourceConfig.roomId) {
      setTimeout(() => realStream.reconnectNow?.(), 0);
    }
  }, [reset, dataSource, sourceConfig.roomId, realStream]);

  const jumpToUtterance = useCallback((uid) => {
    if (page !== "dashboard") setPage("dashboard");
    setTimeout(() => feedRef.current?.highlightItem(uid), 100);
  }, [page]);

  const handleExport = useCallback(() => {
    exportReport(utterances, rationalityIndex, riskData, sessionStats);
  }, [utterances, rationalityIndex, riskData, sessionStats, exportReport]);

  const handleSourceSelect = useCallback((source, config) => {
    setDataSource(source);
    setSourceConfig(config);
    setShowSourceSelector(false);
  }, []);

  // Called from LiveDiscoverPage when user clicks "餈?湔??
  /** 摰??扯??嚗?蝛箸?唳 ???剖??扯?????餈?輸 */
  const doSwitchRoom = useCallback((roomId) => {
    reset();
    realStream.disconnect?.();
    sessionStartRef.current = null;
    setPendingRoomId(null);
    pendingRoomIdRef.current = null;
    setDataSource("douyin");
    setSourceConfig((prev) => ({
      ...prev,
      roomId,
      wsBase: prev.wsBase || "ws://localhost:8011",
    }));
    setPage("dashboard");
  }, [reset, realStream]);

  /** 隞??圈△?孵"餈?湔??嚗???唳?嗅撕蝖株恕獢??血??湔? */
  const handleConnectRoom = useCallback((roomId) => {
    const hasData = utterances.length > 0 || chatMessages.length > 0;
    const isSameRoom = sourceConfig.roomId === roomId;
    if (hasData && dataSource === "douyin" && !isSameRoom) {
      pendingRoomIdRef.current = roomId;
      setPendingRoomId(roomId);
    } else {
      doSwitchRoom(roomId);
    }
  }, [utterances.length, chatMessages.length, dataSource, sourceConfig.roomId, doSwitchRoom]);

  /** 靽??亙????ｇ??蝏翰?批撕?亙?撘寧?嚗endingRoomIdRef 靽???roomId 靥?handleReportClose 雿輻*/
  const handleSaveAndSwitch = useCallback(() => {
    setSessionSnapshot({
      utterances: [...utterances],
      chatMessages: [...chatMessages],
      stats: { ...sessionStats },
      rationalityIndex,
      riskData: [...riskData],
      roomId: sourceConfig.roomId || null,
      startTime: sessionStartRef.current,
      endTime: Date.now(),
    });
    realStream.disconnect?.();
    // ?喲蝖株恕撘寧?嚗endingRoomIdRef 靽???roomId 靥?handleReportClose 雿輻
    setPendingRoomId(null);
  }, [utterances, chatMessages, sessionStats, rationalityIndex, riskData, sourceConfig.roomId, realStream]);

  if (entryStep === "welcome") {
    return <WelcomePage onEnter={() => setEntryStep("app")} />;
  }

  // Source selection screen
  if (!dataSource) {
    return (
      <div className="sg-page-shell" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <DataSourceSelector onSelect={handleSourceSelect} onConnect={handleSourceSelect} />
      </div>
    );
  }

  const activeTab = NAV_TABS.find((tab) => tab.id === page) || NAV_TABS[0];
  const lockDashboardHeight = dashboardSection === "stream"; // dashboard 始终挂载，不再依赖 page
  const NAV_ICONS = {
    dashboard: "▦",
    discover: "⌕",
    consumer: "◎",
    history: "◷",
    analytics: "◲",
    rules: "⚑",
  };

  return (
    <div className="app-shell sg-app">
      <Header
        page={page} setPage={setPage}
        viewerCount={viewerCount} utteranceCount={sessionStats.total || messageTotals.utterances || utterances.length}
        isPaused={isPaused} setIsPaused={setIsPaused}
        onReset={reset} onExport={handleExport}
        onEnd={handleEndSession}
        sessionStats={sessionStats}
        currentSource={dataSource}
        onSwitchSource={() => setShowSourceSelector(true)}
        connectionStatus={dataSource !== "mock" ? {
          connected: realStream.connected,
          connecting: realStream.connecting,
          error: realStream.error,
          roomId: sourceConfig.roomId,
        } : null}
        showTabs={false}
      />

      <div className="sg-workspace">
        <aside className="sg-sidebar">
          <div className="sg-sidebar-title">StreamGuard</div>
          <div className="sg-sidebar-nav">
            {NAV_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPage(tab.id)}
                className={`sg-side-link ${page === tab.id ? "is-active" : ""}`}
              >
                <span className="sg-side-icon">{NAV_ICONS[tab.id] || "•"}</span>
                <span className="sg-side-label">{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="sg-sidebar-card">
            <div className="sg-sidebar-card-title">当前页</div>
            <div className="sg-sidebar-card-body">{activeTab.description}</div>
          </div>
        </aside>

        <main className="sg-main">
      {/* Dashboard - 始终挂载，通过 display 控制可见性，防止 VideoPlayer 切换页面时断开连接 */}
        <div
          className="sg-dashboard"
          style={{
            padding: "20px 24px 20px",
            display: page === "dashboard" ? "flex" : "none",
            flexDirection: "column",
            gap: 16,
            ...(lockDashboardHeight ? { height: "100%", minHeight: 0, overflow: "auto" } : null),
          }}
        >
          <div className="sg-dashboard-head">
            <div className="sg-dashboard-title">实时总览</div>
            <div className="sg-dashboard-tabs">
              {[
                { id: "ops", label: "运营指挥台" },
                { id: "stream", label: "直播与话术" },
                { id: "analysis", label: "风险分析" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  className={`sg-dash-tab ${dashboardSection === tab.id ? "is-active" : ""}`}
                  onClick={() => setDashboardSection(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {dashboardSection === "ops" && (
            <div className="sg-ops-grid">
              <CommandCenter
                dataSource={dataSource}
                sourceConfig={sourceConfig}
                connection={{
                  connected: realStream.connected,
                  connecting: realStream.connecting,
                  error: realStream.error,
                  lastMessageAt: realStream.lastMessageAt,
                  connectionAttempts: realStream.connectionAttempts,
                  statusLog: realStream.statusLog,
                }}
                utterances={utterances}
                chatMessages={chatMessages}
                messageTotals={messageTotals}
                recentLimits={recentLimits}
                onReconnect={() => realStream.reconnectNow?.()}
              />

              <div className="sg-ops-side">
                <div className="sg-ops-card">
                  <div className="sg-ops-card-head">
                    <div className="sg-ops-card-title">关键指标</div>
                    <div className="sg-ops-card-subtitle">
                      <span className="mono">{new Date().toLocaleTimeString("zh-CN", { hour12: false })}</span>
                    </div>
                  </div>
                  <div className="sg-ops-card-body">
                    <div className="sg-ops-kv">
                      <span className="sg-ops-k">在线观众</span>
                      <span className="sg-ops-v mono">{viewerCount || 0}</span>
                    </div>
                    <div className="sg-ops-kv">
                      <span className="sg-ops-k">理性指数</span>
                      <span className="sg-ops-v mono">{Math.round(rationalityIndex || 0)}/100</span>
                    </div>
                    <div className="sg-ops-kv">
                      <span className="sg-ops-k">累计语义</span>
                      <span className="sg-ops-v mono">{messageTotals.utterances || utterances.length}</span>
                    </div>
                    <div className="sg-ops-kv">
                      <span className="sg-ops-k">累计弹幕</span>
                      <span className="sg-ops-v mono">{messageTotals.chats || chatMessages.length}</span>
                    </div>
                    <div className="sg-ops-kv">
                      <span className="sg-ops-k">当前数据源</span>
                      <span className="sg-ops-v">{dataSource || "--"}</span>
                    </div>
                  </div>
                </div>

                <div className="sg-ops-card" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <div className="sg-ops-card-head">
                    <div className="sg-ops-card-title">最新告警</div>
                    <div className="sg-ops-card-subtitle">
                      {alerts?.length ? `${alerts.length} 条` : "暂无告警"}
                    </div>
                  </div>
                  <div className="sg-ops-card-body" style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
                    <div className="sg-ops-alerts">
                      {(alerts || []).slice(0, 6).map((a) => {
                        const clickable = !!a.utteranceId;
                        return (
                          <div
                            key={a.id}
                            className={`sg-ops-alert ${clickable ? "is-clickable" : ""}`}
                            onClick={() => clickable && jumpToUtterance(a.utteranceId)}
                            role={clickable ? "button" : undefined}
                            tabIndex={clickable ? 0 : undefined}
                            onKeyDown={(e) => {
                              if (!clickable) return;
                              if (e.key === "Enter" || e.key === " ") jumpToUtterance(a.utteranceId);
                            }}
                          >
                            <div className="sg-ops-alert-meta">
                              <div className="sg-ops-alert-meta-left">
                                <span className="sg-ops-pill mono">score {a.score}</span>
                                <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.timestamp}</span>
                              </div>
                              <span style={{ fontSize: 12, color: "var(--trap)", fontWeight: 800 }}>TRAP</span>
                            </div>
                            <div className="sg-ops-alert-text">{a.text}</div>
                          </div>
                        );
                      })}
                      {(!alerts || alerts.length === 0) && (
                        <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "6px 2px" }}>
                          直播中若出现高风险话术，会在这里沉淀为可回看条目。
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VideoPlayer 容器 - 始终挂载，通过 display 控制可见性 */}
          <div style={{
            display: dashboardSection === "stream" ? "grid" : "none",
            gridTemplateColumns: dataSource === "douyin"
              ? "minmax(420px, 1.1fr) minmax(420px, 1fr)"
              : "minmax(520px, 1fr)",
            gap: 18,
            alignItems: "stretch",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}>
            {dataSource === "douyin" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16, alignSelf: "stretch", minHeight: 0 }}>
                {sourceConfig.roomId ? (
                  <VideoPlayer
                    roomId={sourceConfig.roomId}
                    wsBase={sourceConfig.wsBase || "http://localhost:8011"}
                    isVisible={dashboardSection === "stream"}
                  />
                ) : (
                  <div style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                  }}>
                    <div style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>实时直播</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>等待连接直播间</span>
                    </div>
                    <div style={{
                      background: "#000",
                      flex: 1,
                      minHeight: 240,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-muted)",
                      fontSize: 13,
                    }}>
                      请先在上方选择并连接直播间
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 16, alignSelf: "stretch", minHeight: 0, height: "100%" }}>
              <div style={{ flex: "0 0 300px", minHeight: 0, overflow: "hidden" }}>
                <LiveStreamPanel chatMessages={chatMessages} isLive={realStream.connected || dataSource === "mock"} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <SemanticFeed ref={feedRef} utterances={utterances} />
              </div>
            </div>
          </div>

          {dashboardSection === "analysis" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <RationalityGauge value={rationalityIndex} utterances={utterances} />
                <RiskRadar data={riskData} />
              </div>
              <div style={{ height: 560 }}>
                <TopologyGraph utterances={utterances} />
              </div>
            </div>
          )}
        </div>

      {page === "history" && <HistoryPage />}
      {page === "discover" && (
        <LiveDiscoverPage
          apiBase={apiBase}
          onConnectRoom={handleConnectRoom}
          utterances={utterances}
          chatMessages={chatMessages}
        />
      )}
      {page === "consumer" && (
        <ConsumerAdvisorPage
          apiBase={apiBase}
          utterances={utterances}
          chatMessages={chatMessages}
        />
      )}
      {page === "analytics" && <AnalyticsPage />}
      {page === "rules" && <RulesPage />}
        </main>
      </div>

      <AlertBanner alerts={alerts} onDismiss={() => {}} onJumpTo={jumpToUtterance} />

      {showGate && (
        <RationalityGate
          utterances={utterances}
          onConfirm={() => setShowGate(false)}
          onCancel={() => setShowGate(false)}
        />
      )}

      {showSourceSelector && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
          onClick={e => e.target === e.currentTarget && setShowSourceSelector(false)}
        >
          <DataSourceSelector onSelect={handleSourceSelect} onConnect={handleSourceSelect} />
        </div>
      )}

      {/* Session Report Modal - delayed display to avoid Chrome crash */}
      {showReportModal && sessionSnapshot && (
        <SessionReportModal
          snapshot={sessionSnapshot}
          apiBase={apiBase}
          onDismiss={handleReportDismiss}
          onClose={handleReportClose}
        />
      )}

      {/* ??湔?渡＆霈文撕蝒?*/}
      {pendingRoomId && !sessionSnapshot && (
        <SwitchRoomModal
          fromRoomId={sourceConfig.roomId}
          toRoomId={pendingRoomId}
          stats={sessionStats}
          startTime={sessionStartRef.current}
          onSaveAndSwitch={handleSaveAndSwitch}
          onDirectSwitch={() => doSwitchRoom(pendingRoomId)}
          onCancel={() => {
            setPendingRoomId(null);
            pendingRoomIdRef.current = null;
          }}
        />
      )}
      {/* 蝎折△??*/}
    </div>
  );
}



