import { useEffect, useRef, useState } from "react";

/** 从任意形式输入提取纯数字房间ID */
function extractRoomId(input = "") {
  const text = decodeURIComponent((input || "").trim());
  if (!text) return "";
  if (/^\d{6,24}$/.test(text)) return text;
  try {
    const u = new URL(text);
    const q = u.searchParams.get("room_id") || u.searchParams.get("roomId") || u.searchParams.get("web_rid");
    if (q && /^\d{6,24}$/.test(q)) return q;
  } catch {}
  const m = text.match(/(?:live\.)?douyin\.com\/(\d{6,24})/i);
  if (m) return m[1];
  const d = text.match(/(\d{6,24})/);
  return d ? d[1] : "";
}

export default function VideoPlayer({ roomId: roomIdRaw, wsBase = "http://localhost:8011", isVisible = true }) {
  const roomId = extractRoomId(roomIdRaw || "");
  const videoRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const hlsRef = useRef(null);
  const wasVisibleRef = useRef(isVisible);

  // 获取直播流 URL
  useEffect(() => {
    if (!roomId) {
      setError("未提供房间ID");
      return;
    }

    const fetchMediaUrl = async () => {
      setLoading(true);
      setError(null);
      try {
        // 将 ws:// 转换为 http://, wss:// 转换为 https://
        let httpBase = wsBase;
        if (httpBase.startsWith("ws://")) {
          httpBase = httpBase.replace("ws://", "http://");
        } else if (httpBase.startsWith("wss://")) {
          httpBase = httpBase.replace("wss://", "https://");
        }
        
        const apiUrl = `${httpBase}/media-url?roomId=${encodeURIComponent(roomId)}`;
        console.log("Fetching media URL from:", apiUrl);
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          throw new Error(`获取直播流失败: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.url) {
          setVideoUrl(data.url);
          console.log("Got video URL:", data.url);
        } else {
          setError("未找到直播流URL");
        }
      } catch (err) {
        setError(err.message || "获取直播流出错");
        console.error("Error fetching media URL:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMediaUrl();
  }, [roomId, wsBase]);

  // 播放视频（支持 HLS 和 FLV）
  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;

    const video = videoRef.current;

    // 清理之前的 HLS 实例
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // 处理 HLS (m3u8) 格式
    if (videoUrl.includes(".m3u8")) {
      // 动态加载 HLS.js
      if (!window.Hls) {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
        script.onload = () => {
          initHls();
        };
        script.onerror = () => {
          setError("无法加载 HLS 播放器");
        };
        document.head.appendChild(script);
      } else {
        initHls();
      }

      function initHls() {
        if (window.Hls && window.Hls.isSupported()) {
          const hls = new window.Hls({
            enableWorker: true,
            lowLatencyMode: true,
            maxLoadingDelay: 4,
            maxBufferLength: 60,
          });
          hls.loadSource(videoUrl);
          hls.attachMedia(video);
          
          hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {
              // 自动播放失败，用户可手动点击播放
            });
          });

          hls.on(window.Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case window.Hls.ErrorTypes.NETWORK_ERROR:
                  setError("网络错误，尝试重新连接...");
                  hls.startLoad();
                  break;
                case window.Hls.ErrorTypes.MEDIA_ERROR:
                  setError("媒体错误");
                  hls.recoverMediaError();
                  break;
                default:
                  setError("播放错误");
                  break;
              }
            }
          });

          hlsRef.current = hls;
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          // Safari 原生 HLS 支持
          video.src = videoUrl;
          video.play().catch(() => {});
        } else {
          setError("您的浏览器不支持 HLS 直播");
        }
      }
    } 
    // 处理 FLV 格式
    else if (videoUrl.includes(".flv")) {
      // 动态加载 flv.js
      if (!window.flvjs) {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/flv.js@latest/dist/flv.min.js";
        script.onload = () => {
          initFlv();
        };
        script.onerror = () => {
          setError("无法加载 FLV 播放器");
        };
        document.head.appendChild(script);
      } else {
        initFlv();
      }

      function initFlv() {
        if (window.flvjs && window.flvjs.isSupported()) {
          const flvPlayer = window.flvjs.createPlayer({
            type: "flv",
            url: videoUrl,
            hasAudio: true,
            hasVideo: true,
          });
          flvPlayer.attachMediaElement(video);
          flvPlayer.load();
          flvPlayer.play().catch(() => {});

          window._flvPlayer = flvPlayer;
        } else {
          setError("您的浏览器不支持 FLV 直播");
        }
      }
    }
    // 处理其他格式（mp4 等）
    else {
      video.src = videoUrl;
      video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (window._flvPlayer) {
        window._flvPlayer.destroy();
        window._flvPlayer = null;
      }
    };
  }, [videoUrl]);

  // 处理可见性变化 - 隐藏时停止缓冲，显示时跳至直播边缘恢复播放
  useEffect(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    if (isVisible && !wasVisibleRef.current) {
      // 变为可见：重新加载并跳到直播最新边缘
      console.log("VideoPlayer: 变为可见，跳至直播边缘恢复播放");
      if (hlsRef.current) {
        // startLoad(-1) 让 HLS.js 从直播边缘开始重新加载，而非从暂停点
        hlsRef.current.startLoad(-1);
        video.play().catch((e) => console.log("VideoPlayer: play() 被拦截:", e));
      } else if (window._flvPlayer) {
        window._flvPlayer.play();
      } else {
        // 普通 src（mp4 等）：跳到末尾
        try {
          if (video.seekable && video.seekable.length > 0) {
            video.currentTime = video.seekable.end(video.seekable.length - 1);
          }
        } catch (_) {}
        video.play().catch(() => {});
      }
    } else if (!isVisible && wasVisibleRef.current) {
      // 变为隐藏：停止缓冲（节省带宽）但保留 HLS 实例不销毁
      console.log("VideoPlayer: 变为隐藏，停止缓冲");
      if (hlsRef.current) {
        hlsRef.current.stopLoad(); // 停止缓冲，保持实例
      }
      video.pause();
    }

    wasVisibleRef.current = isVisible;
  }, [isVisible]);

  return (
    <div style={{
      background: "var(--bg-secondary)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      opacity: isVisible ? 1 : 0.5,
      pointerEvents: isVisible ? "auto" : "none",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>📺 实时直播</span>
        {loading && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>加载中...</span>}
      </div>

      {/* Video Container */}
      <div style={{
        position: "relative",
        background: "#000",
        flex: 1,
        minHeight: 240,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}>
        {error && (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.8)",
            color: "#FF3366",
            zIndex: 10,
            padding: "20px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>⚠️ 直播流错误</div>
            <div style={{ fontSize: 12, color: "rgba(255,51,102,0.8)" }}>{error}</div>
          </div>
        )}

        {loading && !videoUrl && (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
            color: "#0096FF",
            zIndex: 10,
          }}>
            <div style={{
              width: 40,
              height: 40,
              border: "3px solid rgba(0,150,255,0.3)",
              borderTop: "3px solid #0096FF",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              marginBottom: 12,
            }} />
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
          <div style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            padding: "2px 8px",
            borderRadius: 4,
            background: "rgba(0,255,136,0.2)",
            color: "#00FF88",
            fontSize: 10,
            fontWeight: 600,
            border: "1px solid rgba(0,255,136,0.3)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}>
            <span style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "#00FF88",
              animation: "blink 1.2s infinite",
            }} />
            LIVE
          </div>
        )}
      </div>

      {/* Info */}
      {videoUrl && (
        <div style={{
          padding: "8px 14px",
          fontSize: 11,
          color: "var(--text-muted)",
          borderTop: "1px solid var(--border)",
          backgroundColor: "rgba(0,255,136,0.05)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>🔗 直播流: {videoUrl.includes(".m3u8") ? "HLS" : videoUrl.includes(".flv") ? "FLV" : "其他"}</span>
            <span>房间号: {roomId}</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
