import { useState, useEffect, useCallback, useRef } from "react";

const BASE_RISK = [
  { subject: "Price Transparency",  value: 70 },
  { subject: "Pressure Level",      value: 40 },
  { subject: "Accuracy",            value: 65 },
  { subject: "Urgency",             value: 50 },
  { subject: "Evidence",            value: 70 },
  { subject: "Compliance",          value: 72 },
];

export function useRealStream({
  mode = "douyin",
  roomId = "",
  wsBase = "ws://localhost:8010",
  enabled = true,
} = {}) {
  const [utterances,       setUtterances]       = useState([]);
  const [chatMessages,     setChatMessages]     = useState([]);
  const [rationalityIndex, setRationalityIndex] = useState(78);
  const [riskData,         setRiskData]         = useState(BASE_RISK);
  const [alerts,           setAlerts]           = useState([]);
  const [viewerCount,      setViewerCount]      = useState(0);
  const [showGate,         setShowGate]         = useState(false);
  const [isPaused,         setIsPaused]         = useState(false);
  const [sessionStats,     setSessionStats]     = useState({ total:0, trap:0, hype:0, fact:0 });
  const [connected,        setConnected]        = useState(false);
  const [connecting,       setConnecting]       = useState(false);
  const [error,            setError]            = useState(null);
  const [lastMessageAt,    setLastMessageAt]    = useState(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [statusLog,        setStatusLog]        = useState([]);
  const [reconnectToken,   setReconnectToken]   = useState(0);

  const wsRef       = useRef(null);
  const alertId     = useRef(0);
  const isPausedRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  isPausedRef.current = isPaused;

  const pushLog = useCallback((line) => {
    const t = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setStatusLog(prev => [`[${t}] ${line}`, ...prev].slice(0, 40));
  }, []);

  const connect = useCallback(() => {
    if (!enabled) return;

    const url = mode === "douyin"
      ? `${wsBase}/ws/douyin/${roomId}`
      : `${wsBase}/ws/stream`;

    setConnectionAttempts(v => v + 1);
    setConnecting(true);
    setError(null);
    pushLog(`connecting -> ${url}`);

    wsRef.current?.close();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setConnecting(false);
      setError(null);
      pushLog("websocket connected");
      console.log("[StreamGuard] WebSocket connected:", url);
    };

    ws.onmessage = (event) => {
      if (isPausedRef.current) return;
      setLastMessageAt(Date.now());
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.event === "status") {
        // backend confirmed connection to live room
        if (msg.message) pushLog(msg.message);
        console.log("[StreamGuard] status:", msg.message);
        return;
      }

      if (msg.event === "utterance") {
        const item = {
          uid: msg.id, id: msg.id,
          text: msg.text, type: msg.type,
          score: msg.score, timestamp: msg.timestamp,
        };
        setUtterances(prev => [item, ...prev].slice(0, 20));
        setRationalityIndex(prev => {
          const delta = msg.type === "trap" ? -8 : msg.type === "hype" ? -3 : +4;
          return Math.max(15, Math.min(95, prev + delta));
        });
        setRiskData(prev => prev.map(d => ({
          ...d, value: Math.max(10, Math.min(99, d.value + (Math.random()*6-3))),
        })));
        setSessionStats(prev => ({
          total: prev.total + 1,
          trap:  prev.trap  + (msg.type === "trap"  ? 1 : 0),
          hype:  prev.hype  + (msg.type === "hype"  ? 1 : 0),
          fact:  prev.fact  + (msg.type === "fact"  ? 1 : 0),
        }));
        if (msg.type === "trap") {
          alertId.current++;
          const id = alertId.current;
          setAlerts(prev => [
            { id, text: msg.text, score: msg.score, utteranceId: msg.id, timestamp: msg.timestamp },
            ...prev,
          ].slice(0, 5));
          setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 7000);
        }
      }

      if (msg.event === "chat") {
        setChatMessages(prev => [
          { id: Date.now(), user: msg.user, text: msg.text, timestamp: msg.timestamp },
          ...prev,
        ].slice(0, 30));
      }
      if (msg.event === "viewer_join") setViewerCount(prev => prev + 1);
      if (msg.event === "viewer_count") setViewerCount(msg.count);
      if (msg.event === "error") {
        setError(msg.message);
        setConnected(false);
        setConnecting(false);
        pushLog(`server error: ${msg.message || "unknown"}`);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setConnecting(false);
      pushLog("websocket closed, retry in 5s");
      if (enabled) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(connect, 5000);
      }
    };

    ws.onerror = () => {
      setError("WebSocket connection failed - please start the backend server");
      setConnected(false);
      setConnecting(false);
      pushLog("websocket error");
    };
  }, [mode, roomId, wsBase, enabled, pushLog]);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect, enabled, reconnectToken]);

  const reset = useCallback(() => {
    setUtterances([]);
    setChatMessages([]);
    setRationalityIndex(78);
    setRiskData(BASE_RISK);
    setAlerts([]);
    setViewerCount(0);
    setSessionStats({ total:0, trap:0, hype:0, fact:0 });
  }, []);

  const reconnectNow = useCallback(() => {
    pushLog("manual reconnect requested");
    setReconnectToken(v => v + 1);
  }, [pushLog]);

  const exportReport = useCallback((uList, ri, rd, stats) => {
    const lines = [
      "=== StreamGuard Report ===",
      `Generated: ${new Date().toLocaleString("zh-CN")}`,
      `Source: ${mode === "douyin" ? "Douyin room " + roomId : "Simulated"}`,
      "", `Rationality Index: ${ri}`,
      "", `Stats: total=${stats.total} fact=${stats.fact} hype=${stats.hype} trap=${stats.trap}`,
      "", "Utterances:",
      ...uList.map((u,i) => `  [${i+1}] [${u.type.toUpperCase()}] ${u.text} | score:${u.score}`),
      "=== End ===",
    ];
    const blob = new Blob([lines.join("\n")], { type:"text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "streamguard_report.txt"; a.click();
    URL.revokeObjectURL(url);
  }, [mode, roomId]);

  return {
    utterances, chatMessages, rationalityIndex, riskData, alerts,
    viewerCount, showGate, setShowGate, isPaused, setIsPaused,
    reset, exportReport, sessionStats,
    connected, connecting, error,
    lastMessageAt, connectionAttempts, statusLog, reconnectNow,
    product: { name: "Live Product", brand: "Live Room", price: "--", stock: "--" },
  };
}