import { useState, useEffect, useCallback, useRef } from "react";

const BASE_RISK = [
  { subject: "Price Transparency",  value: 70 },
  { subject: "Pressure Level",      value: 40 },
  { subject: "Accuracy",            value: 65 },
  { subject: "Urgency",             value: 50 },
  { subject: "Evidence",            value: 70 },
  { subject: "Compliance",          value: 72 },
];

const EMPTY_STATS = { total: 0, trap: 0, hype: 0, fact: 0, p0: 0, p1: 0, p2: 0, p3: 0, evidence: 0 };

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, num));
}

function ragLevelToType(level, fallback = "fact") {
  if (level === "P0" || level === "P1") return "trap";
  if (level === "P2") return "hype";
  if (level === "P3") return "fact";
  return fallback;
}

function buildRiskTargets(item) {
  const ss = item.sub_scores || {};
  const ragRisk = item.rag_risk || {};
  const factors = ragRisk.factors || {};
  const coverage = item.rag_verification?.requirement_coverage || {};
  const requirementKeys = Object.keys(coverage);
  const coverageRatio = requirementKeys.length
    ? requirementKeys.filter((key) => coverage[key]).length / requirementKeys.length
    : clamp01(ss.fact_verification, 0.5);
  const claimTypes = item.rag_claim_types || [];
  const pressureRisk = Math.max(
    clamp01(factors.chat_questioning, clamp01(ss.subjectivity_index, 0.2)),
    claimTypes.includes("pressure_claim") ? 0.92 : 0,
    claimTypes.includes("scarcity_claim") ? 0.78 : 0,
  );
  const ruleSeverity = clamp01(factors.rule_severity, 1 - clamp01(ss.compliance_score, 0.5));
  const claimRisk = clamp01(factors.claim_risk, 1 - clamp01(ss.semantic_consistency, 0.5));
  const conflictRisk = clamp01(factors.evidence_conflict, 0);
  return {
    "Price Transparency": Math.round(clamp01(1 - ruleSeverity) * 100),
    "Pressure Level": Math.round(pressureRisk * 100),
    Accuracy: Math.round(clamp01(1 - claimRisk) * 100),
    Urgency: Math.round(pressureRisk * 100),
    Evidence: Math.round(clamp01(coverageRatio) * 100),
    Compliance: Math.round(clamp01(1 - Math.max(ruleSeverity, conflictRisk)) * 100),
  };
}

function normalizeUtteranceMessage(msg) {
  const ragClaims = Array.isArray(msg.rag_claims) ? msg.rag_claims : [];
  const ragEvidence = Array.isArray(msg.rag_evidence) ? msg.rag_evidence : [];
  const ragVerification = msg.rag_verification && typeof msg.rag_verification === "object" ? msg.rag_verification : null;
  const ragRisk = msg.rag_risk && typeof msg.rag_risk === "object" ? msg.rag_risk : null;
  const ragReport = msg.rag_report && typeof msg.rag_report === "object" ? msg.rag_report : null;
  const ragTrace = Array.isArray(msg.rag_trace) ? msg.rag_trace : [];
  const ragLevel = ragRisk?.level || null;
  const ragClaimTypes = ragClaims.flatMap((claim) => claim?.claim_type || []);
  const preferredType = ragLevelToType(ragLevel, msg.type || "fact");
  const ragRiskScore = ragRisk ? clamp01(ragRisk.score) : null;
  const preferredScore = ragRiskScore == null ? clamp01(msg.score, 0.5) : clamp01(1 - ragRiskScore);
  const verificationReason = ragVerification?.reason || "";
  const primarySuggestion = ragReport?.suggestions?.[0] || msg.suggestion || verificationReason || "";
  const requirementCoverage = ragVerification?.requirement_coverage || {};
  const requirementKeys = Object.keys(requirementCoverage);
  const requirementCoverageRatio = requirementKeys.length
    ? requirementKeys.filter((key) => requirementCoverage[key]).length / requirementKeys.length
    : clamp01(msg.sub_scores?.fact_verification, 0.5);
  const subScores = {
    semantic_consistency: clamp01(1 - clamp01(ragRisk?.factors?.claim_risk, 1 - clamp01(msg.sub_scores?.semantic_consistency, 0.5))),
    fact_verification: clamp01(requirementCoverageRatio),
    compliance_score: clamp01(1 - clamp01(ragRisk?.factors?.rule_severity, 1 - clamp01(msg.sub_scores?.compliance_score, 0.5))),
    subjectivity_index: Math.max(
      clamp01(ragRisk?.factors?.chat_questioning, clamp01(msg.sub_scores?.subjectivity_index, 0.2)),
      ragClaimTypes.includes("pressure_claim") ? 0.92 : 0,
      ragClaimTypes.includes("scarcity_claim") ? 0.78 : 0,
    ),
    rag_risk_score: ragRiskScore == null ? clamp01(msg.sub_scores?.rag_risk_score, 1 - preferredScore) : ragRiskScore,
    historical_similarity: clamp01(ragRisk?.factors?.historical_similarity, clamp01(msg.sub_scores?.historical_similarity, 0)),
  };

  return {
    uid: msg.id,
    id: msg.id,
    text: msg.text,
    display_text: msg.display_text || msg.text,
    type: preferredType,
    score: preferredScore,
    timestamp: msg.timestamp,
    source: msg.source,
    raw_text: msg.text,
    keywords: msg.keywords || [],
    violations: msg.violations?.length ? msg.violations : ragClaimTypes,
    suggestion: primarySuggestion,
    sub_scores: subScores,
    engine: msg.engine,
    rag_claims: ragClaims,
    rag_claim_types: ragClaimTypes,
    rag_evidence: ragEvidence,
    rag_verification: ragVerification,
    rag_risk: ragRisk,
    rag_report: ragReport,
    rag_trace: ragTrace,
    rag_level: ragLevel,
    evidence_count: ragEvidence.length,
    requirement_coverage_ratio: requirementCoverageRatio,
  };
}

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
  const [rationalityIndex, setRationalityIndex] = useState(70);
  const [riskData,         setRiskData]         = useState(BASE_RISK);
  const [alerts,           setAlerts]           = useState([]);
  const [viewerCount,      setViewerCount]      = useState(0);
  const [showGate,         setShowGate]         = useState(false);
  const [isPaused,         setIsPaused]         = useState(false);
  const [sessionStats,     setSessionStats]     = useState(EMPTY_STATS);
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
      backoffRef.current = 1000; // 连接成功后重置 backoff
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
          pushLog(`媒体流地址已就绪: ${url.slice(0, 60)}...`);
        } else {
          pushLog("未能找到媒体流（可能未开播或受到反爬限制）");
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
        const item = normalizeUtteranceMessage(msg);
        setUtterances(prev => {
          if (prev.some(u => u.id === item.id)) return prev;
          return [item, ...prev].slice(0, recentUtteranceLimit);
        });
        setRationalityIndex(prev => {
          const target = item.rag_risk
            ? Math.round((1 - clamp01(item.rag_risk.score, 0.5)) * 100)
            : Math.round(clamp01(item.score, 0.5) * 100);
          const base = Number.isFinite(prev) ? prev : 70;
          return Math.max(15, Math.min(95, Math.round(base * 0.72 + target * 0.28)));
        });
        setRiskData(prev => {
          const targets = buildRiskTargets(item);
          return prev.map(d => ({
            ...d,
            value: Math.round(d.value * 0.65 + (targets[d.subject] ?? d.value) * 0.35),
          }));
        });
        setSessionStats(prev => ({
          total: prev.total + 1,
          trap: prev.trap + (item.type === "trap" ? 1 : 0),
          hype: prev.hype + (item.type === "hype" ? 1 : 0),
          fact: prev.fact + (item.type === "fact" ? 1 : 0),
          p0: prev.p0 + (item.rag_level === "P0" ? 1 : 0),
          p1: prev.p1 + (item.rag_level === "P1" ? 1 : 0),
          p2: prev.p2 + (item.rag_level === "P2" ? 1 : 0),
          p3: prev.p3 + (item.rag_level === "P3" ? 1 : 0),
          evidence: prev.evidence + (item.evidence_count || 0),
        }));
        setMessageTotals(prev => ({
          utterances: prev.utterances + 1,
          chats: prev.chats,
          total: prev.total + 1,
        }));
        if (item.type === "trap") {
          alertId.current++;
          const id = alertId.current;
          setAlerts(prev => [
            {
              id,
              text: item.display_text || item.text,
              score: item.score,
              utteranceId: item.id,
              timestamp: item.timestamp,
              level: item.rag_level || "P1",
              reason: item.rag_verification?.reason || item.suggestion || "",
              evidenceCount: item.evidence_count || 0,
            },
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
              sentiment_icon: msg.sentiment_icon || "",
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
    setRationalityIndex(70);
    setRiskData(BASE_RISK);
    setAlerts([]);
    setViewerCount(0);
    setSessionStats(EMPTY_STATS);
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

  /** 主动断开连接并停止自动重连，结束监控时使用。 */
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
      "", `Stats: total=${stats.total} fact=${stats.fact} hype=${stats.hype} trap=${stats.trap} p0=${stats.p0 || 0} p1=${stats.p1 || 0} p2=${stats.p2 || 0} evidence=${stats.evidence || 0}`,
      "", "Utterances:",
      ...uList.map((u,i) => `  [${i+1}] [${(u.rag_level || u.type || "?").toUpperCase()}] ${u.text} | score:${u.score} | evidence:${u.evidence_count || 0}`),
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


