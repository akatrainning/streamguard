import { useRef, useCallback, useState, useMemo } from "react";
import "./App.css";
import { useSimulatedStream } from "./hooks/useSimulatedStream";
import { useRealStream } from "./hooks/useRealStream";
import Header from "./components/Header";
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

export default function App() {
  const [dataSource, setDataSource] = useState(null);
  const [sourceConfig, setSourceConfig] = useState({});
  const [page, setPage] = useState("dashboard");
  const [entryStep, setEntryStep] = useState("welcome");
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  // 结束监控相关状态
  const [sessionSnapshot, setSessionSnapshot] = useState(null); // 非 null 时展示报告
  const sessionStartRef = useRef(null); // 记录连接成功时间
  const feedRef = useRef(null);
  // 切换直播间确认弹窗
  const [pendingRoomId, setPendingRoomId] = useState(null); // 弹窗中显示用
  const pendingRoomIdRef = useRef(null);                    // handleReportClose 读取用

  const simulated = useSimulatedStream();
  const realStream = useRealStream({
    mode: dataSource === "douyin" ? "douyin" : "mock",
    roomId: sourceConfig.roomId,
    wsBase: sourceConfig.wsBase || "ws://localhost:8011",
    enabled: dataSource === "douyin",
  });

  // 记录首次连接时间（用于报告时长计算）
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

  /** 点击"结束监控"：冻结快照 → 断开连接 → 弹出报告 */
  const handleEndSession = useCallback(() => {
    // 冻结当前数据快照
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
    // 断开 WebSocket，停止自动重连
    realStream.disconnect?.();
  }, [utterances, chatMessages, sessionStats, rationalityIndex, riskData, sourceConfig.roomId, realStream]);

  /** 报告关闭 → 若有待切换房间则跳转，否则回到数据源选择 */
  const handleReportClose = useCallback(() => {
    setSessionSnapshot(null);
    reset();
    sessionStartRef.current = null;
    const nextRoom = pendingRoomIdRef.current;
    if (nextRoom) {
      pendingRoomIdRef.current = null;
      setPendingRoomId(null);
      setDataSource("douyin");
      setSourceConfig((prev) => ({
        ...prev,
        roomId: nextRoom,
        wsBase: prev.wsBase || "ws://localhost:8011",
      }));
      setPage("dashboard");
    } else {
      setDataSource(null);
      setSourceConfig({});
      setPage("dashboard");
    }
  }, [reset]);

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

  // Called from LiveDiscoverPage when user clicks "进入直播间"
  /** 实际执行切换：清空旧数据 → 断开旧连接 → 连新房间 */
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

  /** 从发现页点击"进入直播间"：有监控数据时弹确认框，否则直接切换 */
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

  /** 保存报告后切换：先冻结快照弹报告弹窗，报告关闭后 handleReportClose 再跳转 */
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
    // 关闭确认弹窗，pendingRoomIdRef 保留新 roomId 供 handleReportClose 使用
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

  return (
    <div className="sg-app" style={{ minHeight: "100vh", paddingBottom: 32 }}>
      <Header
        page={page} setPage={setPage}
        viewerCount={viewerCount} utteranceCount={sessionStats.total || messageTotals.utterances || utterances.length}
        isPaused={isPaused} setIsPaused={setIsPaused}
        onReset={reset} onExport={handleExport}
        onEnd={dataSource !== "mock" ? handleEndSession : undefined}
        sessionStats={sessionStats}
        currentSource={dataSource}
        onSwitchSource={() => setShowSourceSelector(true)}
        connectionStatus={dataSource !== "mock" ? {
          connected: realStream.connected,
          connecting: realStream.connecting,
          error: realStream.error,
          roomId: sourceConfig.roomId,
        } : null}
      />

      {page === "dashboard" && (
        <div className="sg-dashboard" style={{ maxWidth: 1500, margin: "0 auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
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

          <div style={{
            display: "grid",
            gridTemplateColumns: dataSource === "douyin"
              ? "minmax(420px, 1.2fr) minmax(360px, 1fr) minmax(420px, 1.6fr)"
              : "minmax(420px, 1.2fr) minmax(520px, 1.8fr)",
            gap: 14,
            alignItems: "start",
          }}>
            {/* 列 1（仅抖音模式）：保留可正常播放的大视频，并拉伸到与右侧两列对齐 */}
            {dataSource === "douyin" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, alignSelf: "stretch" }}>
                {sourceConfig.roomId ? (
                  <VideoPlayer
                    roomId={sourceConfig.roomId}
                    wsBase={sourceConfig.wsBase || "http://localhost:8011"}
                  />
                ) : (
                  <div style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>📺 实时直播</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>未选择房间</span>
                    </div>
                    <div style={{
                      background: "#000",
                      aspectRatio: "16/9",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-muted)",
                      fontSize: 12,
                    }}>
                    请输入直播间后开始播放
                  </div>
                </div>
                )}
              </div>
            )}
            {/* 列 2：弹幕实时流 + 语义分析 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <LiveStreamPanel chatMessages={chatMessages} isLive={realStream.connected || dataSource === "mock"} />
              <SemanticFeed ref={feedRef} utterances={utterances} />
            </div>
            {/* 列 3：图表 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <RationalityGauge value={rationalityIndex} utterances={utterances} />
                <RiskRadar data={riskData} />
              </div>
              <TopologyGraph utterances={utterances} />
            </div>
          </div>
        </div>
      )}

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

      {/* 会话总结报告弹窗（结束监控后展示）*/}
      {sessionSnapshot && (
        <SessionReportModal
          snapshot={sessionSnapshot}
          apiBase={apiBase}
          onClose={handleReportClose}
        />
      )}

      {/* 切换直播间确认弹窗 */}
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
      {/* 粘性页脚 */}
      <footer className="sg-footer" style={{
        position: "fixed",
        bottom: 0, left: 0, right: 0,
        height: 32,
        background: "rgba(10,10,18,0.92)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        zIndex: 900,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          🛡️ <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>StreamGuard</span>
          &nbsp;· 直播合规监测平台
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
          {dataSource === "douyin" && sourceConfig.roomId
            ? `🔴 LIVE · 房间号 ${sourceConfig.roomId}`
            : dataSource === "mock"
            ? "🟡 模拟数据模式"
            : "⚪ 未连接"}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          © 2026 StreamGuard · All rights reserved
        </span>
      </footer>
    </div>
  );
}
