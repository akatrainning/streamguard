import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  loadSessions,
  loadSnapshot,
  deleteSession,
  clearAllSessions,
  renameSession,
} from "../utils/historyStorage";
import SessionReportModal from "../components/SessionReportModal";

//  演示数据（仅在没有任何真实记录时展示）
const DEMO_SESSIONS = [
  { id:"demo-1", date:"2026-03-02 14:30", product:"雅诗兰黛修护精华", brand:"直播间 888888",
    duration:"2h 15m", total:42, fact:19, hype:15, trap:8, score:64, viewers:28500, _demo:true },
  { id:"demo-2", date:"2026-03-01 20:15", product:"华为Mate70 Pro", brand:"直播间 66666",
    duration:"3h 00m", total:67, fact:45, hype:18, trap:4, score:82, viewers:89000, _demo:true },
  { id:"demo-3", date:"2026-03-01 10:30", product:"黄金投资咨询课", brand:"直播间 12345",
    duration:"45m", total:19, fact:3, hype:8, trap:8, score:22, viewers:3200, _demo:true },
];

const sc = (s) => (s >= 75 ? "#00FF88" : s >= 50 ? "#FFD700" : "#FF3366");
const sl = (s) => (s >= 75 ? "合规" : s >= 50 ? "注意" : "高危");

function Chip({ icon, value }) {
  return (
    <span style={{ display:"flex", alignItems:"center", gap:"3px", fontSize:"10px", color:"rgba(228,240,255,0.35)" }}>
      <span>{icon}</span><span>{value}</span>
    </span>
  );
}
function TypePill({ count, color, label }) {
  return (
    <div style={{ padding:"3px 8px", borderRadius:"20px", background:`${color}10`, border:`1px solid ${color}25`,
      display:"flex", flexDirection:"column", alignItems:"center", minWidth:"36px" }}>
      <span className="mono" style={{ fontSize:"12px", color, fontWeight:700, lineHeight:1 }}>{count}</span>
      <span style={{ fontSize:"8px", color:`${color}88`, letterSpacing:"0.5px" }}>{label}</span>
    </div>
  );
}
function StatRow({ label, value, color }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <span style={{ fontSize:"11px", color:"rgba(228,240,255,0.45)" }}>{label}</span>
      <span className="mono" style={{ fontSize:"11px", color, fontWeight:600 }}>{value}</span>
    </div>
  );
}

function EditableTitle({ value, sessionId, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => {
    const t = draft.trim();
    if (t && t !== value) onRename(sessionId, t);
    setEditing(false);
  };
  if (editing) {
    return (
      <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key==="Enter") commit(); if (e.key==="Escape") setEditing(false); }}
        onClick={e => e.stopPropagation()}
        style={{ fontSize:"13px", fontWeight:600, background:"rgba(0,255,224,0.06)",
          border:"1px solid rgba(0,255,224,0.3)", borderRadius:"4px",
          color:"rgba(228,240,255,0.9)", padding:"2px 6px", outline:"none",
          fontFamily:"Inter,sans-serif", width:"200px" }}/>
    );
  }
  return (
    <span title="点击编辑名称"
      onClick={e => { e.stopPropagation(); setDraft(value); setEditing(true); }}
      style={{ fontSize:"13px", fontWeight:600, color:"rgba(228,240,255,0.9)",
        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", cursor:"pointer" }}>
      {value} <span style={{ fontSize:"10px", opacity:0.4 }}></span>
    </span>
  );
}

export default function HistoryPage({ apiBase = "http://localhost:8011" }) {
  const [sessions, setSessions] = useState([]);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [replaySnapshot, setReplaySnapshot] = useState(null);

  const reload = useCallback(() => { setSessions(loadSessions()); }, []);

  useEffect(() => {
    reload();
    const onStorage = e => { if (e.key === "sg_history_sessions") reload(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [reload]);

  const handleDelete = useCallback((id, e) => {
    e.stopPropagation(); deleteSession(id); reload();
  }, [reload]);

  const handleRename = useCallback((id, name) => {
    renameSession(id, name); reload();
  }, [reload]);

  const handleReplay = useCallback((id, e) => {
    e.stopPropagation();
    const snap = loadSnapshot(id);
    if (snap) {
      setReplaySnapshot(snap);
    } else {
      alert("该记录没有保存完整报告数据（可能是旧版本记录）");
    }
  }, []);

  const handleClearAll = useCallback(() => {
    clearAllSessions(); reload(); setShowClearConfirm(false);
  }, [reload]);

  const isDemo = sessions.length === 0;
  const allSessions = isDemo ? DEMO_SESSIONS : sessions;

  const filtered = allSessions.filter(s => {
    const mf = filter==="all" || (filter==="high" && s.score<50) || (filter==="ok" && s.score>=75);
    const ms = !search || (s.product||"").includes(search) || (s.brand||"").includes(search);
    return mf && ms;
  });

  return (
    <>
      <div style={{ padding:"24px", maxWidth:"1100px", margin:"0 auto" }}>
        {/* 标题栏 */}
        <div style={{ marginBottom:"20px", display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <h1 style={{ fontSize:"20px", fontWeight:700, color:"#00FFE0", margin:0, letterSpacing:"1px" }}>历史档案</h1>
            <div style={{ fontSize:"12px", color:"rgba(228,240,255,0.4)", marginTop:"4px" }}>
              {isDemo
                ? <span style={{ color:"rgba(255,211,80,0.6)" }}> 演示数据  结束直播会话后将自动保存真实报告</span>
                : `共 ${sessions.length} 场直播记录`}
            </div>
          </div>
          {!isDemo && (
            <div>
              {showClearConfirm ? (
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <span style={{ fontSize:"12px", color:"rgba(255,50,100,0.8)" }}>确认清空所有记录？</span>
                  <button onClick={handleClearAll} style={{ padding:"5px 12px", borderRadius:"6px",
                    background:"rgba(255,50,100,0.12)", border:"1px solid rgba(255,50,100,0.35)",
                    color:"#FF3264", fontSize:"11px", cursor:"pointer", fontFamily:"Inter,sans-serif" }}>确认清空</button>
                  <button onClick={() => setShowClearConfirm(false)} style={{ padding:"5px 12px", borderRadius:"6px",
                    background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)",
                    color:"rgba(228,240,255,0.5)", fontSize:"11px", cursor:"pointer", fontFamily:"Inter,sans-serif" }}>取消</button>
                </div>
              ) : (
                <button onClick={() => setShowClearConfirm(true)} style={{ padding:"6px 14px", borderRadius:"8px",
                  background:"rgba(255,50,100,0.06)", border:"1px solid rgba(255,50,100,0.2)",
                  color:"rgba(255,80,120,0.6)", fontSize:"11px", cursor:"pointer", fontFamily:"Inter,sans-serif" }}>
                   清空历史
                </button>
              )}
            </div>
          )}
        </div>

        {/* 搜索 + 筛选 */}
        <div style={{ display:"flex", gap:"12px", marginBottom:"20px", alignItems:"center", flexWrap:"wrap" }}>
          <div style={{ position:"relative" }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索名称 / 房间号"
              style={{ padding:"8px 12px 8px 32px", borderRadius:"8px", width:"200px",
                background:"rgba(255,255,255,0.04)", border:"1px solid rgba(0,255,224,0.15)",
                color:"rgba(228,240,255,0.8)", fontSize:"12px", outline:"none", fontFamily:"Inter,sans-serif" }}/>
            <span style={{ position:"absolute", left:"10px", top:"50%", transform:"translateY(-50%)",
              fontSize:"12px", color:"rgba(228,240,255,0.3)", pointerEvents:"none" }}></span>
          </div>
          {[
            { key:"all", label:"全部", count: allSessions.length },
            { key:"high", label:" 高危", count: allSessions.filter(s => s.score<50).length },
            { key:"ok",  label:" 合规", count: allSessions.filter(s => s.score>=75).length },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding:"7px 14px", borderRadius:"20px", cursor:"pointer",
              fontSize:"11px", fontWeight:600, fontFamily:"Inter,sans-serif",
              background: filter===f.key ? "rgba(0,255,224,0.1)" : "rgba(255,255,255,0.03)",
              border:`1px solid ${filter===f.key ? "rgba(0,255,224,0.35)" : "rgba(255,255,255,0.08)"}`,
              color: filter===f.key ? "#00FFE0" : "rgba(228,240,255,0.4)", transition:"all 0.2s",
            }}>{f.label} ({f.count})</button>
          ))}
        </div>

        {/* 列表 */}
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          {filtered.map((s, idx) => {
            const isOpen = expanded === s.id;
            const color = sc(s.score);
            const label = sl(s.score);
            const barData = [
              { name:"事实", value:s.fact, color:"#00FF88" },
              { name:"夸大", value:s.hype, color:"#FFD700" },
              { name:"陷阱", value:s.trap, color:"#FF3366" },
            ];
            const isReal = !s._demo;
            return (
              <motion.div key={s.id}
                initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay: idx*0.04 }}
                style={{ background:"rgba(255,255,255,0.03)",
                  border:`1px solid ${s._demo ? "rgba(255,211,80,0.08)" : "rgba(0,255,224,0.08)"}`,
                  borderRadius:"14px", overflow:"hidden" }}>
                <div onClick={() => setExpanded(isOpen ? null : s.id)}
                  style={{ padding:"14px 18px", display:"flex", alignItems:"center", gap:"16px", cursor:"pointer" }}>
                  {/* 分数圆 */}
                  <div style={{ width:"52px", height:"52px", borderRadius:"50%", flexShrink:0,
                    border:`2px solid ${color}`, display:"flex", flexDirection:"column",
                    alignItems:"center", justifyContent:"center", background:`${color}10` }}>
                    <span className="mono" style={{ fontSize:"16px", fontWeight:700, color, lineHeight:1 }}>{s.score}</span>
                    <span style={{ fontSize:"8px", color, letterSpacing:"0.5px" }}>{label}</span>
                  </div>
                  {/* 信息 */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"4px" }}>
                      {isReal
                        ? <EditableTitle value={s.product} sessionId={s.id} onRename={handleRename} />
                        : <span style={{ fontSize:"13px", fontWeight:600, color:"rgba(228,240,255,0.6)", fontStyle:"italic" }}>{s.product}</span>
                      }
                      <span style={{ fontSize:"10px", color:"rgba(228,240,255,0.3)", flexShrink:0 }}>{s.brand}</span>
                      {s._demo && (
                        <span style={{ fontSize:"9px", padding:"1px 6px", borderRadius:"10px",
                          background:"rgba(255,211,80,0.08)", border:"1px solid rgba(255,211,80,0.2)",
                          color:"rgba(255,211,80,0.5)", flexShrink:0 }}>演示</span>
                      )}
                    </div>
                    <div style={{ display:"flex", gap:"14px", flexWrap:"wrap" }}>
                      <Chip icon="" value={s.date}/>
                      <Chip icon="" value={s.duration}/>
                      {s.viewers > 0 && <Chip icon="" value={s.viewers.toLocaleString()}/>}
                      <Chip icon="" value={`${s.total} 话术`}/>
                    </div>
                  </div>
                  {/* Pills */}
                  <div style={{ display:"flex", gap:"6px", flexShrink:0 }}>
                    <TypePill count={s.fact} color="#00FF88" label="事实"/>
                    <TypePill count={s.hype} color="#FFD700" label="夸大"/>
                    <TypePill count={s.trap} color="#FF3366" label="陷阱"/>
                  </div>
                  {/* 查看报告按钮（仅真实数据） */}
                  {isReal && (
                    <button onClick={e => handleReplay(s.id, e)}
                      style={{ flexShrink:0, padding:"5px 12px", borderRadius:"8px",
                        background:"rgba(0,150,255,0.08)", border:"1px solid rgba(0,150,255,0.25)",
                        color:"#58a6ff", fontSize:"11px", fontWeight:600, cursor:"pointer",
                        fontFamily:"Inter,sans-serif", whiteSpace:"nowrap" }}>
                       查看报告
                    </button>
                  )}
                  {/* 删除按钮（仅真实数据） */}
                  {isReal && (
                    <button onClick={e => handleDelete(s.id, e)} title="删除此记录"
                      style={{ flexShrink:0, background:"none", border:"none",
                        color:"rgba(255,80,100,0.35)", fontSize:"14px", cursor:"pointer",
                        padding:"4px", lineHeight:1, transition:"color 0.2s" }}
                      onMouseEnter={e => e.currentTarget.style.color="rgba(255,80,100,0.8)"}
                      onMouseLeave={e => e.currentTarget.style.color="rgba(255,80,100,0.35)"}></button>
                  )}
                  <span style={{ fontSize:"12px", color:"rgba(0,255,224,0.4)", flexShrink:0,
                    transition:"transform 0.2s", display:"inline-block",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}></span>
                </div>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }}
                      exit={{ height:0, opacity:0 }} transition={{ duration:0.28, ease:"easeInOut" }}
                      style={{ overflow:"hidden" }}>
                      <div style={{ borderTop:"1px solid rgba(0,255,224,0.07)", padding:"16px 18px",
                        display:"grid", gridTemplateColumns:"1fr 1fr", gap:"20px" }}>
                        <div>
                          <div style={{ fontSize:"10px", letterSpacing:"2px", color:"rgba(228,240,255,0.3)", marginBottom:"10px" }}>话术类型分布</div>
                          <ResponsiveContainer width="100%" height={140}>
                            <BarChart data={barData} margin={{ top:5, right:10, bottom:5, left:-10 }}>
                              <XAxis dataKey="name" tick={{ fill:"rgba(228,240,255,0.4)", fontSize:10 }} tickLine={false} axisLine={false}/>
                              <YAxis tick={{ fill:"rgba(228,240,255,0.3)", fontSize:9 }} tickLine={false} axisLine={false}/>
                              <Tooltip contentStyle={{ background:"rgba(2,8,16,0.92)", border:"1px solid rgba(0,255,224,0.2)", borderRadius:"8px", fontSize:"11px" }}/>
                              <Bar dataKey="value" radius={[4,4,0,0]}>
                                {barData.map((e,i) => <Cell key={i} fill={e.color} fillOpacity={0.8}/>)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div>
                          <div style={{ fontSize:"10px", letterSpacing:"2px", color:"rgba(228,240,255,0.3)", marginBottom:"10px" }}>会话统计</div>
                          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                            {s.total > 0 && <>
                              <StatRow label="陷阱话术占比" value={((s.trap/s.total)*100).toFixed(1)+"%"} color="#FF3366"/>
                              <StatRow label="夸大话术占比" value={((s.hype/s.total)*100).toFixed(1)+"%"} color="#FFD700"/>
                              <StatRow label="事实话术占比" value={((s.fact/s.total)*100).toFixed(1)+"%"} color="#00FF88"/>
                            </>}
                            {s.viewers > 0 && <StatRow label="观看人数" value={s.viewers.toLocaleString()} color="#00FFE0"/>}
                            <StatRow label="合规评分" value={s.score+"/100"} color={color}/>
                            <StatRow label="时长" value={s.duration} color="rgba(228,240,255,0.6)"/>
                          </div>
                          {isReal && (
                            <button onClick={e => handleReplay(s.id, e)}
                              style={{ marginTop:"14px", padding:"8px 18px", borderRadius:"8px", cursor:"pointer",
                                background:"rgba(0,150,255,0.1)", border:"1px solid rgba(0,150,255,0.3)",
                                color:"#58a6ff", fontSize:"12px", fontWeight:600, fontFamily:"Inter,sans-serif",
                                width:"100%" }}>
                               查看完整报告
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign:"center", padding:"60px 0", color:"rgba(228,240,255,0.25)", fontSize:"13px" }}>
            未找到匹配记录
          </div>
        )}
      </div>

      {/* 报告回放弹窗 */}
      {replaySnapshot && (
        <SessionReportModal
          snapshot={replaySnapshot}
          apiBase={replaySnapshot._apiBase || apiBase}
          onClose={() => setReplaySnapshot(null)}
        />
      )}
    </>
  );
}