import { useEffect, useMemo, useRef, useState } from "react";

function ensureScript(src, check) {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (check()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector(`script[data-sg-src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(check()), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.sgSrc = src;
    script.onload = () => resolve(check());
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

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
    && /^https?:\/\/(localhost|127\.0\.0\.1):8011$/i.test(backendBase);

  return useDevProxy ? "" : backendBase;
}

function toProxiedMediaUrl(rawUrl, apiBase) {
  if (!rawUrl) return null;
  return rawUrl.startsWith("http")
    ? `${apiBase}/douyin/media-proxy?url=${encodeURIComponent(rawUrl)}`
    : `${apiBase}${rawUrl}`;
}

function detectStreamKind(rawUrl = "") {
  const value = rawUrl.toLowerCase();
  if (value.includes(".m3u8") || value.includes("m3u8")) return "hls";
  if (value.includes(".flv") || value.includes("flv")) return "flv";
  return "native";
}

export default function VideoPlayer({
  roomId: roomIdRaw,
  wsBase = "http://localhost:8011",
  isVisible = true,
  mediaUrl: discoveredMediaUrl,
  isConnecting = false,
  connectionError = null,
  accessIssue = null,
  onReconnect,
  onAuthorizeDouyin,
}) {
  const roomId = extractRoomId(roomIdRaw || "");
  const apiBase = resolveApiBase(wsBase);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const flvRef = useRef(null);
  const wasVisibleRef = useRef(isVisible);
  const [loading, setLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);

  const streamKind = useMemo(() => detectStreamKind(discoveredMediaUrl || ""), [discoveredMediaUrl]);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      setPlaybackError(null);
      setVideoUrl(null);
      return;
    }

    if (discoveredMediaUrl === undefined) {
      setLoading(true);
      setPlaybackError(null);
      setVideoUrl(null);
      return;
    }

    setLoading(false);
    setPlaybackError(null);

    if (discoveredMediaUrl) {
      setVideoUrl(toProxiedMediaUrl(discoveredMediaUrl, apiBase));
      return;
    }

    setVideoUrl(null);
  }, [apiBase, discoveredMediaUrl, roomId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return undefined;

    setPlaybackError(null);
    let cancelled = false;

    const clearPlayers = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (flvRef.current) {
        flvRef.current.destroy();
        flvRef.current = null;
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    clearPlayers();

    const handlePlayable = () => {
      setPlaybackError(null);
    };
    video.addEventListener("loadeddata", handlePlayable);
    video.addEventListener("playing", handlePlayable);

    const playNative = () => {
      video.src = videoUrl;
      video.play().catch(() => {});
    };

    const setupPlayback = async () => {
      if (streamKind === "hls") {
        const ok = await ensureScript(
          "https://cdn.jsdelivr.net/npm/hls.js@latest",
          () => Boolean(window.Hls),
        );
        if (cancelled) return;
        if (!ok) {
          setPlaybackError("无法加载 HLS 播放器");
          return;
        }

        const Hls = window.Hls;
        if (!Hls?.isSupported?.()) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) {
            playNative();
          } else {
            setPlaybackError("当前浏览器不支持 HLS 播放");
          }
          return;
        }

        const hls = new Hls({
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 4,
        });
        hls.loadSource(videoUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setPlaybackError("直播流加载失败，请稍后重试");
            hls.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            setPlaybackError("HLS 解码失败，正在尝试恢复");
            hls.recoverMediaError();
            return;
          }
          setPlaybackError("HLS 播放初始化失败");
        });
        hlsRef.current = hls;
        return;
      }

      if (streamKind === "flv") {
        const ok = await ensureScript(
          "https://cdn.jsdelivr.net/npm/flv.js@latest/dist/flv.min.js",
          () => Boolean(window.flvjs),
        );
        if (cancelled) return;
        if (!ok) {
          setPlaybackError("无法加载 FLV 播放器");
          return;
        }

        const flvjs = window.flvjs;
        if (!flvjs?.isSupported?.()) {
          setPlaybackError("当前浏览器不支持 FLV 播放");
          return;
        }

        const player = flvjs.createPlayer(
          {
            type: "flv",
            url: videoUrl,
            isLive: true,
            hasAudio: true,
            hasVideo: true,
          },
          {
            enableWorker: false,
            stashInitialSize: 128,
            lazyLoad: false,
            fixAudioTimestampGap: false,
          },
        );
        player.attachMediaElement(video);
        player.load();
        player.play().catch(() => {});
        player.on(flvjs.Events.ERROR, (_type, detail) => {
          setPlaybackError(`FLV 播放失败: ${detail || "unknown error"}`);
        });
        flvRef.current = player;
        return;
      }

      playNative();
    };

    setupPlayback();

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", handlePlayable);
      video.removeEventListener("playing", handlePlayable);
      clearPlayers();
    };
  }, [streamKind, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isVisible && !wasVisibleRef.current) {
      if (hlsRef.current) {
        hlsRef.current.startLoad(-1);
      }
      if (flvRef.current) {
        flvRef.current.load();
        flvRef.current.play().catch(() => {});
      }
      video.play().catch(() => {});
    } else if (!isVisible && wasVisibleRef.current) {
      if (hlsRef.current) {
        hlsRef.current.stopLoad();
      }
      if (flvRef.current) {
        flvRef.current.pause();
      }
      video.pause();
    }

    wasVisibleRef.current = isVisible;
  }, [isVisible]);

  const displayError = accessIssue?.message || (!roomId
    ? "请输入有效的直播间 ID"
    : connectionError || playbackError || (discoveredMediaUrl === null ? "未能发现可播放的直播流" : null));

  return (
    <section
      className="sg-ui-panel sg-video-shell"
      style={{
        opacity: isVisible ? 1 : 0.5,
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      <header className="sg-ui-panel-head">
        <div>
          <div className="sg-ui-eyebrow">Live Stage</div>
          <h2>实时直播</h2>
        </div>

        <div className="sg-stream-head-meta">
          {(loading || isConnecting) && (
            <span className="sg-ui-status is-neutral">
              <i />
              连接中
            </span>
          )}
          {videoUrl && !displayError && (
            <span className="sg-ui-status is-success">
              <i />
              LIVE
            </span>
          )}
        </div>
      </header>

      <div className="sg-stream-stage">
        {displayError && (
          <div className="sg-video-overlay is-error">
            <div className="sg-video-overlay-title">直播连接异常</div>
            <div className="sg-video-overlay-copy">{displayError}</div>
            {typeof onReconnect === "function" && (
              <button className="sg-ui-button is-secondary" onClick={onReconnect} type="button">
                重新连接
              </button>
            )}
          </div>
        )}

        {(loading || isConnecting) && !videoUrl && !displayError && (
          <div className="sg-video-overlay is-loading">
            <div className="sg-video-spinner" />
            <div className="sg-video-overlay-copy">正在发现直播流...</div>
          </div>
        )}

        <video
          ref={videoRef}
          className="sg-stream-stage-video"
          controls
          autoPlay
          muted
          playsInline
          crossOrigin="anonymous"
        />
      </div>

      {videoUrl && (
        <div className="sg-video-meta-bar">
          <span>流类型 {streamKind === "hls" ? "HLS" : streamKind === "flv" ? "FLV" : "Native"}</span>
          <span className="mono">房间 {roomId}</span>
        </div>
      )}
    </section>
  );
}
