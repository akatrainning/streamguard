import { useMemo, useState } from "react";
import { Button, Panel, StatusBadge, TextField } from "../components/ui";

export default function LiveDiscoverPage({
  apiBase = "http://localhost:8012",
  onConnectRoom,
  utterances = [],
  chatMessages = [],
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [error, setError] = useState("");

  const rooms = useMemo(() => searchResult?.rooms || [], [searchResult]);
  const selectedRooms = useMemo(
    () => rooms.filter((room) => selectedIds.includes(room.room_id)),
    [rooms, selectedIds],
  );

  const runSearch = async () => {
    const kw = query.trim();
    if (!kw) {
      setError("请先输入商品关键词，例如：蓝莓、蛋白粉、口红");
      return;
    }

    setSearching(true);
    setError("");
    setComparison(null);
    setSelectedIds([]);
    try {
      const res = await fetch(
        `${apiBase}/consumer/search-live-streams?q=${encodeURIComponent(kw)}&max_results=12`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "搜索失败");
      setSearchResult(data);
      setSelectedIds((data.rooms || []).slice(0, 3).map((room) => room.room_id));
    } catch (err) {
      setError(err?.message || "搜索失败");
    } finally {
      setSearching(false);
    }
  };

  const runCompare = async () => {
    if (selectedRooms.length < 2) {
      setError("请至少选择 2 个直播间再做对比");
      return;
    }

    setComparing(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/consumer/compare-streams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: query.trim(),
          rooms: selectedRooms,
          stream_context: {
            utterances: utterances.slice(0, 60).map((u) => ({ text: u.text, type: u.type, score: u.score })),
            chats: chatMessages.slice(0, 100).map((c) => ({ text: c.text, intent: c.intent, sentiment: c.sentiment })),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "对比失败");
      setComparison(data);
    } catch (err) {
      setError(err?.message || "对比失败");
    } finally {
      setComparing(false);
    }
  };

  const toggleSelect = (roomId) => {
    setSelectedIds((prev) => (
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
    ));
  };

  return (
    <main className="sg-discover-page">
      <header className="sg-discover-head">
        <div>
          <div className="sg-ui-eyebrow">DISCOVER</div>
          <h1>直播发现</h1>
          <p>搜索直播间，横向对比，再一键切到需要重点盯看的房间。</p>
        </div>
      </header>

      <Panel className="sg-discover-search" title="搜索直播间" eyebrow="QUERY">
        <div className="sg-discover-search-row">
          <TextField
            label="关键词"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && runSearch()}
            placeholder="输入商品、品牌或赛道关键词"
          />
          <Button onClick={runSearch} variant="primary" disabled={searching}>
            {searching ? "搜索中..." : "开始搜索"}
          </Button>
          <Button onClick={runCompare} disabled={selectedIds.length < 2 || comparing}>
            {comparing ? "分析中..." : "对比分析"}
          </Button>
        </div>
        {error && <div className="sg-history-error">{error}</div>}
      </Panel>

      <div className="sg-discover-grid">
        {rooms.map((room) => {
          const selected = selectedIds.includes(room.room_id);
          return (
            <Panel
              key={room.room_id}
              className="sg-discover-card"
              title={room.anchor_name || room.room_title || room.room_id}
              eyebrow={room.room_title || `房间号 ${room.room_id}`}
              actions={(
                <>
                  <StatusBadge tone={selected ? "success" : "neutral"}>
                    {selected ? "已选中" : "候选"}
                  </StatusBadge>
                  <Button onClick={() => toggleSelect(room.room_id)}>
                    {selected ? "取消" : "选择"}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => onConnectRoom?.(room)}
                  >
                    进入直播
                  </Button>
                </>
              )}
            >
              <div className="sg-discover-meta">
                <span>房间号 {room.room_id}</span>
                <span>观众 {room.viewer_count || 0}</span>
                <span>推荐度 {room.recommendation_score || 0}</span>
              </div>
            </Panel>
          );
        })}
      </div>

      {comparison && (
        <Panel className="sg-discover-comparison" title="对比结论" eyebrow="COMPARE">
          <p>{comparison?.p0?.summary || comparison?.p0?.conclusion || "已生成对比结论。"}</p>
          <div className="sg-discover-meta">
            {(comparison?.p1?.products || []).map((product) => (
              <span key={product.room_id || product.name}>{product.name}: {product.overall}</span>
            ))}
          </div>
        </Panel>
      )}

      {!searching && rooms.length === 0 && (
        <Panel className="sg-discover-empty" title="还没有搜索结果" eyebrow="EMPTY">
          <p>先输入一个关键词，系统会尝试找出相关直播间。</p>
        </Panel>
      )}
    </main>
  );
}
