import { useEffect, useRef, useState } from "react";

function extractRoomId(input = "") {
  const text = decodeURIComponent((input || "").trim());
  if (!text) return "";
  if (/^\d{6,24}$/.test(text)) return text;

  try {
    const parsed = new URL(text);
    const queryRoomId =
      parsed.searchParams.get("room_id")
      || parsed.searchParams.get("roomId")
      || parsed.searchParams.get("web_rid");
    if (queryRoomId && /^\d{6,24}$/.test(queryRoomId)) return queryRoomId;
  } catch {
    // Ignore malformed URLs and fall back to digit extraction.
  }

  const urlMatch = text.match(/(?:live\.)?douyin\.com\/(\d{6,24})/i);
  if (urlMatch) return urlMatch[1];

  const digitMatch = text.match(/(\d{6,24})/);
  return digitMatch ? digitMatch[1] : "";
}

function resolveApiBase(wsBase) {
  let httpBase = wsBase;
  if (httpBase.startsWith("ws://")) {
    httpBase = httpBase.replace("ws://", "http://");
  } else if (httpBase.startsWith("wss://")) {
    httpBase = httpBase.replace("wss://", "https://");
  }

  const backendBase = httpBase.replace(/\/$/, "");
  const useDevProxy =
    typeof window !== "undefined"
    && ["localhost", "127.0.0.1"].includes(window.location.hostname)
    && /^https?:\/\/(localhost|127\.0\.0\.1):8012$/i.test(backendBase);

  return useDevProxy ? "" : backendBase;
}

function toProxiedMediaUrl(rawUrl, apiBase) {
  if (!rawUrl) return null;
  return rawUrl.startsWith("http")
    ? `${apiBase}/douyin/media-proxy?url=${encodeURIComponent(rawUrl)}`
    : `${apiBase}${rawUrl}`;
}

export default function VideoPlayer({
  roomId: roomIdRaw,
  wsBase = "http://localhost:8012",
  isVisible = true,
  mediaUrl: discoveredMediaUrl,
}) {
  const roomId = extractRoomId(roomIdRaw || "");
  const apiBase = resolveApiBase(wsBase);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const flvRef = useRef(null);
  const wasVisibleRef = useRef(isVisible);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);

  useEffect(() => {
    if (!roomId) {
      setError("未提供直播间 ID");
      setLoading(false);
      setVideoUrl(null);
      return;
    }

    if (discoveredMediaUrl === undefined) {
      setLoading(true);
      setError(null);
      setVideoUrl(null);
      return;
    }

    setLoading(false);
    if (discoveredMediaUrl) {
      setError(null);
      setVideoUrl(toProxiedMediaUrl(discoveredMediaUrl, apiBase));
      return;
    }

    setVideoUrl(null);
    setError("未找到直播流 URL");
  }, [apiBase, discoveredMediaUrl, roomId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return undefined;

    setError(null);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (flvRef.current) {
      flvRef.current.destroy();
      flvRef.current = null;
    }

    const playNative = () => {
      video.src = videoUrl;
      video.play().catch(() => {});
    };

    const ensureScript = (src, check, onReady, onFail) => {
      if (check()) {
        onReady();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => {
        if (check()) onReady();
        else onFail();
      };
      script.onerror = onFail;
      document.head.appendChild(script);
    };

    const setupHls = () => {
      if (!(window.Hls && window.Hls.isSupported())) {
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          playNative();
        } else {
          setError("当前浏览器不支持 HLS 直播");
        }
        return;
      }

      const hls = new window.Hls({
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 4,
      });
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(window.Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          setError("网络错误，正在尝试恢复直播流");
          hls.startLoad();
          return;
        }
        if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          setError("媒体解码错误");
          hls.recoverMediaError();
          return;
        }
        setError("视频播放失败");
      });
      hlsRef.current = hls;
    };

    const setupFlv = () => {
      if (!(window.flvjs && window.flvjs.isSupported())) {
        setError("当前浏览器不支持 FLV 直播");
        return;
      }

      const flvPlayer = window.flvjs.createPlayer({
        type: "flv",
        url: videoUrl,
        hasAudio: true,
        hasVideo: true,
      });
      flvPlayer.attachMediaElement(video);
      flvPlayer.load();
      flvPlayer.play().catch(() => {});
      flvRef.current = flvPlayer;
    };

    if (videoUrl.includes(".m3u8")) {
      ensureScript(
        "https://cdn.jsdelivr.net/npm/hls.js@latest",
        () => Boolean(window.Hls),
        setupHls,
        () => setError("无法加载 HLS 播放器"),
      );
    } else if (videoUrl.includes(".flv")) {
      ensureScript(
        "https://cdn.jsdelivr.net/npm/flv.js@latest/dist/flv.min.js",
        () => Boolean(window.flvjs),
        setupFlv,
        () => setError("无法加载 FLV 播放器"),
      );
    } else {
      playNative();
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (flvRef.current) {
        flvRef.current.destroy();
        flvRef.current = null;
      }
    };
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isVisible && !wasVisibleRef.current) {
      if (hlsRef.current) {
        hlsRef.current.startLoad(-1);
      }
      video.play().catch(() => {});
    } else if (!isVisible && wasVisibleRef.current) {
      if (hlsRef.current) {
        hlsRef.current.stopLoad();
      }
      video.pause();
    }

    wasVisibleRef.current = isVisible;
  }, [isVisible]);

  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        opacity: isVisible ? 1 : 0.5,
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>实时直播</span>
        {loading && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>正在发现直播流...</span>}
      </div>

      <div
        style={{
          position: "relative",
          background: "#000",
          flex: 1,
          minHeight: 240,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0, 0, 0, 0.8)",
              color: "#ff4d6d",
              zIndex: 10,
              padding: 20,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>直播流错误</div>
            <div style={{ fontSize: 12, color: "rgba(255, 77, 109, 0.9)" }}>{error}</div>
          </div>
        )}

        {loading && !videoUrl && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0, 0, 0, 0.65)",
              color: "#4da3ff",
              zIndex: 10,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                border: "3px solid rgba(77, 163, 255, 0.3)",
                borderTop: "3px solid #4da3ff",
                borderRadius: "50%",
                animation: "sg-spin 1s linear infinite",
                marginBottom: 12,
              }}
            />
            <div style={{ fontSize: 12 }}>正在连接直播...</div>
          </div>
        )}

        <video
          ref={videoRef}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            background: "#000",
          }}
          controls
          crossOrigin="anonymous"
        />

        {videoUrl && !error && (
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(0, 255, 136, 0.18)",
              color: "#00ff88",
              fontSize: 10,
              fontWeight: 600,
              border: "1px solid rgba(0, 255, 136, 0.28)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#00ff88",
                animation: "sg-blink 1.2s infinite",
              }}
            />
            LIVE
          </div>
        )}
      </div>

      {videoUrl && (
        <div
          style={{
            padding: "8px 14px",
            fontSize: 11,
            color: "var(--text-muted)",
            borderTop: "1px solid var(--border)",
            backgroundColor: "rgba(0, 255, 136, 0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>直播流: {videoUrl.includes(".m3u8") ? "HLS" : videoUrl.includes(".flv") ? "FLV" : "其他"}</span>
            <span>房间号: {roomId}</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes sg-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes sg-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0.45; }
        }
      `}</style>
    </div>
  );
}
