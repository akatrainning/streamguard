import { useEffect, useMemo, useState } from "react";
import { Button, SegmentedControl, TextField } from "./ui";
import "./DataSourceSelector.css";

const QUICK_ROOMS = [
  { label: "与辉同行", id: "646454278948" },
  { label: "东方甄选", id: "208823316033" },
];

const MODE_OPTIONS = [
  { value: "douyin", label: "真实直播", meta: "Live" },
  { value: "mock", label: "演示数据", meta: "Demo" },
];

export default function DataSourceSelector({ onSelect, onConnect, variant = "modal" }) {
  const [selected, setSelected] = useState("douyin");
  const [roomInput, setRoomInput] = useState("");
  const [wsBase, setWsBase] = useState("ws://localhost:8011");
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeData, setProbeData] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const roomId = extractRoomId(roomInput);
  const canConnect = selected === "mock" || (selected === "douyin" && roomId.trim());

  useEffect(() => {
    if (!roomId || selected !== "douyin") {
      setProbeData(null);
      setProbeLoading(false);
      return;
    }

    setProbeData(null);
    setProbeLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const httpBase = (wsBase || "ws://localhost:8011").replace(/^ws/i, "http");
        const res = await fetch(`${httpBase}/douyin/room-info/${roomId}`);
        const data = res.ok ? await res.json() : { error: `HTTP ${res.status}` };
        setProbeData(data);
      } catch {
        setProbeData({ error: "服务未响应" });
      } finally {
        setProbeLoading(false);
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [roomId, selected, wsBase]);

  const probeState = useMemo(() => {
    if (selected === "mock") return { tone: "ready", label: "DEMO READY", value: "模拟流已就绪" };
    if (!roomInput.trim()) return { tone: "idle", label: "WAITING", value: "输入直播间" };
    if (!roomId) return { tone: "warn", label: "NO ID", value: "未识别房间号" };
    if (probeLoading) return { tone: "scan", label: "SCANNING", value: roomId };
    if (probeData?.error) return { tone: "error", label: "OFFLINE", value: probeData.error };
    if (probeData) return { tone: "ready", label: "READY", value: probeData.room_id || roomId };
    return { tone: "idle", label: "READY", value: roomId };
  }, [probeData, probeLoading, roomId, roomInput, selected]);

  const handleConnect = () => {
    if (!canConnect) return;
    const config = selected === "douyin"
      ? { roomId: roomId.trim(), wsBase: wsBase.trim() || "ws://localhost:8011" }
      : { wsBase: wsBase.trim() || "ws://localhost:8011" };
    onSelect(selected, config);
    onConnect?.(selected, config);
  };

  return (
    <section className={`sg-source-shell ${variant === "page" ? "is-page" : "is-modal"}`}>
      <div className="source-deck">
        <div className="source-stage" aria-hidden="true">
          <div className="source-stage-top">
            <span className="mono">STREAM ACCESS</span>
            <strong className={`is-${probeState.tone}`}>{probeState.label}</strong>
          </div>

          <div className="source-live-scene">
            <div className="source-signal-ribbon">
              {Array.from({ length: 16 }).map((_, index) => (
                <span key={index} style={{ "--i": index }} />
              ))}
            </div>
            <div className="source-shot">
              <div className="source-video-scan" />
              <div className="source-anchor" />
              <div className="source-card-stack">
                <i />
                <i />
                <i />
              </div>
            </div>

            <div className="source-radar">
              <div className="source-radar-sweep" />
              <span className={`source-status-dot is-${probeState.tone}`} />
              <b>{probeState.value}</b>
            </div>
          </div>

          <div className="source-timeline">
            {Array.from({ length: 24 }).map((_, index) => (
              <span key={index} style={{ "--i": index }} />
            ))}
          </div>
        </div>

        <div className="source-console">
          <div className="source-console-head">
            <div>
              <span className="source-kicker">Data Source</span>
              <h2>连接数据源</h2>
            </div>
            <div className={`source-state is-${probeState.tone}`}>
              <span>{probeState.label}</span>
              <strong>{probeState.value}</strong>
            </div>
          </div>

          <SegmentedControl
            className="source-mode-switch"
            options={MODE_OPTIONS}
            value={selected}
            onChange={setSelected}
          />

          {selected === "douyin" && (
            <div className="source-field">
              <TextField
                label="直播间"
                type="text"
                value={roomInput}
                onChange={(event) => setRoomInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleConnect()}
                placeholder="粘贴链接或输入房间号"
                action={(
                  <Button variant="primary" onClick={handleConnect} disabled={!canConnect}>
                  连接
                  </Button>
                )}
              />
              <div className="source-room-line">
                <span className="mono">{roomId || "room id"}</span>
                {QUICK_ROOMS.map((room) => (
                  <button key={room.id} type="button" onClick={() => setRoomInput(room.id)}>
                    {room.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="source-advanced">
            <Button onClick={() => setShowAdvanced((value) => !value)}>
              {showAdvanced ? "收起节点" : "节点设置"}
            </Button>
            {showAdvanced && (
              <input
                type="text"
                value={wsBase}
                onChange={(event) => setWsBase(event.target.value)}
                placeholder="ws://localhost:8011"
              />
            )}
          </div>

          <Button className="source-submit" variant="success" onClick={handleConnect} disabled={!canConnect}>
            {selected === "mock" ? "进入演示" : "开始监测"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function extractRoomId(input = "") {
  const text = decodeURIComponent((input || "").trim());
  if (!text) return "";

  const direct = text.match(/^\d{6,24}$/);
  if (direct) return direct[0];

  try {
    const url = new URL(text);
    const qRoom = url.searchParams.get("room_id")
      || url.searchParams.get("roomId")
      || url.searchParams.get("web_rid")
      || url.searchParams.get("webRid");
    if (qRoom && /^\d{6,24}$/.test(qRoom)) return qRoom;
  } catch {
    // Non-URL input is handled by the digit fallback below.
  }

  const urlMatch = text.match(/(?:live\.)?douyin\.com\/(\d{6,24})/i);
  if (urlMatch) return urlMatch[1];

  const anyDigits = text.match(/(\d{6,24})/);
  return anyDigits ? anyDigits[1] : "";
}
