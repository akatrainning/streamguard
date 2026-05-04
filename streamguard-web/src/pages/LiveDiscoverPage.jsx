import { useMemo, useState } from "react";
import { Button, Panel, StatusBadge, TextField } from "../components/ui";

function GuideIcon({ name }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  };

  if (name === "search") {
    return (
      <svg {...common}>
        <path
          d="M10.5 18.5a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M16.2 16.2 21 21"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "login") {
    return (
      <svg {...common}>
        <path
          d="M12 12a4.3 4.3 0 1 0-4.3-4.3A4.3 4.3 0 0 0 12 12Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M4.5 21a7.5 7.5 0 0 1 15 0"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M20.2 7.4h-3.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M18.6 5.8v3.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "compare") {
    return (
      <svg {...common}>
        <path
          d="M7 20V10"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M12 20V4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M17 20v-7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M5 10h4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M10 4h4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M15 13h4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "monitor") {
    return (
      <svg {...common}>
        <path
          d="M4.5 6.8A2.3 2.3 0 0 1 6.8 4.5h10.4a2.3 2.3 0 0 1 2.3 2.3v6.9a2.3 2.3 0 0 1-2.3 2.3H6.8a2.3 2.3 0 0 1-2.3-2.3V6.8Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M9 19.5h6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M10.3 11.5 12 9l1.2 1.6 2.5-3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path
        d="M4.5 7A2.5 2.5 0 0 1 7 4.5h10A2.5 2.5 0 0 1 19.5 7v10A2.5 2.5 0 0 1 17 19.5H7A2.5 2.5 0 0 1 4.5 17V7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 12h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

      {!searching && rooms.length === 0 && query.trim().length === 0 && (
        <Panel className="sg-discover-guide" title="如何使用直播发现" eyebrow="GUIDE">
          <div className="sg-discover-guide-howto">
            <div className="sg-discover-guide-howto-title">使用流程</div>

            <div className="sg-discover-guide-steps" role="list" aria-label="直播发现使用步骤">
              <div className="sg-discover-guide-step is-1" role="listitem">
                <div className="sg-discover-guide-badge">
                  <span className="sg-discover-guide-badge-icon" aria-hidden="true"><GuideIcon name="login" /></span>
                  <span className="sg-discover-guide-badge-num">1</span>
                </div>
                <div className="sg-discover-guide-step-title">登录账号</div>
                <div className="sg-discover-guide-step-desc">授权抖音账号，解锁直播数据</div>
              </div>

              <div className="sg-discover-guide-step is-2" role="listitem">
                <div className="sg-discover-guide-badge">
                  <span className="sg-discover-guide-badge-icon" aria-hidden="true"><GuideIcon name="search" /></span>
                  <span className="sg-discover-guide-badge-num">2</span>
                </div>
                <div className="sg-discover-guide-step-title">搜索关键词</div>
                <div className="sg-discover-guide-step-desc">输入商品名称，Chrome 实时抓取</div>
              </div>

              <div className="sg-discover-guide-step is-3" role="listitem">
                <div className="sg-discover-guide-badge">
                  <span className="sg-discover-guide-badge-icon" aria-hidden="true"><GuideIcon name="compare" /></span>
                  <span className="sg-discover-guide-badge-num">3</span>
                </div>
                <div className="sg-discover-guide-step-title">AI 对比分析</div>
                <div className="sg-discover-guide-step-desc">勾选 2+ 直播间，获取综合报告</div>
              </div>

              <div className="sg-discover-guide-step is-4" role="listitem">
                <div className="sg-discover-guide-badge">
                  <span className="sg-discover-guide-badge-icon" aria-hidden="true"><GuideIcon name="monitor" /></span>
                  <span className="sg-discover-guide-badge-num">4</span>
                </div>
                <div className="sg-discover-guide-step-title">进入监测</div>
                <div className="sg-discover-guide-step-desc">一键切换至实时话术监控</div>
              </div>
            </div>

            <div className="sg-discover-guide-features" aria-label="能力标签">
              <span className="sg-discover-guide-chip">Chrome 真实抓取</span>
              <span className="sg-discover-guide-chip">AI 多维对比评分</span>
              <span className="sg-discover-guide-chip">实时话术风险识别</span>
              <span className="sg-discover-guide-chip">历史会话回放</span>
            </div>
          </div>
        </Panel>
      )}

      {!searching && rooms.length === 0 && query.trim().length > 0 && (
        <Panel className="sg-discover-empty" title="没有找到匹配结果" eyebrow="EMPTY">
          <p>换个关键词试试，例如补充品牌名、品类或功能词。</p>
        </Panel>
      )}
    </main>
  );
}
