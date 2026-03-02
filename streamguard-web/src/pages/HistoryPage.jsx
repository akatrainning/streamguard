import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const SESSIONS = [
  { id:1, date:"2026-03-02 14:30", product:"雅诗兰黛修护精华", brand:"雅诗兰黛", duration:"2h 15m", total:42, fact:19, hype:15, trap:8, score:64, viewers:28500 },
  { id:2, date:"2026-03-02 11:00", product:"SK-II神仙水套装", brand:"SK-II", duration:"1h 45m", total:35, fact:24, hype:8, trap:3, score:88, viewers:15200 },
  { id:3, date:"2026-03-01 20:15", product:"华为Mate70 Pro", brand:"华为", duration:"3h 00m", total:67, fact:45, hype:18, trap:4, score:82, viewers:89000 },
  { id:4, date:"2026-03-01 16:00", product:"减肥代餐奶昔", brand:"轻体坊", duration:"1h 20m", total:28, fact:6, hype:12, trap:10, score:38, viewers:9800 },
  { id:5, date:"2026-03-01 10:30", product:"黄金投资咨询课", brand:"富盈资本", duration:"45m", total:19, fact:3, hype:8, trap:8, score:22, viewers:3200 },
  { id:6, date:"2026-02-28 19:00", product:"iQOO 13 手机", brand:"vivo", duration:"2h 30m", total:53, fact:38, hype:12, trap:3, score:85, viewers:42000 },
  { id:7, date:"2026-02-28 15:30", product:"欧莱雅零点面霜", brand:"欧莱雅", duration:"1h 10m", total:24, fact:16, hype:6, trap:2, score:89, viewers:18700 },
  { id:8, date:"2026-02-27 20:00", product:"速效减脂保健品", brand:"健康人生", duration:"2h 00m", total:48, fact:8, hype:18, trap:22, score:18, viewers:7600 },
];

const sc = (s) => s >= 75 ? "#00FF88" : s >= 50 ? "#FFD700" : "#FF3366";
const sl = (s) => s >= 75 ? "合规" : s >= 50 ? "注意" : "高危";

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

export default function HistoryPage() {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState("");

  const filtered = SESSIONS.filter(s => {
    const mf = filter === "all" || (filter === "high" && s.score < 50) || (filter === "ok" && s.score >= 75);
    const ms = !search || s.product.includes(search) || s.brand.includes(search);
    return mf && ms;
  });

  return (
    <div style={{ padding:"24px", maxWidth:"1100px", margin:"0 auto" }}>
      <div style={{ marginBottom:"20px" }}>
        <h1 style={{ fontSize:"20px", fontWeight:700, color:"#00FFE0", margin:0, letterSpacing:"1px" }}>历史档案</h1>
        <div style={{ fontSize:"12px", color:"rgba(228,240,255,0.4)", marginTop:"4px" }}>
          共 {SESSIONS.length} 场直播记录 · 覆盖最近 7 日
        </div>
      </div>

      {/* Controls */}
      <div style={{ display:"flex", gap:"12px", marginBottom:"20px", alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ position:"relative" }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索商品 / 品牌…"
            style={{ padding:"8px 12px 8px 32px", borderRadius:"8px", width:"200px",
              background:"rgba(255,255,255,0.04)", border:"1px solid rgba(0,255,224,0.15)",
              color:"rgba(228,240,255,0.8)", fontSize:"12px", outline:"none", fontFamily:"Inter,sans-serif" }}/>
          <span style={{ position:"absolute", left:"10px", top:"50%", transform:"translateY(-50%)",
            fontSize:"12px", color:"rgba(228,240,255,0.3)", pointerEvents:"none" }}>🔍</span>
        </div>
        {[
          { key:"all", label:"全部", count: SESSIONS.length },
          { key:"high", label:"⛔ 高危", count: SESSIONS.filter(s => s.score < 50).length },
          { key:"ok",  label:"✅ 合规", count: SESSIONS.filter(s => s.score >= 75).length },
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

      {/* List */}
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
          return (
            <motion.div key={s.id}
              initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay: idx*0.05 }}
              style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(0,255,224,0.08)",
                borderRadius:"14px", overflow:"hidden" }}
            >
              <div onClick={() => setExpanded(isOpen ? null : s.id)}
                style={{ padding:"14px 18px", display:"flex", alignItems:"center", gap:"16px", cursor:"pointer" }}>
                {/* Score circle */}
                <div style={{ width:"52px", height:"52px", borderRadius:"50%", flexShrink:0,
                  border:`2px solid ${color}`, display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"center", background:`${color}10` }}>
                  <span className="mono" style={{ fontSize:"16px", fontWeight:700, color, lineHeight:1 }}>{s.score}</span>
                  <span style={{ fontSize:"8px", color, letterSpacing:"0.5px" }}>{label}</span>
                </div>
                {/* Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"4px" }}>
                    <span style={{ fontSize:"13px", fontWeight:600, color:"rgba(228,240,255,0.9)",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.product}</span>
                    <span style={{ fontSize:"10px", color:"rgba(228,240,255,0.35)", flexShrink:0 }}>{s.brand}</span>
                  </div>
                  <div style={{ display:"flex", gap:"14px", flexWrap:"wrap" }}>
                    <Chip icon="📅" value={s.date}/>
                    <Chip icon="⏱" value={s.duration}/>
                    <Chip icon="👁" value={s.viewers.toLocaleString()}/>
                    <Chip icon="💬" value={s.total + " 话术"}/>
                  </div>
                </div>
                {/* Pills */}
                <div style={{ display:"flex", gap:"6px", flexShrink:0 }}>
                  <TypePill count={s.fact} color="#00FF88" label="事实"/>
                  <TypePill count={s.hype} color="#FFD700" label="夸大"/>
                  <TypePill count={s.trap} color="#FF3366" label="陷阱"/>
                </div>
                <span style={{ fontSize:"12px", color:"rgba(0,255,224,0.4)", flexShrink:0,
                  transition:"transform 0.2s", display:"inline-block",
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
              </div>

              {/* Expanded */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }}
                    exit={{ height:0, opacity:0 }} transition={{ duration:0.28, ease:"easeInOut" }}
                    style={{ overflow:"hidden" }}
                  >
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
                          <StatRow label="陷阱话术占比" value={((s.trap/s.total)*100).toFixed(1) + "%"} color="#FF3366"/>
                          <StatRow label="夸大话术占比" value={((s.hype/s.total)*100).toFixed(1) + "%"} color="#FFD700"/>
                          <StatRow label="事实话术占比" value={((s.fact/s.total)*100).toFixed(1) + "%"} color="#00FF88"/>
                          <StatRow label="观看人数" value={s.viewers.toLocaleString()} color="#00FFE0"/>
                          <StatRow label="合规评分" value={s.score + "/100"} color={color}/>
                        </div>
                        <button style={{ marginTop:"12px", padding:"7px 16px", borderRadius:"8px", cursor:"pointer",
                          background:"rgba(0,150,255,0.08)", border:"1px solid rgba(0,150,255,0.25)",
                          color:"#0096FF", fontSize:"11px", fontWeight:600, fontFamily:"Inter,sans-serif" }}
                          onClick={e => { e.stopPropagation(); alert("报告导出功能：实际部署时接入后端 API"); }}>
                          📄 导出报告
                        </button>
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
  );
}
