/**
 * historyStorage.js
 * 管理 StreamGuard 直播历史记录的 localStorage 持久化
 */

const STORAGE_KEY = "sg_history_sessions";
const SNAPSHOT_PREFIX = "sg_snapshot_"; // 完整快照 key 前缀
const MAX_SESSIONS = 50;  // 最多保存50条摘要
const MAX_SNAPSHOTS = 20; // 最多保存20份完整快照（防止 localStorage 爆）

/**
 * 格式化毫秒时长为 "Xh Ym" 或 "Ym" 字符串
 */
function formatDuration(ms) {
  if (!ms || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `<1m`;
}

/**
 * 格式化 Date 为本地时间字符串
 */
function formatDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da} ${h}:${mi}`;
}

/**
 * 从 session 快照数据构建历史记录条目
 * @param {Object} snapshot - handleEndSession 产生的快照
 * @param {number} viewerCount - 当时的观看人数
 * @param {string} title - 用户设置的直播标题（可选）
 */
export function buildHistoryEntry(snapshot, viewerCount = 0, title = "") {
  const {
    utterances = [],
    startTime,
    endTime,
    rationalityIndex = 0,
    roomId = null,
  } = snapshot;

  // 只统计话术类（排除 chat 弹幕）
  const speechUtterances = utterances.filter((u) => u?.source !== "chat");
  const fact = speechUtterances.filter((u) => u?.type === "fact").length;
  const hype = speechUtterances.filter((u) => u?.type === "hype").length;
  const trap = speechUtterances.filter((u) => u?.type === "trap").length;
  const total = speechUtterances.length;

  // 合规分：使用 rationalityIndex（0~100），若为0但有数据则推算
  let score = Math.round(rationalityIndex);
  if (score === 0 && total > 0) {
    // fallback: 基于陷阱占比推算
    const trapRatio = trap / total;
    score = Math.max(0, Math.round(100 - trapRatio * 100 - (hype / total) * 40));
  }

  const product = title || (roomId ? `直播间 ${roomId}` : "本地录制");

  return {
    id: Date.now() + Math.random(), // 唯一 ID
    date: formatDate(startTime || Date.now()),
    product,
    brand: roomId || "—",
    duration: formatDuration(endTime - startTime),
    total,
    fact,
    hype,
    trap,
    score,
    viewers: viewerCount || 0,
    startTime: startTime || Date.now(),
    endTime: endTime || Date.now(),
    roomId,
    // 保存最多50条话术用于详情展示
    sampleUtterances: speechUtterances.slice(0, 50).map((u) => ({
      id: u.id,
      type: u.type,
      text: u.text || u.content || "",
      ts: u.ts || u.timestamp,
    })),
  };
}

/**
 * 加载所有历史记录（按时间倒序）
 */
export function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const sessions = JSON.parse(raw);
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

/**
 * 保存一条新的历史记录（摘要 + 完整快照分开存）
 * @param {Object} entry - buildHistoryEntry 返回的条目
 * @param {Object} fullSnapshot - handleEndSession 产生的原始快照（含完整 utterances）
 * @param {string} apiBase - 后端地址，方便回放报告时使用
 */
export function saveSession(entry, fullSnapshot = null, apiBase = "") {
  try {
    // 1. 保存摘要列表
    const sessions = loadSessions();
    const updated = [entry, ...sessions].slice(0, MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    // 2. 保存完整快照（含全部 utterances，用于重放报告）
    if (fullSnapshot) {
      const snapKey = SNAPSHOT_PREFIX + entry.id;
      const snapData = { ...fullSnapshot, _apiBase: apiBase };
      try {
        localStorage.setItem(snapKey, JSON.stringify(snapData));
      } catch (e) {
        // 可能 localStorage 空间不足，删最旧的快照腾空间
        pruneOldSnapshots(sessions);
        try { localStorage.setItem(snapKey, JSON.stringify(snapData)); } catch {}
      }
    }
    return true;
  } catch (e) {
    console.warn("[historyStorage] 保存失败:", e);
    return false;
  }
}

/** 删除最旧的快照，只保留 MAX_SNAPSHOTS 条 */
function pruneOldSnapshots(sessions) {
  const toKeep = new Set(sessions.slice(0, MAX_SNAPSHOTS).map((s) => String(s.id)));
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(SNAPSHOT_PREFIX)) {
      const id = key.slice(SNAPSHOT_PREFIX.length);
      if (!toKeep.has(id)) {
        localStorage.removeItem(key);
        i--;
      }
    }
  }
}

/**
 * 读取某条记录的完整快照（用于重放报告）
 * 返回 null 表示该记录没有保存完整快照（如演示数据、旧记录）
 */
export function loadSnapshot(sessionId) {
  try {
    const raw = localStorage.getItem(SNAPSHOT_PREFIX + sessionId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 删除指定 id 的历史记录（同时删完整快照）
 */
export function deleteSession(id) {
  try {
    const sessions = loadSessions();
    const updated = sessions.filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    localStorage.removeItem(SNAPSHOT_PREFIX + id);
  } catch (e) {
    console.warn("[historyStorage] 删除失败:", e);
  }
}

/**
 * 清空所有历史记录（含快照）
 */
export function clearAllSessions() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    // 清所有快照 key
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SNAPSHOT_PREFIX)) keys.push(key);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    console.warn("[historyStorage] 清空失败:", e);
  }
}

/**
 * 更新某条记录的 product 名称（用于用户编辑标题）
 */
export function renameSession(id, newProduct) {
  try {
    const sessions = loadSessions();
    const updated = sessions.map((s) =>
      s.id === id ? { ...s, product: newProduct } : s
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("[historyStorage] 重命名失败:", e);
  }
}
