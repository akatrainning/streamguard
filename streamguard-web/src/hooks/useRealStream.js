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
  wsBase = "ws://localhost:8012",
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
  const [mediaUrl,         setMediaUrl]         = useState(undefined);
  const [roomIdentity,     setRoomIdentity]     = useState({
    roomTitle: "",
    anchorName: "",
    avatarUrl: "",
    thumbnailUrl: "",
  });

  const wsRef       = useRef(null);
  const alertId     = useRef(0);
  const chatIdRef   = useRef(0);
  const isPausedRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const backoffRef  = useRef(1000);   // 鍒濆1s锛屾寚鏁板闀胯嚦30s
  const heartbeatRef = useRef(null);  // 蹇冭烦瀹氭椂鍣?
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
    setMediaUrl(undefined);
    setRoomIdentity({
      roomTitle: "",
      anchorName: "",
      avatarUrl: "",
      thumbnailUrl: "",
    });
    pushLog(`connecting -> ${url}`);

    // 娓呯悊鏃ц繛鎺ュ拰蹇冭烦
    clearTimeout(heartbeatRef.current);
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.onclose = null; // 闃叉瑙﹀彂鏃nclose鐨勯噸杩?
      wsRef.current.close();
    }
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setConnecting(false);
      setError(null);
      backoffRef.current = 1000; // 杩炴帴鎴愬姛鍚庨噸缃産ackoff
      pushLog("websocket connected");
      console.log("[StreamGuard] WebSocket connected:", url);
      // 蹇冭烦妫€娴嬶細45s娌℃湁鏀跺埌娑堟伅灏变富鍔ㄩ噸杩?
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
      ws._scheduleHeartbeat = scheduleHeartbeat; // 姣忔敹鍒版秷鎭埛鏂?
    };

    ws.onmessage = (event) => {
      if (isPausedRef.current) return;
      setLastMessageAt(Date.now());
      // 閲嶇疆蹇冭烦璁℃椂鍣?
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
          pushLog(`濯掍綋娴佸湴鍧€宸插氨缁? ${url.slice(0, 60)}...`);
        } else {
          pushLog("鏈兘鎵惧埌濯掍綋娴侊紙鍙兘鏈紑鎾垨鏈夊弽鐖檺鍒讹級");
        }
        return;
      }

      if (msg.event === "room_identity_discovered") {
        setRoomIdentity({
          roomTitle: msg.room_title || "",
          anchorName: msg.anchor_name || "",
          avatarUrl: msg.avatar_url || msg.thumbnail_url || "",
          thumbnailUrl: msg.thumbnail_url || msg.avatar_url || "",
        });
        if (msg.anchor_name || msg.room_title) {
          pushLog(`room identity synced: ${msg.anchor_name || msg.room_title}`);
        }
        return;
      }

      if (msg.event === "utterance") {
        const item = {
          uid: msg.id, id: msg.id,
          text: msg.text,                           // 鍘熷杞啓锛堝睍寮€鍖烘樉绀猴級
          display_text: msg.display_text || msg.text, // 鏁寸悊鍚庢枃鏈紙涓昏灞曠ず锛?
          type: msg.type,
          score: msg.score, timestamp: msg.timestamp,
          source: msg.source,
          raw_text: msg.text,                       // 淇濈暀鍘熷澶囩敤
          keywords: msg.keywords || [],
          violations: msg.violations || [],
          suggestion: msg.suggestion || "",
          sub_scores: msg.sub_scores || {},
          engine: msg.engine,
        };
        setUtterances(prev => {
          // 鍘婚噸锛氬鏋?ID 宸插瓨鍦ㄥ垯璺宠繃锛堥槻姝?WebSocket 閲嶈繛瀵艰嚧閲嶅娑堟伅锛?
          if (prev.some(u => u.id === item.id)) return prev;
          return [item, ...prev].slice(0, recentUtteranceLimit);
        });
        setRationalityIndex(prev => {
          const delta = msg.type === "trap" ? -8 : msg.type === "hype" ? -3 : +4;
          return Math.max(15, Math.min(95, prev + delta));
        });
        setRiskData(prev => {
          const ss = msg.sub_scores || {};
          // 鏍规嵁 type 鎺ㄧ畻绱ц揩搴︼細trap=楂樺帇 hype=涓?fact=浣?
          const urgencyVal = msg.type === "trap" ? 88 : msg.type === "hype" ? 55 : 18;
          const targets = {
            "Price Transparency": Math.round((msg.score ?? 0.5) * 100),
            "Pressure Level":    Math.round((ss.subjectivity_index ?? 0.5) * 100),
            "Accuracy":          Math.round((ss.semantic_consistency ?? 0.5) * 100),
            "Urgency":           urgencyVal,
            "Evidence":          Math.round((ss.fact_verification ?? 0.5) * 100),
            "Compliance":        Math.round((ss.compliance_score ?? 0.5) * 100),
          };
          // EMA 骞虫粦 伪=0.35锛岄伩鍏嶅浘琛ㄨ烦鍔ㄨ繃澶?
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
        const fallbackId = `${Date.now()}-${chatIdRef.current++}`;
        const chatId = msg.id ?? fallbackId;
        setChatMessages(prev => {
          // 鍘婚噸锛氬鏋?ID 宸插瓨鍦ㄥ垯璺宠繃
          if (msg.id && prev.some(c => c.id === chatId)) return prev;
          return [
            {
              id: String(chatId),
              user: msg.user,
              text: msg.text,
              timestamp: msg.timestamp,
              // 淇濈暀鍚庣璇箟鍒嗘瀽瀛楁锛堜緵LiveStreamPanel鎯呮劅/鎰忓浘鍙鍖栦娇鐢級
              sentiment:      msg.sentiment      || "neutral",
              intent:         msg.intent         || "other",
              flags:          msg.flags          || [],
              risk_score:     msg.risk_score     || 0,
              label:          msg.label          || "普通弹幕",
              sentiment_icon: msg.sentiment_icon || "馃槓",
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
        backoffRef.current = Math.min(delay * 2, 30000); // 鏈€闀?0s
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
        wsRef.current.onclose = null; // 闃叉瑙﹀彂閲嶈繛
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
    setMediaUrl(undefined);
    setRoomIdentity({
      roomTitle: "",
      anchorName: "",
      avatarUrl: "",
      thumbnailUrl: "",
    });
  }, []);

  const reconnectNow = useCallback(() => {
    backoffRef.current = 1000; // 鎵嬪姩閲嶈繛閲嶇疆backoff
    pushLog("manual reconnect requested");
    setReconnectToken(v => v + 1);
  }, [pushLog]);

  /** 涓诲姩鏂紑杩炴帴骞跺仠姝㈣嚜鍔ㄩ噸杩烇紙缁撴潫鐩戞帶鏃朵娇鐢級 */
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
    roomTitle: roomIdentity.roomTitle,
    anchorName: roomIdentity.anchorName,
    avatarUrl: roomIdentity.avatarUrl,
    thumbnailUrl: roomIdentity.thumbnailUrl,
    product: { name: "Live Product", brand: "Live Room", price: "--", stock: "--" },
  };
}


