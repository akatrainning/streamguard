import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const RULES = [
  {
    id:"AD-001", law:"广告法", article:"第23条", title:"禁止绝对化用语",
    risk:"high", violations:234,
    desc:"广告不得使用国家级、最高级、最佳等绝对化用语。违者可处二十万元以上一百万元以下罚款。",
    keywords:["最好","第一","最强","绝无仅有","最权威","顶尖","最佳"],
    examples:["「本产品是市场上最好的护肤品」","「全网第一功效，绝无仅有」"],
  },
  {
    id:"AD-002", law:"广告法", article:"第28条", title:"禁止虚假广告",
    risk:"high", violations:189,
    desc:"广告内容不得含有虚假或者引人误解的内容，不得欺骗、误导消费者。包括对商品效果、成分、产地等的虚假描述。",
    keywords:["已有百万人验证","临床证明","100%有效","无任何副作用"],
    examples:["「100%临床证明，无任何副作用」","「已有500万用户见证效果」"],
  },
  {
    id:"AD-003", law:"广告法", article:"第9条", title:"禁止不良影响内容",
    risk:"medium", violations:45,
    desc:"广告不得含有淫秽、色情、赌博、迷信、恐怖、暴力的内容，不得妨碍社会公共秩序或者违背社会良好风尚。",
    keywords:[],
    examples:[],
  },
  {
    id:"CP-001", law:"消费者权益保护法", article:"第20条", title:"信息真实披露义务",
    risk:"high", violations:156,
    desc:"经营者向消费者提供有关商品的质量、性能、用途、有效期限等信息，应当真实、全面，不得作虚假或者引人误解的宣传。",
    keywords:["绝对安全","永久有效","百分之百","完美无瑕"],
    examples:["「永久锁水，效果绝对持久」","「百分之百天然，绝对安全无副作用」"],
  },
  {
    id:"CP-002", law:"消费者权益保护法", article:"第29条", title:"消费者个人信息保护",
    risk:"low", violations:28,
    desc:"经营者收集、使用消费者个人信息，应当遵循合法、正当、必要的原则，明示目的、方式和范围，并经消费者同意。",
    keywords:[],
    examples:[],
  },
  {
    id:"EC-001", law:"电子商务法", article:"第17条", title:"禁止虚假宣传",
    risk:"high", violations:312,
    desc:"电子商务经营者应当全面、真实、准确、及时地披露商品信息，保障消费者知情权，不得以虚假折扣、虚假好评等方式欺骗消费者。",
    keywords:["原价xxx现价","限时秒杀","全网最低"],
    examples:["虚假原价虚抬折扣幅度","刷单虚假好评展示"],
  },
  {
    id:"EC-002", law:"电子商务法", article:"第38条", title:"平台连带责任",
    risk:"high", violations:78,
    desc:"对关系消费者生命健康的商品，平台对经营者资质未尽审核义务，或对消费者未尽安全保障义务造成损害的，依法承担相应责任。",
    keywords:[],
    examples:[],
  },
  {
    id:"LV-001", law:"直播规范", article:"第5条", title:"主播行为准则",
    risk:"medium", violations:167,
    desc:"主播在直播过程中不得夸大商品功效，不得发布虚假信息，须对所销售商品的真实性、合法性负责，不得进行误导性展示。",
    keywords:["据说","听说","可能有效","有人反馈说"],
    examples:["「据说用了这个能快速减重20斤」","「好多人反馈说用了效果惊人」"],
  },
  {
    id:"LV-002", law:"直播规范", article:"第8条", title:"禁止诱导性消费",
    risk:"medium", violations:89,
    desc:"禁止以虚假倒计时、虚假库存紧张等方式诱导消费者产生非理性消费。不得使用催促性语言制造焦虑感。",
    keywords:["快抢","最后一件","快结束了","再不买就没了","限时限量"],
    examples:["「最后3件了，手速慢就没了！」","「倒计时10秒，抢完就下架！」"],
  },
  {
    id:"LV-003", law:"直播规范", article:"第12条", title:"直播带货资质要求",
    risk:"low", violations:15,
    desc:"从事直播带货活动的主播须取得相应资质，平台须对主播资质进行审核和公示，不得允许无资质主播从事带货活动。",
    keywords:[],
    examples:[],
  },
];

const RC = {
  high:   { label:"高危", color:"#FF3366", bg:"rgba(255,51,102,0.08)" },
  medium: { label:"注意", color:"#FFD700", bg:"rgba(255,215,0,0.08)" },
  low:    { label:"低危", color:"#00FF88", bg:"rgba(0,255,136,0.08)" },
};
const LAWS = ["全部", "广告法", "消费者权益保护法", "电子商务法", "直播规范"];

export default function RulesPage() {
  const [search,    setSearch]    = useState("");
  const [lawFilter, setLawFilter] = useState("全部");
  const [riskFilter,setRiskFilter]= useState("all");
  const [expanded,  setExpanded]  = useState(null);

  const filtered = RULES.filter(r => {
    const ml = lawFilter === "全部" || r.law === lawFilter;
    const mr = riskFilter === "all" || r.risk === riskFilter;
    const ms = !search || r.title.includes(search) || r.id.toLowerCase().includes(search.toLowerCase()) || r.keywords.some(k => k.includes(search));
    return ml && mr && ms;
  });

  return (
    <div style={{ padding:"24px", maxWidth:"1200px", margin:"0 auto" }}>
      <div style={{ marginBottom:"20px" }}>
        <h1 style={{ fontSize:"20px", fontWeight:700, color:"#00FFE0", margin:0, letterSpacing:"1px" }}>规则图谱</h1>
        <div style={{ fontSize:"12px", color:"var(--text-secondary)", marginTop:"4px" }}>
          收录 {RULES.length} 条合规规则 · 实时语义对齐检测引擎索引
        </div>
      </div>

      {/* Search + risk filter */}
      <div style={{ display:"flex", gap:"10px", marginBottom:"14px", flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ position:"relative" }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索规则 / 关键词 / 编号…"
            style={{ padding:"8px 12px 8px 32px", borderRadius:"8px", width:"240px",
              background:"rgba(255,255,255,0.04)", border:"1px solid rgba(0,255,224,0.15)",
              color:"rgba(228,240,255,0.8)", fontSize:"12px", outline:"none", fontFamily:"Inter,sans-serif" }}/>
          <span style={{ position:"absolute", left:"10px", top:"50%", transform:"translateY(-50%)",
            fontSize:"12px", color:"var(--text-muted)", pointerEvents:"none" }}>🔍</span>
        </div>
        {[
          { key:"all",    label:"全部风险" },
          { key:"high",   label:"⛔ 高危"  },
          { key:"medium", label:"⚠ 注意"  },
          { key:"low",    label:"✅ 低危"  },
        ].map(f => (
          <button key={f.key} onClick={() => setRiskFilter(f.key)} style={{
            padding:"6px 12px", borderRadius:"20px", cursor:"pointer",
            fontSize:"10px", fontWeight:600, fontFamily:"Inter,sans-serif",
            background: riskFilter===f.key ? "rgba(0,255,224,0.1)" : "rgba(255,255,255,0.03)",
            border:`1px solid ${riskFilter===f.key ? "rgba(0,255,224,0.35)" : "rgba(255,255,255,0.08)"}`,
            color: riskFilter===f.key ? "#00FFE0" : "var(--text-secondary)", transition:"all 0.2s",
          }}>{f.label}</button>
        ))}
      </div>

      {/* Law tabs */}
      <div style={{ display:"flex", gap:"6px", marginBottom:"20px", flexWrap:"wrap" }}>
        {LAWS.map(l => (
          <button key={l} onClick={() => setLawFilter(l)} style={{
            padding:"5px 12px", borderRadius:"6px", cursor:"pointer",
            fontSize:"10px", fontFamily:"Inter,sans-serif",
            fontWeight: lawFilter===l ? 600 : 400,
            background: lawFilter===l ? "rgba(0,150,255,0.12)" : "rgba(255,255,255,0.02)",
            border:`1px solid ${lawFilter===l ? "rgba(0,150,255,0.35)" : "rgba(255,255,255,0.07)"}`,
            color: lawFilter===l ? "#0096FF" : "var(--text-secondary)", transition:"all 0.2s",
          }}>{l} ({RULES.filter(r => l === "全部" || r.law === l).length})</button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"12px" }}>
        {filtered.map((rule, idx) => {
          const rc = RC[rule.risk];
          const isOpen = expanded === rule.id;
          return (
            <motion.div key={rule.id}
              initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay: idx*0.04 }}
              style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(0,255,224,0.07)",
                borderRadius:"12px", overflow:"hidden" }}
            >
              <div onClick={() => setExpanded(isOpen ? null : rule.id)}
                style={{ padding:"14px 16px", cursor:"pointer" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"8px" }}>
                  <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
                    <span style={{ fontSize:"9px", padding:"2px 7px", borderRadius:"4px",
                      background:"rgba(0,150,255,0.12)", border:"1px solid rgba(0,150,255,0.25)",
                      color:"#0096FF", letterSpacing:"0.5px", fontFamily:"Inter" }}>{rule.law}</span>
                    <span style={{ fontSize:"9px", color:"var(--text-muted)" }}>{rule.article}</span>
                    <span className="mono" style={{ fontSize:"9px", color:"rgba(228,240,255,0.2)" }}>{rule.id}</span>
                  </div>
                  <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
                    <span style={{ fontSize:"9px", padding:"2px 8px", borderRadius:"20px",
                      background:rc.bg, border:`1px solid ${rc.color}40`, color:rc.color, fontWeight:600 }}>{rc.label}</span>
                    <span style={{ fontSize:"12px", color:"rgba(0,255,224,0.35)", transition:"transform 0.2s",
                      display:"inline-block", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
                  </div>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:"13px", fontWeight:600, color:"rgba(228,240,255,0.85)" }}>{rule.title}</span>
                  <span style={{ fontSize:"10px", color:rc.color }}>🚨 {rule.violations} 次触发</span>
                </div>
              </div>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }}
                    exit={{ height:0, opacity:0 }} transition={{ duration:0.25 }}
                    style={{ overflow:"hidden" }}
                  >
                    <div style={{ borderTop:"1px solid rgba(0,255,224,0.06)", padding:"14px 16px",
                      background:"rgba(0,0,0,0.15)" }}>
                      <div style={{ fontSize:"11px", color:"rgba(228,240,255,0.65)", lineHeight:1.65, marginBottom:"12px" }}>{rule.desc}</div>

                      {rule.keywords.length > 0 && (
                        <div style={{ marginBottom:"10px" }}>
                          <div style={{ fontSize:"9px", letterSpacing:"1.5px", color:"rgba(228,240,255,0.25)", marginBottom:"6px" }}>监测关键词</div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:"5px" }}>
                            {rule.keywords.map((kw,i) => (
                              <span key={i} style={{ padding:"2px 8px", borderRadius:"20px",
                                background:"rgba(255,51,102,0.08)", border:"1px solid rgba(255,51,102,0.2)",
                                fontSize:"10px", color:"#FF8888" }}>"{kw}"</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {rule.examples.length > 0 && (
                        <div>
                          <div style={{ fontSize:"9px", letterSpacing:"1.5px", color:"rgba(228,240,255,0.25)", marginBottom:"6px" }}>违规示例</div>
                          {rule.examples.map((ex,i) => (
                            <div key={i} style={{ fontSize:"11px", color:"rgba(255,215,0,0.7)", padding:"6px 10px",
                              background:"rgba(255,215,0,0.04)", borderLeft:"2px solid rgba(255,215,0,0.25)",
                              borderRadius:"0 6px 6px 0", marginBottom:"4px", lineHeight:1.5 }}>
                              ⚠ {ex}
                            </div>
                          ))}
                        </div>
                      )}
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
          未找到匹配的规则
        </div>
      )}
    </div>
  );
}
