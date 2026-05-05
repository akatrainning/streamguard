import { useEffect, useMemo, useState } from "react";
import { Button, Panel, StatusBadge, TextField } from "../components/ui";
import { requestJson } from "../utils/authClient";

const SUGGESTED_QUERIES = [
  "胶原蛋白",
  "蓝莓叶黄素",
  "儿童钙片",
  "国货护肤",
];

const SEARCH_STEPS = [
  "检查 Chrome 登录 Cookie",
  "抓取直播间候选列表",
  "整理封面和热度信息",
  "生成推荐排序",
];

const AUTH_STEPS = [
  "打开 Google Chrome 登录窗口",
  "等待抖音账号登录或验证码完成",
  "读取浏览器 Cookie",
  "回填到本地搜索环境",
];

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

function DiscoverActivity({ title, query, steps, activeStep, tone = "search" }) {
  return (
    <section className={`sg-discover-activity is-${tone}`} aria-live="polite">
      <div className="sg-discover-activity-copy">
        <div className="sg-ui-eyebrow">{tone === "auth" ? "COOKIE AUTH" : "LIVE SEARCH"}</div>
        <h2>{title}</h2>
        <p>{query ? `当前关键词：${query}` : "正在准备直播发现环境。"}</p>
      </div>
      <div className="sg-discover-activity-steps">
        {steps.map((step, index) => (
          <div
            key={step}
            className={`sg-discover-activity-step ${index === activeStep ? "is-active" : ""} ${index < activeStep ? "is-done" : ""}`}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function SkeletonCard({ index }) {
  return (
    <article className="sg-discover-room-card is-skeleton" style={{ "--card-delay": `${index * 70}ms` }}>
      <div className="sg-discover-room-cover" />
      <div className="sg-discover-room-body">
        <div className="sg-discover-skeleton-line is-long" />
        <div className="sg-discover-skeleton-line" />
        <div className="sg-discover-room-stats">
          <div className="sg-discover-skeleton-block" />
          <div className="sg-discover-skeleton-block" />
          <div className="sg-discover-skeleton-block" />
        </div>
        <div className="sg-discover-skeleton-line is-short" />
      </div>
    </article>
  );
}

function DiscoverRoomCard({ room, index, selected, onToggle, onConnect }) {
  const roomName = room.anchor_name || room.room_title || room.room_id || "未命名直播间";
  const roomTitle = room.room_title || "暂无直播标题";
  const score = normalizeScore(room.recommendation_score);
  const viewers = Number(room.viewer_count || 0);
  const cover = room.thumbnail_url || "";

  return (
    <article className={`sg-discover-room-card ${selected ? "is-selected" : ""}`} style={{ "--card-delay": `${index * 40}ms` }}>
      <div className="sg-discover-room-cover">
        {cover ? (
          <img src={cover} alt={`${roomName} 直播间封面`} loading="lazy" />
        ) : (
          <div className="sg-discover-room-cover-fallback" aria-hidden="true">
            <span>LIVE</span>
            <strong>{roomName.slice(0, 2)}</strong>
          </div>
        )}
        <div className="sg-discover-room-cover-top">
          <StatusBadge tone={selected ? "success" : "neutral"}>
            {selected ? "已加入对比" : "可加入对比"}
          </StatusBadge>
          <span className={`sg-discover-live-pill ${room.status === "living" ? "is-live" : ""}`}>
            {room.status === "living" ? "直播中" : room.status || "状态未知"}
          </span>
        </div>
      </div>

      <div className="sg-discover-room-body">
        <div className="sg-discover-room-heading">
          <div>
            <h3>{roomName}</h3>
            <p>{roomTitle}</p>
          </div>
          <button
            type="button"
            className={`sg-discover-room-check ${selected ? "is-selected" : ""}`}
            onClick={() => onToggle(room.room_id)}
            aria-pressed={selected}
            aria-label={`${selected ? "取消选择" : "选择"} ${roomName}`}
          >
            {selected ? "已选" : "选择"}
          </button>
        </div>

        <div className="sg-discover-room-stats">
          <div>
            <span>推荐匹配</span>
            <strong>{score}%</strong>
          </div>
          <div>
            <span>直播热度</span>
            <strong>{formatNumber(viewers)}</strong>
          </div>
          <div>
            <span>房间状态</span>
            <strong>{room.status === "living" ? "在线" : "待确认"}</strong>
          </div>
        </div>

        <div className="sg-discover-room-scorebar" aria-hidden="true">
          <span style={{ width: `${Math.max(score, 6)}%` }} />
        </div>

        <div className="sg-discover-room-meta">
          <span>{viewers ? `${formatNumber(viewers)} 人围观` : "实时围观数据待抓取"}</span>
          <span className="mono">ID {room.room_id || "--"}</span>
        </div>

        <div className="sg-discover-room-actions">
          <Button onClick={() => onToggle(room.room_id)}>{selected ? "取消选择" : "加入对比"}</Button>
          <Button variant="primary" onClick={() => onConnect?.(room)}>
            进入监测
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function LiveDiscoverPage({
  apiBase = "http://localhost:8011",
  onConnectRoom,
  utterances = [],
  chatMessages = [],
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [cookieStatus, setCookieStatus] = useState(null);
  const [cookiePreview, setCookiePreview] = useState([]);
  const [cookieLoading, setCookieLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [activityStep, setActivityStep] = useState(0);

  const rooms = useMemo(() => searchResult?.rooms || [], [searchResult]);
  const selectedRooms = useMemo(
    () => rooms.filter((room) => selectedIds.includes(room.room_id)),
    [rooms, selectedIds],
  );
  const featuredRoom = useMemo(() => {
    if (!rooms.length) return null;
    return rooms.reduce((best, room) => (
      normalizeScore(room.recommendation_score) > normalizeScore(best?.recommendation_score) ? room : best
    ), rooms[0]);
  }, [rooms]);

  useEffect(() => {
    refreshCookieState(apiBase, setCookieStatus, setCookiePreview, setCookieLoading);
  }, [apiBase]);

  useEffect(() => {
    if (!searching && !authenticating) {
      setActivityStep(0);
      return undefined;
    }

    setActivityStep(0);
    const maxStep = (authenticating ? AUTH_STEPS : SEARCH_STEPS).length;
    const timer = window.setInterval(() => {
      setActivityStep((prev) => (prev + 1) % maxStep);
    }, 1100);
    return () => window.clearInterval(timer);
  }, [searching, authenticating]);

  const runSearch = async () => {
    const kw = query.trim();
    if (!kw) {
      setError("请先输入商品、品牌或赛道关键词。");
      setStatusMessage("");
      return;
    }
    if (kw.length < 2) {
      setError("关键词至少 2 个字，这样结果会更稳定。");
      setStatusMessage("");
      return;
    }

    setSearching(true);
    setError("");
    setStatusMessage("正在连接直播搜索服务，请稍候。");
    setComparison(null);

    try {
      const data = await requestJson(
        apiBase,
        `/consumer/search-live-streams?q=${encodeURIComponent(kw)}&max_results=12`,
      );
      const nextRooms = data.rooms || [];
      setSearchResult(data);
      setSelectedIds(nextRooms.slice(0, Math.min(nextRooms.length, 3)).map((room) => room.room_id));

      if (!nextRooms.length) {
        setStatusMessage("这次没有找到匹配直播间，可以换更具体的品牌词或功效词。");
      } else if (data.data_source === "fallback") {
        setStatusMessage("当前展示的是兜底结果，建议先完成 Chrome 登录以提高命中率。");
      } else {
        setStatusMessage(`已找到 ${nextRooms.length} 个候选直播间，可直接勾选后进入对比。`);
      }
    } catch (err) {
      setError(err?.message || "搜索失败，请稍后重试。");
      setStatusMessage("");
    } finally {
      setSearching(false);
    }
  };

  const runCompare = async () => {
    if (selectedRooms.length < 2) {
      setError("请至少选择 2 个直播间后再做对比。");
      return;
    }

    setComparing(true);
    setError("");
    setStatusMessage("正在汇总直播间证据并生成对比结论。");
    try {
      const data = await requestJson(apiBase, "/consumer/compare-streams", {
        method: "POST",
        body: {
          keyword: query.trim(),
          rooms: selectedRooms,
          stream_context: {
            utterances: utterances.slice(0, 60).map((u) => ({ text: u.text, type: u.type, score: u.score })),
            chats: chatMessages.slice(0, 100).map((c) => ({ text: c.text, intent: c.intent, sentiment: c.sentiment })),
          },
        },
      });
      setComparison(data);
      setStatusMessage("对比报告已更新，可以继续切换直播间进入实时监测。");
    } catch (err) {
      setError(err?.message || "对比失败，请稍后重试。");
    } finally {
      setComparing(false);
    }
  };

  const runChromeAuth = async () => {
    setAuthenticating(true);
    setError("");
    setStatusMessage("即将拉起 Google Chrome，请在弹出的窗口中完成抖音登录。");

    try {
      const payload = await requestJson(apiBase, "/consumer/auth-douyin", {
        method: "POST",
        body: { keyword: query.trim() },
      });
      await refreshCookieState(apiBase, setCookieStatus, setCookiePreview, setCookieLoading);
      setStatusMessage(payload?.message || "登录完成，Cookie 已回填。");
    } catch (err) {
      setError(err?.message || "打开 Chrome 登录失败。");
      setStatusMessage("");
    } finally {
      setAuthenticating(false);
    }
  };

  const toggleSelect = (roomId) => {
    setSelectedIds((prev) => (
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
    ));
  };

  const authTone = cookieStatus?.exists ? "success" : "warning";
  const hasQuery = query.trim().length > 0;
  const hasSearched = searchResult !== null;
  const showSuggestedQueries = !hasQuery && rooms.length === 0 && !searching;
  const resultSummary = [
    rooms.length ? `${rooms.length} 个候选直播间` : null,
    selectedIds.length ? `${selectedIds.length} 个已选对比` : null,
    cookieStatus?.exists ? `${cookieStatus.count || 0} 个 Cookie 已连接` : "未连接 Cookie",
  ].filter(Boolean).join(" · ");

  return (
    <main className="sg-discover-page">
      <header className="sg-discover-head">
        <div>
          <div className="sg-ui-eyebrow">DISCOVER</div>
          <h1>直播发现</h1>
          <p>输入商品、品牌或功效词，快速筛出候选直播间，再把高价值目标一键切到实时监测。</p>
        </div>
        <div className="sg-discover-head-meta" aria-label="直播发现概览">
          <StatusBadge tone={authTone}>
            {cookieStatus?.exists ? "已登录" : "待登录"}
          </StatusBadge>
          <span>{resultSummary}</span>
        </div>
      </header>

      <section className="sg-discover-toolbar">
        <Panel className="sg-discover-search-panel">
          <div className="sg-discover-search-stack">
            <div className="sg-discover-search-row">
              <TextField
                label="商品 / 品牌关键词"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && runSearch()}
                placeholder="例如：胶原蛋白、蓝莓叶黄素、韩束、修丽可"
              />
              <Button onClick={runSearch} variant="primary" disabled={searching || authenticating}>
                {searching ? "搜索中..." : "开始搜索"}
              </Button>
              <Button onClick={runCompare} disabled={selectedIds.length < 2 || comparing}>
                {comparing ? "分析中..." : "对比分析"}
              </Button>
            </div>

            <div className="sg-discover-auth-inline">
              <div className="sg-discover-auth-inline-main">
                <StatusBadge tone={cookieStatus?.exists ? "success" : "danger"}>
                  {cookieStatus?.exists ? "Chrome 已连接" : "Chrome 未连接"}
                </StatusBadge>
                <span className="sg-discover-auth-inline-note">
                  {cookieStatus?.exists
                    ? `已连接 Google Chrome，${cookieStatus.count || 0} 个 Cookie 可用`
                    : "建议先连接 Google Chrome，再开始搜索"}
                </span>
                {cookieStatus?.modified && <span className="sg-discover-auth-inline-time">更新于 {cookieStatus.modified}</span>}
              </div>
              <div className="sg-discover-auth-inline-actions">
                <Button variant="primary" onClick={runChromeAuth} disabled={authenticating}>
                  {authenticating ? "登录处理中..." : "刷新登录"}
                </Button>
                <Button
                  onClick={() => refreshCookieState(apiBase, setCookieStatus, setCookiePreview, setCookieLoading)}
                  disabled={cookieLoading}
                >
                  {cookieLoading ? "刷新中..." : "刷新状态"}
                </Button>
                <details className="sg-discover-cookie-preview-inline">
                  <summary>
                    <span>Cookie 预览</span>
                    <em>{cookiePreview.length || 0}</em>
                  </summary>
                  <div className="sg-discover-cookie-preview-body">
                    <p className="sg-discover-cookie-inline-note">
                      {cookieStatus?.exists
                        ? "已检测到本地登录态，搜索会优先复用这些 Cookie。若结果异常，可以先刷新状态再搜索。"
                        : "如果搜索结果偏少或命中兜底数据，先点击“刷新登录”拉起 Google Chrome 完成抖音登录。"}
                    </p>
                    {cookiePreview.length ? (
                      <div className="sg-discover-cookie-list">
                        {cookiePreview.map((cookie) => (
                          <article key={`${cookie.name}-${cookie.domain}`} className="sg-discover-cookie-item">
                            <strong>{cookie.name}</strong>
                            <span>{cookie.domain}</span>
                            <code>{cookie.value_preview || "--"}</code>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="sg-discover-cookie-empty">
                        这里会显示登录后保存的脱敏 Cookie 预览，便于确认登录状态是否已经生效。
                      </p>
                    )}
                  </div>
                </details>
              </div>
            </div>

            {showSuggestedQueries && (
              <div className="sg-discover-suggested">
                {SUGGESTED_QUERIES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="sg-discover-suggested-chip"
                    onClick={() => setQuery(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}

            {(statusMessage || error) && (
              <div className="sg-discover-feedback" aria-live="polite">
                {statusMessage && <div className="sg-discover-inline-note">{statusMessage}</div>}
                {error && <div className="sg-history-error">{error}</div>}
              </div>
            )}
          </div>
        </Panel>
      </section>

      {(searching || authenticating) && (
        <DiscoverActivity
          title={authenticating ? "正在同步 Chrome 登录态" : "正在搜索直播间"}
          query={query.trim()}
          steps={authenticating ? AUTH_STEPS : SEARCH_STEPS}
          activeStep={activityStep}
          tone={authenticating ? "auth" : "search"}
        />
      )}

      {featuredRoom && (
        <section className={`sg-discover-summary ${searching ? "is-pending" : ""}`}>
          <div className="sg-discover-summary-copy">
            <div className="sg-ui-eyebrow">BEST MATCH</div>
            <h2>{featuredRoom.anchor_name || featuredRoom.room_title || "当前最佳候选"}</h2>
            <p>{featuredRoom.room_title || "系统已根据热度、匹配度和直播状态完成排序。"}</p>
          </div>
          <div className="sg-discover-summary-metrics">
            <div>
              <span>搜索来源</span>
              <strong>{formatDataSource(searchResult?.data_source)}</strong>
            </div>
            <div>
              <span>最高匹配</span>
              <strong>{normalizeScore(featuredRoom.recommendation_score)}%</strong>
            </div>
          </div>
        </section>
      )}

      {searching && rooms.length === 0 && (
        <section className="sg-discover-results-grid" aria-label="搜索占位结果">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} index={index} />
          ))}
        </section>
      )}

      {!searching && rooms.length > 0 && (
        <section className="sg-discover-results-grid" aria-label="直播候选结果">
          {rooms.map((room, index) => (
            <DiscoverRoomCard
              key={room.room_id || `${room.anchor_name}-${index}`}
              room={room}
              index={index}
              selected={selectedIds.includes(room.room_id)}
              onToggle={toggleSelect}
              onConnect={onConnectRoom}
            />
          ))}
        </section>
      )}

      {comparison && (
        <Panel className="sg-discover-comparison" title="对比结论" eyebrow="COMPARE">
          <div className="sg-discover-comparison-copy">
            <p>{comparison?.p0?.summary || comparison?.p0?.conclusion || "已生成对比结论。"}</p>
          </div>
          <div className="sg-discover-compare-grid">
            {(comparison?.p1?.products || []).map((product, index) => (
              <article key={product.room_id || product.name || index} className="sg-discover-compare-card">
                <span className="mono">#{String(index + 1).padStart(2, "0")}</span>
                <strong>{product.name || product.room_id || "候选直播间"}</strong>
                <em>{product.overall || "综合评价待生成"}</em>
              </article>
            ))}
          </div>
        </Panel>
      )}

      {!searching && !rooms.length && !hasQuery && (
        <Panel className="sg-discover-guide">
          <div className="sg-discover-guide-howto">
            <div className="sg-discover-guide-howto-title">如何更快找到目标直播间</div>
            <div className="sg-discover-guide-steps" role="list" aria-label="直播发现使用步骤">
              <div className="sg-discover-guide-step is-1" role="listitem">
                <div className="sg-discover-guide-badge">
                  <span className="sg-discover-guide-badge-icon" aria-hidden="true"><GuideIcon name="login" /></span>
                  <span className="sg-discover-guide-badge-num">1</span>
                </div>
                <div className="sg-discover-guide-step-title">先连 Chrome</div>
                <div className="sg-discover-guide-step-desc">先完成抖音登录，再搜索直播间，命中率会更高。</div>
              </div>

              <div className="sg-discover-guide-step is-2" role="listitem">
                <div className="sg-discover-guide-badge">
                  <span className="sg-discover-guide-badge-icon" aria-hidden="true"><GuideIcon name="search" /></span>
                  <span className="sg-discover-guide-badge-num">2</span>
                </div>
                <div className="sg-discover-guide-step-title">搜商品或品牌</div>
                <div className="sg-discover-guide-step-desc">优先输入具体商品名、品牌名和功效词，结果会更集中。</div>
              </div>

              <div className="sg-discover-guide-step is-3" role="listitem">
                <div className="sg-discover-guide-badge">
                  <span className="sg-discover-guide-badge-icon" aria-hidden="true"><GuideIcon name="compare" /></span>
                  <span className="sg-discover-guide-badge-num">3</span>
                </div>
                <div className="sg-discover-guide-step-title">勾选重点房间</div>
                <div className="sg-discover-guide-step-desc">把值得观察的直播间加入对比，再看 AI 结论。</div>
              </div>

              <div className="sg-discover-guide-step is-4" role="listitem">
                <div className="sg-discover-guide-badge">
                  <span className="sg-discover-guide-badge-icon" aria-hidden="true"><GuideIcon name="monitor" /></span>
                  <span className="sg-discover-guide-badge-num">4</span>
                </div>
                <div className="sg-discover-guide-step-title">切到实时监测</div>
                <div className="sg-discover-guide-step-desc">确认目标后，一键进入实时话术监测和风险观察。</div>
              </div>
            </div>

            <div className="sg-discover-guide-features" aria-label="能力标签">
              <span className="sg-discover-guide-chip">Google Chrome 登录联动</span>
              <span className="sg-discover-guide-chip">封面卡片结果布局</span>
              <span className="sg-discover-guide-chip">AI 对比报告</span>
              <span className="sg-discover-guide-chip">实时监测切换</span>
            </div>
          </div>
        </Panel>
      )}

      {!searching && !rooms.length && hasQuery && hasSearched && (
        <Panel className="sg-discover-empty" title="没有找到匹配结果" eyebrow="EMPTY">
          <p>可以换一个更具体的品牌词，或者先完成 Chrome 登录后再搜索。</p>
        </Panel>
      )}
    </main>
  );
}

async function refreshCookieState(apiBase, setCookieStatus, setCookiePreview, setCookieLoading) {
  setCookieLoading(true);
  try {
    const [status, preview] = await Promise.all([
      requestJson(apiBase, "/consumer/cookie-status"),
      requestJson(apiBase, "/consumer/cookie-preview?limit=6"),
    ]);
    setCookieStatus(status);
    setCookiePreview(preview?.cookies || []);
  } catch {
    setCookieStatus(null);
    setCookiePreview([]);
  } finally {
    setCookieLoading(false);
  }
}

function normalizeScore(rawScore) {
  const score = Number(rawScore || 0);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score > 1 ? Math.round(score) : Math.round(score * 100)));
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
}

function formatDataSource(source) {
  if (source === "fallback") return "兜底样例";
  if (source === "unknown" || !source) return "待确认";
  return source;
}
