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
  recentUtteranceLimit = 80,
  recentChatLimit = 120,
} = {}) {
  const [utterances,       setUtterances]       = useState([]);
  const [chatMessages,     setChatMessages]     = useState([]);
  const [rationalityIndex, setRationalityIndex] = useState(0);
  const [riskData,         setRiskData]         = useState(BASE_RISK);
  const [alerts,           setAlerts]           = useState([]);
  const [viewerCount,      setViewerCount]      = useState(0);
  const [showGate,         setShowGate]         = useState(false);
  const [isPaused,         setIsPaused]         = useState(false);
  const [sessionStats,     setSessionStats]     = useState({ total:0, trap:0, hype:0, fact:0 });
  const [messageTotals,    setMessageTotals]    = useState({ utterances: 0, chats: 0, total: 0 });
  const [connected,        setConnected]        = useState(false);
  const [connecting,       setConnecting]       = useState(false);
  const [error,            setError]            = useState(null);
  const [lastMessageAt,    setLastMessageAt]    = useState(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [statusLog,        setStatusLog]        = useState([]);
  const [reconnectToken,   setReconnectToken]   = useState(0);
  const [mediaUrl,         setMediaUrl]         = useState(undefined);  // undefined=等待 null=未找到 string=就绪

  const wsRef       = useRef(null);
  const alertId     = useRef(0);
  const isPausedRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const backoffRef  = useRef(1000);   // 初始1s，指数增长至30s
  const heartbeatRef = useRef(null);  // 心跳定时器
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

    // 清理旧连接和心跳
    clearTimeout(heartbeatRef.current);
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.onclose = null; // 防止触发旧onclose的重连
      wsRef.current.close();
    }
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setConnecting(false);
      setError(null);
      backoffRef.current = 1000; // 连接成功后重置backoff
      pushLog("websocket connected");
      console.log("[StreamGuard] WebSocket connected:", url);
      // 心跳检测：45s没有收到消息就主动重连
      const scheduleHeartbeat = () => {
        clearTimeout(heartbeatRef.current);
        heartbeatRef.current = setTimeout(() => {
          if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
            pushLog("heartbeat timeout (45s no data), reconnecting...");
            ws.close();
          }
        }, 45000);
      };
      scheduleHeartbeat();
      ws._scheduleHeartbeat = scheduleHeartbeat; // 每收到消息刷新
    };

    ws.onmessage = (event) => {
      if (isPausedRef.current) return;
      setLastMessageAt(Date.now());
      // 重置心跳计时器
      ws._scheduleHeartbeat?.();
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.event === "status") {
        // backend confirmed connection to live room
        if (msg.message) pushLog(msg.message);
        console.log("[StreamGuard] status:", msg.message);
        return;
      }

      if (msg.event === "media_url_discovered") {
        const url = msg.url || null;  // null = not found, string = found
        setMediaUrl(url);
        if (url) {
          pushLog(`媒体流地址已就绪: ${url.slice(0, 60)}...`);
        } else {
          pushLog("未能找到媒体流（可能未开播或有反爬限制）");
        }
        return;
      }

      if (msg.event === "utterance") {
        const item = {
          uid: msg.id, id: msg.id,
          text: msg.text,                           // 原始转写（展开区显示）
          display_text: msg.display_text || msg.text, // 整理后文本（主要展示）
          type: msg.type,
          score: msg.score, timestamp: msg.timestamp,
          source: msg.source,
          raw_text: msg.text,                       // 保留原始备用
          keywords: msg.keywords || [],
          violations: msg.violations || [],
          suggestion: msg.suggestion || "",
          sub_scores: msg.sub_scores || {},
          engine: msg.engine,
        };
        setUtterances(prev => {
          // 去重：如果 ID 已存在则跳过（防止 WebSocket 重连导致重复消息）
          if (prev.some(u => u.id === item.id)) return prev;
          return [item, ...prev].slice(0, recentUtteranceLimit);
        });
        setRationalityIndex(prev => {
          const delta = msg.type === "trap" ? -8 : msg.type === "hype" ? -3 : +4;
          return Math.max(15, Math.min(95, prev + delta));
        });
        setRiskData(prev => {
          const ss = msg.sub_scores || {};
          // 根据 type 推算紧迫度：trap=高压 hype=中 fact=低
          const urgencyVal = msg.type === "trap" ? 88 : msg.type === "hype" ? 55 : 18;
          const targets = {
            "Price Transparency": Math.round((msg.score ?? 0.5) * 100),
            "Pressure Level":    Math.round((ss.subjectivity_index ?? 0.5) * 100),
            "Accuracy":          Math.round((ss.semantic_consistency ?? 0.5) * 100),
            "Urgency":           urgencyVal,
            "Evidence":          Math.round((ss.fact_verification ?? 0.5) * 100),
            "Compliance":        Math.round((ss.compliance_score ?? 0.5) * 100),
          };
          // EMA 平滑 α=0.35，避免图表跳动过大
          return prev.map(d => ({
            ...d,
            value: Math.round(d.value * 0.65 + (targets[d.subject] ?? d.value) * 0.35),
          }));
        });
        setSessionStats(prev => ({
          total: prev.total + 1,
          trap:  prev.trap  + (msg.type === "trap"  ? 1 : 0),
          hype:  prev.hype  + (msg.type === "hype"  ? 1 : 0),
          fact:  prev.fact  + (msg.type === "fact"  ? 1 : 0),
        }));
        setMessageTotals(prev => ({
          utterances: prev.utterances + 1,
          chats: prev.chats,
          total: prev.total + 1,
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
        const chatId = msg.id || Date.now();
        setChatMessages(prev => {
          // 去重：如果 ID 已存在则跳过
          if (msg.id && prev.some(c => c.id === chatId)) return prev;
          return [
            {
              id: chatId,
              user: msg.user,
              text: msg.text,
              timestamp: msg.timestamp,
              // 保留后端语义分析字段（供LiveStreamPanel情感/意图可视化使用）
              sentiment:      msg.sentiment      || "neutral",
              intent:         msg.intent         || "other",
              flags:          msg.flags          || [],
              risk_score:     msg.risk_score     || 0,
              label:          msg.label          || "💬 普通弹幕",
              sentiment_icon: msg.sentiment_icon || "😐",
              correlation:    msg.correlation    || "unrelated",
            },
            ...prev,
          ].slice(0, recentChatLimit);
        });
        setMessageTotals(prev => ({
          utterances: prev.utterances,
          chats: prev.chats + 1,
          total: prev.total + 1,
        }));
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
      clearTimeout(heartbeatRef.current);
      setConnected(false);
      setConnecting(false);
      if (enabled && wsRef.current === ws) {
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 2, 30000); // 最长30s
        pushLog(`websocket closed, retry in ${(delay/1000).toFixed(1)}s`);
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(connect, delay);
      } else {
        pushLog("websocket closed");
      }
    };

    ws.onerror = () => {
      setError("WebSocket connection failed - please start the backend server");
      setConnected(false);
      setConnecting(false);
      pushLog("websocket error");
    };
  }, [mode, roomId, wsBase, enabled, pushLog, recentUtteranceLimit, recentChatLimit]);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      clearTimeout(heartbeatRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // 防止触发重连
        wsRef.current.close();
      }
    };
  }, [connect, enabled, reconnectToken]);

  const reset = useCallback(() => {
    setUtterances([]);
    setChatMessages([]);
    setRationalityIndex();
    setRiskData(BASE_RISK);
    setAlerts([]);
    setViewerCount(0);
    setSessionStats({ total:0, trap:0, hype:0, fact:0 });
    setMessageTotals({ utterances: 0, chats: 0, total: 0 });
  }, []);

  const reconnectNow = useCallback(() => {
    backoffRef.current = 1000; // 手动重连重置backoff
    pushLog("manual reconnect requested");
    setReconnectToken(v => v + 1);
  }, [pushLog]);

  /** 主动断开连接并停止自动重连（结束监控时使用） */
  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimerRef.current);
    clearTimeout(heartbeatRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setConnecting(false);
    pushLog("session ended by user");
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
    messageTotals,
    recentLimits: { utterances: recentUtteranceLimit, chats: recentChatLimit },
    connected, connecting, error,
    lastMessageAt, connectionAttempts, statusLog, reconnectNow, disconnect,
    mediaUrl,
    product: { name: "Live Product", brand: "Live Room", price: "--", stock: "--" },
  };
}