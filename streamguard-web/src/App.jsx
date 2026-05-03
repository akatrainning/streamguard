import { Suspense, lazy, useRef, useCallback, useState, useMemo, useEffect } from "react";
import "./App.css";
import { useSimulatedStream } from "./hooks/useSimulatedStream";
import { useRealStream } from "./hooks/useRealStream";
import Header, { NAV_TABS } from "./components/Header";
import VideoPlayer from "./components/VideoPlayer";
import LiveStreamPanel from "./components/LiveStreamPanel";
import SemanticFeed from "./components/SemanticFeed";
import RiskInsightSidebar from "./components/RiskInsightSidebar";
import AlertBanner from "./components/AlertBanner";
import RationalityGate from "./components/RationalityGate";
import DataSourceSelector from "./components/DataSourceSelector";
import CommandCenter from "./components/CommandCenter";
import SessionReportModal from "./components/SessionReportModal";
import SwitchRoomModal from "./components/SwitchRoomModal";
import HistoryPage from "./pages/HistoryPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import ConsumerAdvisorPage from "./pages/ConsumerAdvisorPage";
import LiveDiscoverPage from "./pages/LiveDiscoverPage";
import WelcomePage from "./pages/WelcomePage";
import AuthPage from "./pages/AuthPage";
import ProfilePage from "./pages/ProfilePage";
import { buildHistoryEntry } from "./utils/historyStorage";
import { getStoredToken, setStoredToken, clearStoredToken, requestJson } from "./utils/authClient";
import { saveHistorySession } from "./utils/historyApi";

const NAV_ICONS = {
  dashboard: "D",
  discover: "F",
  consumer: "C",
  history: "H",
  analytics: "A",
  rules: "R",
  profile: "P",
};

const LOCKED_FEATURE_NAMES = {
  discover: "直播发现",
  consumer: "消费建议",
  history: "历史记录",
  analytics: "深度分析",
  profile: "个人主页",
};

const RulesPage = lazy(() => import("./pages/RulesPage"));

export default function App() {
  const [dataSource, setDataSource] = useState(null);
  const [sourceConfig, setSourceConfig] = useState({});
  const [page, setPage] = useState("dashboard");
  const [dashboardSection, setDashboardSection] = useState("ops");
  const [entryStep, setEntryStep] = useState("welcome");
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [dashboardMenuOpen, setDashboardMenuOpen] = useState(true);
  const [authToken, setAuthToken] = useState(() => getStoredToken());
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [intendedPage, setIntendedPage] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [sessionSnapshot, setSessionSnapshot] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [pendingRoomId, setPendingRoomId] = useState(null);
  const sessionStartRef = useRef(null);
  const endingRef = useRef(false);
  const feedRef = useRef(null);
  const pendingRoomIdRef = useRef(null);

  const simulated = useSimulatedStream();
  const realStream = useRealStream({
    mode: dataSource === "douyin" ? "douyin" : "mock",
    roomId: sourceConfig.roomId,
    wsBase: sourceConfig.wsBase || "ws://localhost:8011",
    enabled: dataSource === "douyin",
  });

  if (realStream.connected && !sessionStartRef.current) {
    sessionStartRef.current = Date.now();
  }

  const streamData = useMemo(() => {
    if (!dataSource) return null;
    if (dataSource === "mock") return simulated;
    return realStream;
  }, [dataSource, simulated, realStream]);

  const {
    utterances = [],
    chatMessages = [],
    rationalityIndex = 0,
    riskData = [],
    alerts = [],
    viewerCount = 0,
    showGate = false,
    setShowGate = () => {},
    isPaused = false,
    setIsPaused = () => {},
    reset = () => {},
    exportReport = () => {},
    sessionStats = {},
    messageTotals = { utterances: 0, chats: 0, total: 0 },
    recentLimits = { utterances: 0, chats: 0 },
  } = streamData || {};

  const apiBase = (sourceConfig.wsBase || "ws://localhost:8011").replace(/^ws/i, "http");
  const protectedPages = useMemo(() => new Set(["discover", "consumer", "history", "analytics", "profile"]), []);

  const navigateTo = useCallback((nextPage) => {
    if (!authUser && protectedPages.has(nextPage)) {
      setIntendedPage(nextPage);
      setPage(nextPage);
      return;
    }
    setPage(nextPage);
  }, [authUser, protectedPages]);

  useEffect(() => {
    let alive = true;
    const loadUser = async () => {
      if (!authToken) {
        if (alive) setAuthLoading(false);
        return;
      }
      if (alive) setAuthLoading(true);
      try {
        const payload = await requestJson(apiBase, "/me", { token: authToken });
        if (alive) setAuthUser(payload.user);
      } catch {
        clearStoredToken();
        if (alive) {
          setAuthToken(null);
          setAuthUser(null);
        }
      } finally {
        if (alive) setAuthLoading(false);
      }
    };
    loadUser();
    return () => {
      alive = false;
    };
  }, [authToken, apiBase]);

  const handleAuthSuccess = useCallback((payload) => {
    if (!payload?.token) return;
    setStoredToken(payload.token);
    setAuthToken(payload.token);
    setAuthUser(payload.user || null);
    setAuthLoading(false);
    setShowAuthModal(false);
    if (intendedPage) {
      setPage(intendedPage);
      setIntendedPage(null);
    }
  }, [intendedPage]);

  const handleLogout = useCallback(async () => {
    if (authToken) {
      try {
        await requestJson(apiBase, "/auth/logout", { method: "POST", token: authToken });
      } catch {
        // Logout should still clear local credentials if the server is unavailable.
      }
    }
    clearStoredToken();
    setAuthToken(null);
    setAuthUser(null);
    setDataSource(null);
    setSourceConfig({});
    setPage("dashboard");
    setEntryStep("app");
    realStream.disconnect?.();
  }, [authToken, apiBase, realStream]);

  const handleUserUpdate = useCallback((nextUser) => {
    setAuthUser(nextUser);
  }, []);

  useEffect(() => {
    if (!authUser && protectedPages.has(page)) {
      setIntendedPage(page);
    }
  }, [authUser, page, protectedPages]);

  useEffect(() => {
    if (!sessionSnapshot) {
      setShowReportModal(false);
      endingRef.current = false;
      return;
    }
    const timer = setTimeout(() => setShowReportModal(true), 100);
    return () => clearTimeout(timer);
  }, [sessionSnapshot]);

  const handleEndSession = useCallback(async () => {
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

    if (authUser && authToken) {
      try {
        const entry = buildHistoryEntry(snap, viewerCount || 0);
        await saveHistorySession(apiBase, authToken, entry, snap);
      } catch {
        // The local session report still opens if remote history persistence fails.
      }
    }

    setSessionSnapshot(snap);
    realStream.disconnect?.();
  }, [utterances, chatMessages, sessionStats, rationalityIndex, riskData, sourceConfig.roomId, viewerCount, apiBase, realStream, authUser, authToken]);

  const handleReportClose = useCallback(() => {
    setShowReportModal(false);
    setSessionSnapshot(null);
    reset();
    sessionStartRef.current = null;

    const nextRoom = pendingRoomIdRef.current;
    if (nextRoom) {
      pendingRoomIdRef.current = null;
      setPendingRoomId(null);
    }

    setDataSource(null);
    setSourceConfig({});
    setEntryStep("app");
    setPage("entry");
  }, [reset]);

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
    setTimeout(() => realStream.reconnectNow?.(), 50);
  }, [reset, realStream]);

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
    setPendingRoomId(null);
  }, [utterances, chatMessages, sessionStats, rationalityIndex, riskData, sourceConfig.roomId, realStream]);

  if (entryStep === "welcome") {
    return <WelcomePage onEnter={() => setEntryStep("app")} />;
  }

  if (!dataSource) {
    return (
      <div className="sg-page-shell sg-entry-page">
        <div className="sg-entry-auth">
          {authUser ? (
            <>
              <span>{authUser.nickname || authUser.email}</span>
              <button onClick={handleLogout} type="button">退出登录</button>
            </>
          ) : (
            <button onClick={() => setShowAuthModal(true)} type="button">登录 / 注册</button>
          )}
        </div>
        <DataSourceSelector variant="page" onSelect={handleSourceSelect} onConnect={handleSourceSelect} />
        {showAuthModal && (
          <AuthModal onClose={() => setShowAuthModal(false)}>
            <AuthPage apiBase={apiBase} onAuthSuccess={handleAuthSuccess} onCancel={() => setShowAuthModal(false)} modal />
          </AuthModal>
        )}
      </div>
    );
  }

  const activeTab = NAV_TABS.find((tab) => tab.id === page) || NAV_TABS[0];
  const lockDashboardHeight = dashboardSection === "stream";
  const activePageLocked = !authUser && protectedPages.has(page);
  const dashboardModuleLabel = dashboardSection === "ops" ? "运营指挥台" : "直播与话术";
  const dashboardModuleDescription = dashboardSection === "ops"
    ? "连接诊断、实时指标和告警处置"
    : "直播画面、弹幕流和主播话术转写";

  return (
    <div className="app-shell sg-app">
      <Header
        page={page}
        setPage={navigateTo}
        viewerCount={viewerCount}
        utteranceCount={sessionStats.total || messageTotals.utterances || utterances.length}
        isPaused={isPaused}
        setIsPaused={setIsPaused}
        onReset={reset}
        onExport={handleExport}
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
          <div className="sg-sidebar-nav">
            {NAV_TABS.map((tab) => {
              if (tab.id === "dashboard") {
                return (
                  <div key={tab.id} className={`sg-side-group ${dashboardMenuOpen ? "is-open" : ""}`}>
                    <button
                      onClick={() => {
                        setDashboardMenuOpen((open) => !open);
                        navigateTo("dashboard");
                      }}
                      className={`sg-side-link sg-side-parent ${page === "dashboard" ? "is-active" : ""}`}
                      type="button"
                    >
                      <span className="sg-side-icon">{NAV_ICONS[tab.id] || "•"}</span>
                      <span className="sg-side-label">{tab.label}</span>
                      <span className="sg-side-chevron">⌄</span>
                    </button>
                    <div className="sg-side-submenu">
                      {[
                        { id: "ops", label: "运营指挥台" },
                        { id: "stream", label: "直播与话术" },
                      ].map((item) => (
                        <button
                          key={item.id}
                          className={`sg-side-subitem ${page === "dashboard" && dashboardSection === item.id ? "is-active" : ""}`}
                          onClick={() => {
                            setDashboardMenuOpen(true);
                            setDashboardSection(item.id);
                            navigateTo("dashboard");
                          }}
                          type="button"
                        >
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <button
                  key={tab.id}
                  onClick={() => navigateTo(tab.id)}
                  className={`sg-side-link ${page === tab.id ? "is-active" : ""} ${!authUser && protectedPages.has(tab.id) ? "is-locked" : ""}`}
                  type="button"
                >
                  <span className="sg-side-icon">{NAV_ICONS[tab.id] || "•"}</span>
                  <span className="sg-side-label">{tab.label}</span>
                  {!authUser && protectedPages.has(tab.id) && <span className="sg-side-lock">LOCK</span>}
                </button>
              );
            })}
          </div>
          <div className="sg-sidebar-card">
            <div className="sg-sidebar-card-title">当前页</div>
            <div className="sg-sidebar-card-body">{activeTab.description}</div>
          </div>
        </aside>

        <main className="sg-main">
          <Dashboard
            visible={page === "dashboard"}
            lockHeight={lockDashboardHeight}
            dashboardSection={dashboardSection}
            dataSource={dataSource}
            sourceConfig={sourceConfig}
            realStream={realStream}
            utterances={utterances}
            chatMessages={chatMessages}
            rationalityIndex={rationalityIndex}
            riskData={riskData}
            alerts={alerts}
            viewerCount={viewerCount}
            messageTotals={messageTotals}
            recentLimits={recentLimits}
            dashboardModuleLabel={dashboardModuleLabel}
            dashboardModuleDescription={dashboardModuleDescription}
            jumpToUtterance={jumpToUtterance}
            feedRef={feedRef}
          />

          {activePageLocked && (
            <LockedFeature
              title={LOCKED_FEATURE_NAMES[page] || activeTab.label}
              description={activeTab.description}
              onLogin={() => {
                setIntendedPage(page);
                setShowAuthModal(true);
              }}
            />
          )}
          {!activePageLocked && page === "history" && <HistoryPage apiBase={apiBase} token={authToken} />}
          {page === "discover" && !activePageLocked && (
            <LiveDiscoverPage apiBase={apiBase} onConnectRoom={handleConnectRoom} utterances={utterances} chatMessages={chatMessages} />
          )}
          {page === "consumer" && !activePageLocked && (
            <ConsumerAdvisorPage apiBase={apiBase} utterances={utterances} chatMessages={chatMessages} />
          )}
          {!activePageLocked && page === "analytics" && <AnalyticsPage />}
          {page === "rules" && (
            <Suspense fallback={<PageFallback title="正在载入规则知识图谱" detail="拆分后的图谱模块会按需加载，不再占用主工作台首屏体积。" />}>
              <RulesPage />
            </Suspense>
          )}
          {!activePageLocked && page === "profile" && (
            <ProfilePage apiBase={apiBase} token={authToken} user={authUser} onUserUpdate={handleUserUpdate} onLogout={handleLogout} />
          )}
        </main>
      </div>

      <AlertBanner alerts={alerts} onDismiss={() => {}} onJumpTo={jumpToUtterance} />

      {showGate && (
        <RationalityGate utterances={utterances} onConfirm={() => setShowGate(false)} onCancel={() => setShowGate(false)} />
      )}

      {showSourceSelector && (
        <div
          className="sg-modal-backdrop"
          onClick={(event) => event.target === event.currentTarget && setShowSourceSelector(false)}
        >
          <DataSourceSelector variant="modal" onSelect={handleSourceSelect} onConnect={handleSourceSelect} />
        </div>
      )}

      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)}>
          <AuthPage apiBase={apiBase} onAuthSuccess={handleAuthSuccess} onCancel={() => setShowAuthModal(false)} modal />
        </AuthModal>
      )}

      {showReportModal && sessionSnapshot && (
        <SessionReportModal snapshot={sessionSnapshot} apiBase={apiBase} onDismiss={handleReportDismiss} onClose={handleReportClose} />
      )}

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
    </div>
  );
}

function Dashboard(props) {
  const {
    visible,
    lockHeight,
    dashboardSection,
    dataSource,
    sourceConfig,
    realStream,
    utterances,
    chatMessages,
    rationalityIndex,
    riskData,
    alerts,
    viewerCount,
    messageTotals,
    recentLimits,
    dashboardModuleLabel,
    dashboardModuleDescription,
    jumpToUtterance,
    feedRef,
  } = props;

  return (
    <div
      className="sg-dashboard"
      style={{
        padding: "20px 24px 20px",
        display: visible ? "flex" : "none",
        flexDirection: "column",
        gap: 16,
        ...(lockHeight ? { height: "100%", minHeight: 0, overflow: "auto" } : null),
      }}
    >
      <div className="sg-dashboard-head">
        <div className="sg-dashboard-heading">
          <div className="sg-dashboard-title">{dashboardModuleLabel}</div>
        </div>
        <div className="sg-dashboard-context">{dashboardModuleDescription}</div>
      </div>

      <div className="sg-dashboard-body">
        <RiskInsightSidebar
          rationalityIndex={rationalityIndex}
          riskData={riskData}
          alerts={alerts}
          utterances={utterances}
          messageTotals={messageTotals}
          viewerCount={viewerCount}
          onJumpTo={jumpToUtterance}
        />

        <section className="sg-dashboard-stage">
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
              <OpsSide
                alerts={alerts}
                viewerCount={viewerCount}
                rationalityIndex={rationalityIndex}
                messageTotals={messageTotals}
                utterances={utterances}
                chatMessages={chatMessages}
                dataSource={dataSource}
                jumpToUtterance={jumpToUtterance}
              />
            </div>
          )}

          <div className="sg-stream-grid" style={{ display: dashboardSection === "stream" ? "grid" : "none" }}>
            {dataSource === "douyin" && (
              <div className="sg-video-column">
                {sourceConfig.roomId ? (
                  <VideoPlayer
                    roomId={sourceConfig.roomId}
                    wsBase={sourceConfig.wsBase || "http://localhost:8011"}
                    isVisible={dashboardSection === "stream"}
                  />
                ) : (
                  <div className="sg-video-empty">
                    <header>
                      <strong>实时直播</strong>
                      <span>等待连接直播间</span>
                    </header>
                    <div>请先在上方选择并连接直播间</div>
                  </div>
                )}
              </div>
            )}

            <div className="sg-stream-column">
              <div className="sg-stream-chat">
                <LiveStreamPanel chatMessages={chatMessages} isLive={realStream.connected || dataSource === "mock"} />
              </div>
              <SemanticFeed ref={feedRef} utterances={utterances} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function OpsSide({ alerts, viewerCount, rationalityIndex, messageTotals, utterances, chatMessages, dataSource, jumpToUtterance }) {
  return (
    <div className="sg-ops-side">
      <div className="sg-ops-card">
        <div className="sg-ops-card-head">
          <div className="sg-ops-card-title">关键指标</div>
          <div className="sg-ops-card-subtitle">
            <span className="mono">{new Date().toLocaleTimeString("zh-CN", { hour12: false })}</span>
          </div>
        </div>
        <div className="sg-ops-card-body">
          <Kv label="在线观众" value={viewerCount || 0} mono />
          <Kv label="理性指数" value={`${Math.round(rationalityIndex || 0)}/100`} mono />
          <Kv label="累计语义" value={messageTotals.utterances || utterances.length} mono />
          <Kv label="累计弹幕" value={messageTotals.chats || chatMessages.length} mono />
          <Kv label="当前数据源" value={dataSource || "--"} />
        </div>
      </div>

      <div className="sg-ops-card sg-ops-alert-card">
        <div className="sg-ops-card-head">
          <div className="sg-ops-card-title">最新告警</div>
          <div className="sg-ops-card-subtitle">{alerts?.length ? `${alerts.length} 条` : "暂无告警"}</div>
        </div>
        <div className="sg-ops-card-body">
          <div className="sg-ops-alerts">
            {(alerts || []).slice(0, 6).map((alert) => {
              const clickable = !!alert.utteranceId;
              return (
                <div
                  key={alert.id}
                  className={`sg-ops-alert ${clickable ? "is-clickable" : ""}`}
                  onClick={() => clickable && jumpToUtterance(alert.utteranceId)}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (!clickable) return;
                    if (e.key === "Enter" || e.key === " ") jumpToUtterance(alert.utteranceId);
                  }}
                >
                  <div className="sg-ops-alert-meta">
                    <div className="sg-ops-alert-meta-left">
                      <span className="sg-ops-pill mono">score {alert.score}</span>
                      <span className="mono">{alert.timestamp}</span>
                    </div>
                    <strong>TRAP</strong>
                  </div>
                  <div className="sg-ops-alert-text">{alert.text}</div>
                </div>
              );
            })}
            {(!alerts || alerts.length === 0) && (
              <div className="sg-ops-empty">直播中若出现高风险话术，会在这里沉淀为可回看条目。</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kv({ label, value, mono = false }) {
  return (
    <div className="sg-ops-kv">
      <span className="sg-ops-k">{label}</span>
      <span className={`sg-ops-v ${mono ? "mono" : ""}`}>{value}</span>
    </div>
  );
}

function PageFallback({ title, detail }) {
  return (
    <section className="sg-ui-panel" style={{ margin: "20px 24px", maxWidth: 720 }}>
      <header className="sg-ui-panel-head">
        <div>
          <div className="sg-ui-eyebrow">LOADING</div>
          <h2>{title}</h2>
        </div>
      </header>
      <div className="sg-ui-panel-body">
        <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.7 }}>{detail}</p>
      </div>
    </section>
  );
}

function AuthModal({ children, onClose }) {
  return (
    <div className="sg-auth-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {children}
    </div>
  );
}

function LockedFeature({ title, description, onLogin }) {
  return (
    <div className="sg-locked-shell">
      <div className="sg-locked-panel">
        <div className="sg-locked-badge">LOCKED</div>
        <h1>{title}</h1>
        <p>{description}</p>
        <p className="sg-locked-copy">
          该功能会读取或沉淀账号数据，需要先登录或注册后使用。实时总览和首页仍可直接访问。
        </p>
        <button className="sg-locked-action" onClick={onLogin} type="button">登录 / 注册</button>
      </div>
    </div>
  );
}
