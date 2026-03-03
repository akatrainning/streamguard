/**
 * LiveVideoPlayer
 * ─────────────────────────────────────────────────────────────────
 * 直播视频播放 + 实时转写馈送
 *
 * 工作流程：
 *  1. 后端 _audio_loop 发现 m3u8/flv 地址 → 推送 media_url_discovered 事件
 *  2. useRealStream 接收事件并把 mediaUrl 传入此组件
 *  3. 组件用 hls.js 直接在浏览器内播放（需后端流允许跨域，否则退回"外部观看"链接）
 *  4. 下方滚动显示来自音频转写的 utterances（source === "audio"）
 *
 * 在 mock 模式下，直接展示模拟转写馈送。
 */
import { useEffect, useRef, useState, useMemo } from "react";
import Hls from "hls.js";

const TYPE_COLOR = {
  fact: "#00FF88",
  hype: "#FFD700",
  trap: "#FF3366",
};

function TranscriptItem({ item }) {
  const color = TYPE_COLOR[item.type] || "var(--text-secondary)";
  const isRisk = item.type === "trap" || item.type === "hype";
  const keywords = Array.isArray(item.keywords) ? item.keywords : [];
  return (
    <div style={{
      padding: "6px 10px",
      borderRadius: 6,
      marginBottom: 4,
      borderLeft: `3px solid ${color}`,
      background: isRisk ? `${color}0d` : "transparent",
      transition: "background 0.3s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
        <span style={{
          fontSize: 9, padding: "1px 5px", borderRadius: 4, fontWeight: 700,
          background: `${color}22`, color, border: `1px solid ${color}44`,
        }}>
          {item.type?.toUpperCase() || "ASR"}
        </span>
        <span className="mono" style={{ fontSize: 9, color: "var(--text-muted)" }}>
          {item.score !== undefined ? (item.score * 100).toFixed(0) + "分" : ""}
        </span>
        <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>
          {item.timestamp}
        </span>
      </div>
      {/* 润色后的展示文本 */}
      <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.6 }}>
        {item.text}
      </div>
      {/* 关键词标签 */}
      {keywords.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
          {keywords.map((kw, i) => (
            <span key={i} style={{
              fontSize: 9, padding: "1px 7px", borderRadius: 10, fontWeight: 600,
              background: `${color}18`, color, border: `1px solid ${color}38`,
            }}>
              {kw}
            </span>
          ))}
        </div>
      )}
      {/* 原始转写（折叠提示，用于调试） */}
      {item.raw_text && item.raw_text !== item.text && (
        <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4, opacity: 0.6 }}>
          原文: {item.raw_text.slice(0, 60)}{item.raw_text.length > 60 ? "…" : ""}
        </div>
      )}
    </div>
  );
}

/**
 * HLS 视频播放器核心
 * 如果 hls.js 不支持当前浏览器（Safari 原生支持 HLS）也能正常播放
 */
function HLSVideoCore({ src, onPlayError }) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);

  useEffect(() => {
    if (!src || !videoRef.current) return;
    const video = videoRef.current;

    // Safari 原生支持 HLS
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.load();
      return;
    }

    // Chrome/Firefox: 使用 hls.js
    import("hls.js").then(({ default: Hls }) => {
      if (!Hls.isSupported()) {
        onPlayError?.("当前浏览器不支持 HLS 播放");
        return;
      }
      if (hlsRef.current) hlsRef.current.destroy();
      const hls = new Hls({
        lowLatencyMode: true,
        enableWorker: false,
        maxBufferLength: 15,
        liveSyncDurationCount: 2,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          onPlayError?.(data.type === "networkError" ? "网络错误（流可能已关闭或有跨域限制）" : "播放器错误");
          hls.destroy();
        }
      });
    }).catch(() => {
      onPlayError?.("hls.js 模块加载失败");
    });

    return () => { hlsRef.current?.destroy(); };
  }, [src, onPlayError]);

  return (
    <video
      ref={videoRef}
      autoPlay muted controls
      style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
      playsInline
    />
  );
}

export default function LiveVideoPlayer({
  roomId,
  mediaUrl,
  utterances = [],
  isConnected = false,
  dataSource = "mock",
  apiBase = "http://localhost:8010",   // 新增：用于构造代理 URL
}) {
  const [playError, setPlayError] = useState(null);
  const [showVideo, setShowVideo] = useState(true);
  const feedRef = useRef(null);

  const roomUrl = roomId ? `https://live.douyin.com/${roomId}` : null;

  // 仅展示来自音频转写的 utterances（source === "audio"）
  const audioUtterances = useMemo(
    () => utterances.filter(u => u.source === "audio"),
    [utterances]
  );

  // 构造最终播放 src：
  //   - 本地 HLS 路径 (/hls/...)  → 直接拼 apiBase，无 CORS/过期问题（最优）
  //   - 外部 URL               → 走后端代理（备用）
  const proxiedSrc = useMemo(() => {
    if (!mediaUrl) return null;
    if (mediaUrl.startsWith("/hls/")) {
      // 本地 HLS 中继，直接访问无跨域问题
      return `${apiBase}${mediaUrl}`;
    }
    // 外部 URL 通过代理服务（处理 CORS / Referer）
    return `${apiBase}/douyin/hls-proxy?url=${encodeURIComponent(mediaUrl)}`;
  }, [mediaUrl, apiBase]);

  // mediaUrl 变化时重置播放错误（例如流刷新了）
  useEffect(() => { setPlayError(null); }, [mediaUrl]);

  // 新增转写条目时自动滚动到顶部
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [audioUtterances.length]);

  // 媒体流状态
  const streamStatus = !isConnected
    ? "disconnected"
    : mediaUrl === undefined
    ? "waiting"
    : mediaUrl === null
    ? "not_found"
    : "ready";

  const videoArea = () => {
    if (!showVideo) return null;

    if (dataSource === "mock") {
      return (
        <div style={placeholderStyle}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎬</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>模拟数据模式</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
            转写馈送由下方模拟数据驱动
          </div>
        </div>
      );
    }

    if (streamStatus === "disconnected") {
      return (
        <div style={placeholderStyle}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔌</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>等待连接直播间…</div>
        </div>
      );
    }

    if (streamStatus === "waiting") {
      return (
        <div style={placeholderStyle}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>
            <span style={{ animation: "blink 1.4s infinite", display: "inline-block" }}>⏳</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>正在发现直播媒体流…</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
            约需 15-30 秒（首次启动 Selenium）
          </div>
          {roomUrl && (
            <a href={roomUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
              🔗 同时在浏览器中打开直播间
            </a>
          )}
        </div>
      );
    }

    if (streamStatus === "not_found") {
      return (
        <div style={placeholderStyle}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📺</div>
          <div style={{ fontSize: 12, color: "var(--hype)" }}>未能提取媒体流</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
            直播间可能已下线，或存在反爬验证
          </div>
          {roomUrl && (
            <a href={roomUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
              🔗 在浏览器中查看直播间
            </a>
          )}
        </div>
      );
    }

    // streamStatus === "ready"
    if (playError) {
      return (
        <div style={placeholderStyle}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 11, color: "var(--hype)", marginBottom: 8 }}>
            {playError}
          </div>
          <a href={roomUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            🔗 在浏览器中观看（推荐）
          </a>
          <button
            onClick={() => { setPlayError(null); }}
            style={{ ...linkStyle, background: "var(--bg-tertiary)", border: "1px solid var(--border)",
              borderRadius: 5, padding: "4px 12px", cursor: "pointer", marginTop: 8 }}
          >
            🔄 重试嵌入播放
          </button>
        </div>
      );
    }

    return (
      <div style={{ width: "100%", aspectRatio: "16/9", position: "relative", background: "#000", borderRadius: 6, overflow: "hidden" }}>
        {/* proxiedSrc 经后端代理，携带正确 CORS 头 */}
        <HLSVideoCore src={proxiedSrc} onPlayError={setPlayError} />
        {/* 右上角外部链接 */}
        {roomUrl && (
          <a
            href={roomUrl} target="_blank" rel="noopener noreferrer"
            style={{
              position: "absolute", top: 6, right: 6,
              padding: "3px 8px", borderRadius: 4,
              background: "rgba(0,0,0,0.6)", color: "#fff",
              fontSize: 10, textDecoration: "none",
            }}
          >
            ↗ 新标签页
          </a>
        )}
      </div>
    );
  };

  return (
    <div style={{
      background: "var(--bg-secondary)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* 标题栏 */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>直播观看 + 实时转写</span>
          {isConnected && dataSource !== "mock" && (
            <span style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: 4,
              background: "var(--trap-bg)", fontSize: 10, fontWeight: 600, color: "var(--trap)",
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%",
                background: "var(--trap)", animation: "blink 1.2s infinite" }} />
              LIVE
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {audioUtterances.length > 0 && (
            <span style={{ fontSize: 10, color: "#0096FF" }}>
              🎤 {audioUtterances.length} 段转写
            </span>
          )}
          <button
            onClick={() => setShowVideo(v => !v)}
            style={{
              padding: "2px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer",
              background: "var(--bg-tertiary)", border: "1px solid var(--border)",
              color: "var(--text-muted)",
            }}
          >
            {showVideo ? "隐藏视频" : "显示视频"}
          </button>
        </div>
      </div>

      {/* 视频区域 */}
      {showVideo && (
        <div style={{ padding: "10px 12px 0" }}>
          {videoArea()}
        </div>
      )}

      {/* 实时转写馈送 */}
      <div style={{ flex: 1, padding: "10px 12px" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 6,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            🎤 主播话术实时转写
          </span>
          {audioUtterances.length === 0 && isConnected && streamStatus === "ready" && (
            <span style={{ fontSize: 9, color: "var(--text-muted)", animation: "blink 2s infinite" }}>
              等待下一窗口…
            </span>
          )}
        </div>

        <div
          ref={feedRef}
          style={{
            height: showVideo ? 180 : 440,
            overflowY: "auto",
            transition: "height 0.3s",
          }}
        >
          {audioUtterances.length === 0 ? (
            <div style={{ textAlign: "center", paddingTop: 30, fontSize: 12, color: "var(--text-muted)" }}>
              {dataSource === "mock" ? (
                <div>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🔇</div>
                  模拟模式下无音频转写<br />
                  <span style={{ fontSize: 10, opacity: 0.7 }}>切换到抖音数据源后自动开始</span>
                </div>
              ) : isConnected ? (
                <div>
                  <div style={{ fontSize: 24, marginBottom: 8, animation: "blink 2s infinite" }}>🎤</div>
                  <div style={{ fontSize: 11 }}>连续转写已启动</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                    每 15 秒产出一段，首次约需 30s
                  </div>
                </div>
              ) : (
                <div>连接直播间后自动开始转写</div>
              )}
            </div>
          ) : (
            audioUtterances.map(item => (
              <TranscriptItem key={item.id || item.uid} item={item} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 样式常量 ─────────────────────────────────────────────────
const placeholderStyle = {
  width: "100%",
  aspectRatio: "16/9",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--bg-tertiary)",
  borderRadius: 6,
  border: "1px dashed var(--border)",
  color: "var(--text-muted)",
  fontSize: 12,
  gap: 4,
};

const linkStyle = {
  marginTop: 10,
  color: "#0096FF",
  fontSize: 11,
  textDecoration: "none",
  display: "inline-block",
};
