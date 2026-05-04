/**
 * LiveVideoPlayer
 * 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
 * 鐩存挱瑙嗛鎾斁 + 瀹炴椂杞啓棣堥€?
 *
 * 宸ヤ綔娴佺▼锛?
 *  1. 鍚庣 _audio_loop 鍙戠幇 m3u8/flv 鍦板潃 鈫?鎺ㄩ€?media_url_discovered 浜嬩欢
 *  2. useRealStream 鎺ユ敹浜嬩欢骞舵妸 mediaUrl 浼犲叆姝ょ粍浠?
 *  3. 缁勪欢鐢?hls.js 鐩存帴鍦ㄦ祻瑙堝櫒鍐呮挱鏀撅紙闇€鍚庣娴佸厑璁歌法鍩燂紝鍚﹀垯閫€鍥?澶栭儴瑙傜湅"閾炬帴锛?
 *  4. 涓嬫柟婊氬姩鏄剧ず鏉ヨ嚜闊抽杞啓鐨?utterances锛坰ource === "audio"锛?
 *
 * 鍦?mock 妯″紡涓嬶紝鐩存帴灞曠ず妯℃嫙杞啓棣堥€併€?
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
          {item.score !== undefined ? (item.score * 100).toFixed(0) + "鍒? : ""}
        </span>
        <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>
          {item.timestamp}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.55 }}>
        {item.text}
      </div>
    </div>
  );
}

/**
 * HLS 瑙嗛鎾斁鍣ㄦ牳蹇?
 * 濡傛灉 hls.js 涓嶆敮鎸佸綋鍓嶆祻瑙堝櫒锛圫afari 鍘熺敓鏀寔 HLS锛変篃鑳芥甯告挱鏀?
 */
function HLSVideoCore({ src, onPlayError }) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);

  useEffect(() => {
    if (!src || !videoRef.current) return;
    const video = videoRef.current;

    // Safari 鍘熺敓鏀寔 HLS
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.load();
      return;
    }

    // Chrome/Firefox: 浣跨敤 hls.js
    import("hls.js").then(({ default: Hls }) => {
      if (!Hls.isSupported()) {
        onPlayError?.("褰撳墠娴忚鍣ㄤ笉鏀寔 HLS 鎾斁");
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
          onPlayError?.(data.type === "networkError" ? "缃戠粶閿欒锛堟祦鍙兘宸插叧闂垨鏈夎法鍩熼檺鍒讹級" : "鎾斁鍣ㄩ敊璇?);
          hls.destroy();
        }
      });
    }).catch(() => {
      onPlayError?.("hls.js 妯″潡鍔犺浇澶辫触");
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
  apiBase = "http://localhost:8012",   // 鏂板锛氱敤浜庢瀯閫犱唬鐞?URL
}) {
  const [playError, setPlayError] = useState(null);
  const [showVideo, setShowVideo] = useState(true);
  const feedRef = useRef(null);

  const roomUrl = roomId ? `https://live.douyin.com/${roomId}` : null;

  // 浠呭睍绀烘潵鑷煶棰戣浆鍐欑殑 utterances锛坰ource === "audio"锛?
  const audioUtterances = useMemo(
    () => utterances.filter(u => u.source === "audio"),
    [utterances]
  );

  // 鏋勯€犳渶缁堟挱鏀?src锛?
  //   - 鏈湴 HLS 璺緞 (/hls/...)  鈫?鐩存帴鎷?apiBase锛屾棤 CORS/杩囨湡闂锛堟渶浼橈級
  //   - 澶栭儴 URL               鈫?璧板悗绔唬鐞嗭紙澶囩敤锛?
  const proxiedSrc = useMemo(() => {
    if (!mediaUrl) return null;
    if (mediaUrl.startsWith("/hls/")) {
      // 鏈湴 HLS 涓户锛岀洿鎺ヨ闂棤璺ㄥ煙闂
      return `${apiBase}${mediaUrl}`;
    }
    // 澶栭儴 URL 閫氳繃浠ｇ悊鏈嶅姟锛堝鐞?CORS / Referer锛?
    return `${apiBase}/douyin/hls-proxy?url=${encodeURIComponent(mediaUrl)}`;
  }, [mediaUrl, apiBase]);

  // mediaUrl 鍙樺寲鏃堕噸缃挱鏀鹃敊璇紙渚嬪娴佸埛鏂颁簡锛?
  useEffect(() => { setPlayError(null); }, [mediaUrl]);

  // 鏂板杞啓鏉＄洰鏃惰嚜鍔ㄦ粴鍔ㄥ埌椤堕儴
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [audioUtterances.length]);

  // 濯掍綋娴佺姸鎬?
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
          <div style={{ fontSize: 36, marginBottom: 8 }}>馃幀</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>妯℃嫙鏁版嵁妯″紡</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
            杞啓棣堥€佺敱涓嬫柟妯℃嫙鏁版嵁椹卞姩
          </div>
        </div>
      );
    }

    if (streamStatus === "disconnected") {
      return (
        <div style={placeholderStyle}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>馃攲</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>绛夊緟杩炴帴鐩存挱闂粹€?/div>
        </div>
      );
    }

    if (streamStatus === "waiting") {
      return (
        <div style={placeholderStyle}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>
            <span style={{ animation: "blink 1.4s infinite", display: "inline-block" }}>鈴?/span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>姝ｅ湪鍙戠幇鐩存挱濯掍綋娴佲€?/div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
            绾﹂渶 15-30 绉掞紙棣栨鍚姩 Selenium锛?
          </div>
          {roomUrl && (
            <a href={roomUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
              馃敆 鍚屾椂鍦ㄦ祻瑙堝櫒涓墦寮€鐩存挱闂?
            </a>
          )}
        </div>
      );
    }

    if (streamStatus === "not_found") {
      return (
        <div style={placeholderStyle}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>馃摵</div>
          <div style={{ fontSize: 12, color: "var(--hype)" }}>鏈兘鎻愬彇濯掍綋娴?/div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
            鐩存挱闂村彲鑳藉凡涓嬬嚎锛屾垨瀛樺湪鍙嶇埇楠岃瘉
          </div>
          {roomUrl && (
            <a href={roomUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
              馃敆 鍦ㄦ祻瑙堝櫒涓煡鐪嬬洿鎾棿
            </a>
          )}
        </div>
      );
    }

    // streamStatus === "ready"
    if (playError) {
      return (
        <div style={placeholderStyle}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>鈿狅笍</div>
          <div style={{ fontSize: 11, color: "var(--hype)", marginBottom: 8 }}>
            {playError}
          </div>
          <a href={roomUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            馃敆 鍦ㄦ祻瑙堝櫒涓鐪嬶紙鎺ㄨ崘锛?
          </a>
          <button
            onClick={() => { setPlayError(null); }}
            style={{ ...linkStyle, background: "var(--bg-tertiary)", border: "1px solid var(--border)",
              borderRadius: 5, padding: "4px 12px", cursor: "pointer", marginTop: 8 }}
          >
            馃攧 閲嶈瘯宓屽叆鎾斁
          </button>
        </div>
      );
    }

    return (
      <div style={{ width: "100%", aspectRatio: "16/9", position: "relative", background: "#000", borderRadius: 6, overflow: "hidden" }}>
        {/* proxiedSrc 缁忓悗绔唬鐞嗭紝鎼哄甫姝ｇ‘ CORS 澶?*/}
        <HLSVideoCore src={proxiedSrc} onPlayError={setPlayError} />
        {/* 鍙充笂瑙掑閮ㄩ摼鎺?*/}
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
            鈫?鏂版爣绛鹃〉
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
      {/* 鏍囬鏍?*/}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>鐩存挱瑙傜湅 + 瀹炴椂杞啓</span>
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
              馃帳 {audioUtterances.length} 娈佃浆鍐?
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
            {showVideo ? "闅愯棌瑙嗛" : "鏄剧ず瑙嗛"}
          </button>
        </div>
      </div>

      {/* 瑙嗛鍖哄煙 */}
      {showVideo && (
        <div style={{ padding: "10px 12px 0" }}>
          {videoArea()}
        </div>
      )}

      {/* 瀹炴椂杞啓棣堥€?*/}
      <div style={{ flex: 1, padding: "10px 12px" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 6,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            馃帳 涓绘挱璇濇湳瀹炴椂杞啓
          </span>
          {audioUtterances.length === 0 && isConnected && streamStatus === "ready" && (
            <span style={{ fontSize: 9, color: "var(--text-muted)", animation: "blink 2s infinite" }}>
              绛夊緟涓嬩竴绐楀彛鈥?
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
                  <div style={{ fontSize: 24, marginBottom: 8 }}>馃攪</div>
                  妯℃嫙妯″紡涓嬫棤闊抽杞啓<br />
                  <span style={{ fontSize: 10, opacity: 0.7 }}>鍒囨崲鍒版姈闊虫暟鎹簮鍚庤嚜鍔ㄥ紑濮?/span>
                </div>
              ) : isConnected ? (
                <div>
                  <div style={{ fontSize: 24, marginBottom: 8, animation: "blink 2s infinite" }}>馃帳</div>
                  <div style={{ fontSize: 11 }}>杩炵画杞啓宸插惎鍔?/div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                    姣?15 绉掍骇鍑轰竴娈碉紝棣栨绾﹂渶 30s
                  </div>
                </div>
              ) : (
                <div>杩炴帴鐩存挱闂村悗鑷姩寮€濮嬭浆鍐?/div>
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

// 鈹€鈹€鈹€ 鏍峰紡甯搁噺 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

