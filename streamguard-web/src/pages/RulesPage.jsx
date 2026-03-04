import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const RULES = [
  // ── 广告法 ──────────────────────────────────────────────────────────────
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
    keywords:["赌博","色情","迷信","血腥"],
    examples:["含有蒙面煽动性内容的广告","利用迷信宣传保健品功效"],
  },
  {
    id:"AD-004", law:"广告法", article:"第16条", title:"禁止医疗广告违规表述",
    risk:"high", violations:203,
    desc:"医疗、药品、医疗器械广告不得含有表示功效、安全性的断言或保证，不得利用患者或专家的名义或形象作证明。",
    keywords:["包治","根治","必愈","专家推荐","患者证明","名医"],
    examples:["「某专家亲测，一周根治糖尿病」","「患者反映服用后完全痊愈」"],
  },
  {
    id:"AD-005", law:"广告法", article:"第38条", title:"广告代言人连带责任",
    risk:"medium", violations:67,
    desc:"广告代言人不得为其未使用过的商品或未接受过的服务作推荐或证明，违规代言需依法承担连带责任。",
    keywords:["我亲自用过","我每天都用","亲测有效"],
    examples:["主播声称每天使用却无实际使用记录","达人为从未试用商品站台背书"],
  },
  {
    id:"AD-006", law:"广告法", article:"第24条", title:"教育培训广告限制",
    risk:"medium", violations:52,
    desc:"教育、培训广告不得对升学、通过考试、获得学位学历或合格证书作出保证性承诺，不得明示或暗示有相关考试机构或其工作人员参与。",
    keywords:["保过","包过","100%通过","考不过退款"],
    examples:["「报名即保过，通不过全额退款」","「内部押题，稳过四六级」"],
  },
  {
    id:"AD-007", law:"广告法", article:"第40条", title:"禁止针对未成年人不当广告",
    risk:"high", violations:88,
    desc:"不得在中小学校、幼儿园内开展广告活动，不得利用中小学生或幼儿的名义、形象作广告代言，不得向未成年人发布不适宜的内容。",
    keywords:["儿童专用","小朋友最爱","学生党必买"],
    examples:["用儿童形象代言高糖饮料","向未成年人推销金融投资产品"],
  },
  // ── 消费者权益保护法 ──────────────────────────────────────────────────────
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
    id:"CP-003", law:"消费者权益保护法", article:"第26条", title:"禁止格式条款不公平内容",
    risk:"medium", violations:74,
    desc:"经营者不得以格式条款、通知、声明、店堂告示等方式作出排除或限制消费者权利、减轻或免除经营者责任的不公平内容。",
    keywords:["概不退换","一经售出","解释权归本店"],
    examples:["「一经购买，概不退款」","「最终解释权归商家所有」"],
  },
  {
    id:"CP-004", law:"消费者权益保护法", article:"第55条", title:"惩罚性赔偿",
    risk:"high", violations:119,
    desc:"经营者提供商品或服务有欺诈行为的，应按消费者购买商品或接受服务金额的三倍赔偿；造成严重损害的，依法追究刑事责任。",
    keywords:[],
    examples:["以次充好被消费者起诉三倍赔偿","虚假宣传导致消费者损失"],
  },
  {
    id:"CP-005", law:"消费者权益保护法", article:"第25条", title:"七日无理由退货",
    risk:"medium", violations:93,
    desc:"网络购物消费者有权自收到商品之日起七日内退货，且无需说明理由。经营者不得以任何方式阻止或限制消费者合法行使该权利。",
    keywords:["不支持7天退","不接受无理由退货","自定义商品不退"],
    examples:["强制要求消费者说明退货原因","以定制名义拒绝正常退货"],
  },
  {
    id:"CP-006", law:"消费者权益保护法", article:"第45条", title:"预付款消费保护",
    risk:"medium", violations:61,
    desc:"经营者以预收款方式提供商品或服务的，应当按照约定提供；不能提供的，应按照消费者要求退还预付款并承担相应责任。",
    keywords:["预付款","充值卡","储值","押金"],
    examples:["健身房跑路未退充值余额","预付卡余额逾期清零"],
  },
  // ── 电子商务法 ──────────────────────────────────────────────────────────
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
    id:"EC-003", law:"电子商务法", article:"第19条", title:"禁止搭售行为",
    risk:"medium", violations:147,
    desc:"电子商务经营者搭售商品或服务，应当以显著方式提请消费者注意，不得将搭售商品或服务作为默认同意选项。",
    keywords:["默认勾选","自动续费","捆绑销售"],
    examples:["购票默认勾选保险选项","订外卖默认加购会员服务"],
  },
  {
    id:"EC-004", law:"电子商务法", article:"第32条", title:"平台规则公平义务",
    risk:"medium", violations:56,
    desc:"电子商务平台经营者应当遵循公开、公平、公正的原则，制定平台服务协议和交易规则，不得在竞价排名等服务中以竞价幅度作为唯一标准。",
    keywords:[],
    examples:["竞价排名未作显著标注","平台修改规则未提前30天通知"],
  },
  {
    id:"EC-005", law:"电子商务法", article:"第49条", title:"禁止大数据杀熟",
    risk:"high", violations:201,
    desc:"电子商务经营者不得利用大数据分析对消费者实施差异化定价，向新老用户展示不同价格，损害消费者权益。",
    keywords:["会员价","老用户专属","首单优惠"],
    examples:["同商品老用户显示价格高于新用户","根据设备类型差异化定价"],
  },
  {
    id:"EC-006", law:"电子商务法", article:"第72条", title:"电子合同与发票义务",
    risk:"low", violations:33,
    desc:"电子商务经营者应当向消费者出具纸质发票、电子发票等购货凭证或服务单据，消费者索要发票的权利不可被剥夺。",
    keywords:[],
    examples:["拒绝向消费者提供购物发票","以促销活动为由拒开正规凭证"],
  },
  // ── 直播规范 ─────────────────────────────────────────────────────────────
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
  {
    id:"LV-004", law:"直播规范", article:"第15条", title:"禁止虚构交易数据",
    risk:"high", violations:276,
    desc:"直播平台及主播不得虚构在线观看人数、点赞数、销售量、好评率等数据，不得以刷量、买粉等方式营造虚假繁荣。",
    keywords:["在线xxx人","已卖出xxx件","好评率100%"],
    examples:["直播间显示在线10万但实为刷量","虚报销售件数诱骗消费者跟风购买"],
  },
  {
    id:"LV-005", law:"直播规范", article:"第18条", title:"食品安全直播要求",
    risk:"high", violations:134,
    desc:"通过直播销售食品的，主播须具备食品经营资质，不得销售过期、变质或无生产许可证的食品，须如实告知食品保质期。",
    keywords:["纯天然无添加","祖传秘方","三无产品"],
    examples:["直播间销售无食品生产许可证产品","宣传保健品具有疾病治疗功效"],
  },
  {
    id:"LV-006", law:"直播规范", article:"第21条", title:"打赏行为规范",
    risk:"medium", violations:58,
    desc:"直播平台须对用户打赏行为进行合理限制，禁止主播煽动诱导未成年人打赏，须建立打赏冷静期及退款机制。",
    keywords:["刷礼物","来一波打赏","上榜","冲榜"],
    examples:["主播持续恳求粉丝刷榜以获更多曝光","诱导未成年用户大额打赏"],
  },
  {
    id:"LV-007", law:"直播规范", article:"第25条", title:"直播内容存档义务",
    risk:"low", violations:22,
    desc:"直播平台须对直播内容进行完整录制并留存不少于60天，以备监管部门查阅；不得删除或篡改存档内容。",
    keywords:[],
    examples:["删除涉违规的历史直播录像","未按规定时限保存直播档案"],
  },
  {
    id:"LV-008", law:"直播规范", article:"第30条", title:"禁止低俗内容直播",
    risk:"high", violations:195,
    desc:"直播内容不得含有宣扬色情、暴力、赌博等低俗内容，不得以擦边球形式绕过平台审核机制传播不良信息。",
    keywords:["擦边","福利","大尺度"],
    examples:["以养生名义进行低俗内容直播","通过暗语引导观众至违规内容"],
  },
  {
    id:"LV-009", law:"直播规范", article:"第34条", title:"广告标注规范",
    risk:"medium", violations:109,
    desc:"直播带货中的商业推广内容须显著标注「广告」或「合作」字样，不得以自然推荐的形式隐藏商业合作关系，误导消费者判断。",
    keywords:["自用推荐","自己买的","非广告"],
    examples:["收取推广费却声称是自发推荐","软广未标注合作关系"],
  },
  {
    id:"LV-010", law:"直播规范", article:"第40条", title:"未成年人保护直播机制",
    risk:"high", violations:143,
    desc:"直播平台须针对未成年人设置专门保护机制，包括使用时长限制、消费限额、宵禁功能等，防止未成年人沉迷直播或进行大额消费。",
    keywords:[],
    examples:["平台未设置青少年模式","未成年人单次打赏超法规限额"],
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

      {/* Grid — 两列独立瀑布流，展开互不影响 */}
      <div style={{ display:"flex", gap:"12px", alignItems:"flex-start" }}>
        {[0, 1].map(col => (
          <div key={col} style={{ flex:1, display:"flex", flexDirection:"column", gap:"12px" }}>
            {filtered.filter((_, i) => i % 2 === col).map((rule, idx) => {
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
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"rgba(228,240,255,0.25)", fontSize:"13px" }}>
          未找到匹配的规则
        </div>
      )}
    </div>
  );
}
