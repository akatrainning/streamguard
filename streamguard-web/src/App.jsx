import { useRef, useCallback, useState, useMemo } from "react";
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
import HistoryPage from "./pages/HistoryPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import RulesPage from "./pages/RulesPage";

export default function App() {
  const [dataSource, setDataSource] = useState(null);
  const [sourceConfig, setSourceConfig] = useState({});
  const [page, setPage] = useState("dashboard");
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const feedRef = useRef(null);

  const simulated = useSimulatedStream();
  const realStream = useRealStream({
    mode: dataSource === "douyin" ? "douyin" : "mock",
    roomId: sourceConfig.roomId,
    wsBase: sourceConfig.wsBase || "ws://localhost:8010",
    enabled: dataSource === "douyin",
  });

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

  // Source selection screen
  if (!dataSource) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <DataSourceSelector onSelect={handleSourceSelect} onConnect={handleSourceSelect} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header
        page={page} setPage={setPage}
        viewerCount={viewerCount} utteranceCount={sessionStats.total || messageTotals.utterances || utterances.length}
        isPaused={isPaused} setIsPaused={setIsPaused}
        onReset={reset} onExport={handleExport}
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
        <div style={{ maxWidth: 1500, margin: "0 auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
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

          {/* 视频播放器区域 */}
          {sourceConfig.roomId && (
            <VideoPlayer
              roomId={sourceConfig.roomId}
              wsBase={sourceConfig.wsBase || "http://localhost:8010"}
            />
          )}

          <div style={{
            display: "grid", gridTemplateColumns: "380px 1fr",
            gap: 14,
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <LiveStreamPanel chatMessages={chatMessages} isLive={realStream.connected || dataSource === "mock"} />
              <SemanticFeed ref={feedRef} utterances={utterances} />
            </div>
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
    </div>
  );
}
