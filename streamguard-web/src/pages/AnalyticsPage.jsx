import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";

const TREND = [
  { day:"02-24", ri:82, trap:3,  hype:10, fact:28 },
  { day:"02-25", ri:75, trap:5,  hype:14, fact:22 },
  { day:"02-26", ri:68, trap:7,  hype:16, fact:19 },
  { day:"02-27", ri:44, trap:14, hype:12, fact:18 },
  { day:"02-28", ri:79, trap:4,  hype:9,  fact:31 },
  { day:"03-01", ri:58, trap:9,  hype:18, fact:15 },
  { day:"03-02", ri:72, trap:6,  hype:11, fact:24 },
];
const PIE = [
  { name:"事实话术", value:157, color:"#00FF88" },
  { name:"夸大话术", value:90,  color:"#FFD700" },
  { name:"陷阱话术", value:48,  color:"#FF3366" },
];
const RADAR_AVG = [
  { subject:"价格透明度", value:76 },
  { subject:"话术压力值", value:48 },
  { subject:"描述真实度", value:64 },
  { subject:"时间紧迫感", value:58 },
  { subject:"证据充分性", value:71 },
  { subject:"合规得分",   value:68 },
];

const tipStyle = {
  background: "rgba(2,8,16,0.92)",
  border: "1px solid rgba(0,255,224,0.2)",
  borderRadius: "8px",
  color: "var(--text-primary)",
  fontSize: "11px",
};

function KpiCard({ icon, label, value, sub, color, delay=0 }) {
  return (
    <motion.div initial={{ opacity:0, y:18 }} animate={{ opacity:1, y:0 }} transition={{ delay, duration:0.45 }}
      style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(0,255,224,0.08)",
        borderRadius:"14px", padding:"18px 16px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"12px" }}>
        <span style={{ fontSize:"22px" }}>{icon}</span>
        <span style={{ fontSize:"9px", color:"var(--text-muted)", letterSpacing:"1px" }}>{label}</span>
      </div>
      <div className="mono" style={{ fontSize:"30px", fontWeight:700, color, lineHeight:1, marginBottom:"5px" }}>{value}</div>
      <div style={{ fontSize:"10px", color:"var(--text-muted)" }}>{sub}</div>
    </motion.div>
  );
}

function Panel({ title, children, style={} }) {
  return (
      <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(0,255,224,0.08)",
      borderRadius:"14px", padding:"16px 14px", ...style }}>
      <div style={{ fontSize:"10px", letterSpacing:"2px", color:"var(--text-muted)", marginBottom:"14px" }}>{title}</div>
      {children}
    </div>
  );
}

export default function AnalyticsPage() {
  const avgRI = Math.round(TREND.reduce((a,b) => a+b.ri, 0) / TREND.length);
  const totalTrap = TREND.reduce((a,b) => a+b.trap, 0);
  const totalAll  = TREND.reduce((a,b) => a+b.trap+b.hype+b.fact, 0);
  const trapRate  = ((totalTrap/totalAll)*100).toFixed(1);
  const riColor   = avgRI >= 70 ? "#00FF88" : avgRI >= 50 ? "#FFD700" : "#FF3366";

  return (
    <div style={{ padding:"24px", maxWidth:"1200px", margin:"0 auto" }}>
      <div style={{ marginBottom:"22px" }}>
        <h1 style={{ fontSize:"20px", fontWeight:700, color:"#00FFE0", margin:0, letterSpacing:"1px" }}>数据洞察</h1>
        <div style={{ fontSize:"12px", color:"var(--text-secondary)", marginTop:"4px" }}>近 7 日综合分析报告</div>
      </div>

      {/* KPI row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"14px", marginBottom:"20px" }}>
        <KpiCard icon="📊" label="分析场次" value="288"         sub="近7日"        color="#00FFE0" delay={0.05}/>
        <KpiCard icon="🧠" label="平均理性指数" value={avgRI}    sub="满分100"     color={riColor} delay={0.10}/>
        <KpiCard icon="⛔" label="陷阱话术率"  value={trapRate+"%"} sub={"共"+totalTrap+"条"} color="#FF3366" delay={0.15}/>
        <KpiCard icon="⚠" label="预警触发"    value="47"        sub="次"          color="#FFD700" delay={0.20}/>
      </div>

      {/* Row 1: Area + Pie */}
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:"16px", marginBottom:"16px" }}>
        <Panel title="近 7 日理性指数趋势">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={TREND}>
              <defs>
                <linearGradient id="riG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00FFE0" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#00FFE0" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill:"var(--text-secondary)", fontSize:10 }} tickLine={false} axisLine={false}/>
              <YAxis domain={[0,100]} tick={{ fill:"var(--text-muted)", fontSize:9 }} tickLine={false} axisLine={false}/>
              <Tooltip contentStyle={tipStyle}/>
              <Area type="monotone" dataKey="ri" name="理性指数" stroke="#00FFE0" strokeWidth={2}
                fill="url(#riG)" dot={{ fill:"#00FFE0", r:3, strokeWidth:0 }}/>
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="话术类型分布">
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={PIE} cx="50%" cy="50%" innerRadius={38} outerRadius={62}
                dataKey="value" paddingAngle={3}>
                {PIE.map((e,i) => <Cell key={i} fill={e.color} fillOpacity={0.85}/>)}
              </Pie>
              <Tooltip contentStyle={tipStyle}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display:"flex", flexDirection:"column", gap:"5px", marginTop:"6px" }}>
            {PIE.map((d,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                <div style={{ width:"8px", height:"8px", borderRadius:"2px", background:d.color, flexShrink:0 }}/>
                <span style={{ fontSize:"10px", color:"var(--text-secondary)", flex:1 }}>{d.name}</span>
                <span className="mono" style={{ fontSize:"10px", color:d.color }}>{d.value}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Row 2: Stacked Bar + Radar */}
      <div style={{ display:"grid", gridTemplateColumns:"3fr 2fr", gap:"16px" }}>
        <Panel title="近 7 日话术类型分布（堆叠）">
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={TREND} margin={{ top:5, right:20, bottom:5, left:-10 }}>
              <XAxis dataKey="day" tick={{ fill:"var(--text-secondary)", fontSize:10 }} tickLine={false} axisLine={false}/>
              <YAxis tick={{ fill:"var(--text-muted)", fontSize:9 }} tickLine={false} axisLine={false}/>
              <Tooltip contentStyle={tipStyle}/>
              <Legend iconSize={8} wrapperStyle={{ fontSize:"10px", color:"var(--text-secondary)" }}/>
              <Bar dataKey="fact" name="事实" stackId="a" fill="#00FF88" fillOpacity={0.7}/>
              <Bar dataKey="hype" name="夸大" stackId="a" fill="#FFD700" fillOpacity={0.7}/>
              <Bar dataKey="trap" name="陷阱" stackId="a" fill="#FF3366" fillOpacity={0.85} radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="综合风险维度均值">
          <ResponsiveContainer width="100%" height={170}>
              <RadarChart data={RADAR_AVG} margin={{ top:10, right:20, bottom:10, left:20 }}>
              <PolarGrid stroke="rgba(0,255,224,0.08)" gridType="polygon"/>
              <PolarAngleAxis dataKey="subject" tick={{ fill:"var(--text-secondary)", fontSize:9 }}/>
              <Radar dataKey="value" stroke="#00FFE0" fill="rgba(0,255,224,0.08)" strokeWidth={1.5}
                dot={{ fill:"#00FFE0", r:2, strokeWidth:0 }}/>
              <Tooltip contentStyle={tipStyle}/>
            </RadarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </div>
  );
}
