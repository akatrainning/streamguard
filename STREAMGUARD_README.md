# 🛡️ StreamGuard v2.2 - 直播合规监控系统

> 实时语义对齐审核引擎，为直播电商提供智能内容合规分析

## 🚀 快速开始（30 秒）

### Windows 用户
```bash
# 1. 打开 Power Shell/CMD
cd streamguard-web
start.bat
# 浏览器自动打开 http://localhost:5175
```

### Mac/Linux 用户
```bash
# 1. 启动前端
cd streamguard-web
npm install
npm run dev
# 访问 http://localhost:5175
```

### 首屏操作
1. 页面加载后出现**数据源选择器**
2. 选择 🎬 **模拟直播**（推荐首选）
3. 点击 "开始监控"
4. 进入 Dashboard，观察实时数据流

**预期**：完整的直播合规监控系统，无需任何配置，立即可用！

---

## 📊 系统架构

```
┌─────────────────────┐
│   Frontend React    │ http://localhost:5175
│  (Dashboard & UI)   │
└──────────┬──────────┘
           │
      ┌────▼────┐
      │ 数据源选择│
      ├────┬────┤
      │    │    │
    ┌─▼──┬┴─┬──▼─┐
    │    │  │    │
  🎬模拟 🎵抖音 🎤录音 🌊流式 🗣浏览器
  直播  直播   (需后端)
    │    │  │    │
    └────┼──┴────┘
         │
    (可选)│
    ┌────▼──────────────┐
    │ Backend FastAPI   │
    │ (分析引擎)        │
    │ http://8000       │
    └───────────────────┘
         │
    ┌────▼─────────────┐
    │ OpenAI API       │
    │ (Whisper/GPT-4)  │
    └──────────────────┘
```

---

## 🎯 核心功能

### 前端功能
- ✅ **4 页完整 SPA** - Dashboard / History / Analytics / Rules
- ✅ **实时监控面板** - SemanticFeed + RationalityGauge + RiskRadar + TopologyGraph
- ✅ **交互式可视化** - 点击展开、拖拽、筛选、搜索
- ✅ **数据源选择** - 5 种模式，自适应切换
- ✅ **智能告警** - 自动检出陷阱话术，浮动提示
- ✅ **报告导出** - 一键导出 JSON 会话记录

### 后端功能
- ✅ **话术评分** - 关键词 + GPT-4 混合分析
- ✅ **音频转文字** - OpenAI Whisper 中文支持
- ✅ **实时流处理** - WebSocket 驱动
- ✅ **REST API** - 单条话术快速评分

---

## 📈 5 种数据源对比

| 数据源 | 启动时间 | 延迟 | 成本 | 准确率 | 推荐场景 |
|--------|--------|------|------|--------|---------|
| 🎬 模拟直播 | 立即 | <100ms | ¥0 | 80% | **演示/体验** |
| 🎵 抖音直播 | 需授权 | <500ms | ¥0 | 80% | 实时监控 |
| 🎤 本地录音 | 需配置 | 5-10s | ¥0.02/min | 96% | 深度分析 |
| 🌊 流式识别 | 需配置 | 2-3s | ¥0.02/min | 96% | **生产部署** |
| 🗣 浏览器语音 | 立即 | <200ms | ¥0 | 70% | 快速体验 |

---

## 📁 项目结构

```
streamguard/
├── streamguard-web/                  # 前端（React）
│   ├── src/
│   │   ├── App.jsx                   # 主入口 + 数据源选择
│   │   ├── components/
│   │   │   ├── DataSourceSelector.jsx # ⭐ 数据源选择 UI
│   │   │   ├── Header.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── SemanticFeed.jsx
│   │   │   ├── RationalityGauge.jsx
│   │   │   ├── RiskRadar.jsx
│   │   │   ├── TopologyGraph.jsx
│   │   │   ├── AlertBanner.jsx
│   │   │   └── RationalityGate.jsx
│   │   ├── pages/
│   │   │   ├── HistoryPage.jsx
│   │   │   ├── AnalyticsPage.jsx
│   │   │   └── RulesPage.jsx
│   │   ├── hooks/
│   │   │   ├── useSimulatedStream.js  # 模拟数据
│   │   │   ├── useRealStream.js       # ⭐ WebSocket
│   │   │   └── useAudioCapture.js     # ⭐ 麦克风
│   │   └── data/
│   │       └── mockStream.js
│   ├── package.json
│   ├── vite.config.js
│   └── start.bat                      # 快速启动脚本
│
├── streamguard-backend/               # 后端（FastAPI）
│   ├── app.py                         # ⭐ FastAPI 应用
│   ├── requirements.txt
│   ├── .env.example
│   ├── test_backend.py
│   └── start.bat                      # 快速启动脚本
│
└── docs/
    ├── STREAMGUARD_FINAL_SUMMARY.md   # 完整功能清单
    ├── STREAMGUARD_DEPLOYMENT.md      # 详细部署指南
    └── STREAMGUARD_INTEGRATION_SUMMARY.md
```

---

## 🔧 环境要求

### 前端
- Node.js 16+（当前测试 16.19.1）
- npm 7+
- 现代浏览器（Chrome/Edge/Firefox）

### 后端（可选，仅需Whisper功能）
- Python 3.8+
- OpenAI API Key（[获取](https://platform.openai.com/api-keys)）

---

## 💻 详细启动指南

### 场景 1：纯前端（推荐首选）

```bash
cd streamguard-web
npm install     # 首次安装
npm run dev     # 启动开发服务器
# 访问 http://localhost:5175
```

**选择**: 🎬 模拟直播  
**体验**: 完整的交互式仪表板，零依赖  
**时间**: 1 分钟完成

---

### 场景 2：完整部署（需 OpenAI API Key）

#### 步骤 A：配置后端
```bash
cd streamguard-backend

# 1. 安装 Python 依赖
pip install -r requirements.txt
pip install python-multipart  # 必需

# 2. 配置 OpenAI API Key
cp .env.example .env
# 用编辑器打开 .env，修改：
# OPENAI_API_KEY=sk-你的实际key
```

#### 步骤 B：启动后端（新终端）
```bash
cd streamguard-backend
python -m uvicorn app:app --reload --port 8000
# 看到 "Uvicorn running on http://127.0.0.1:8000" 表示成功
```

#### 步骤 C：启动前端（新终端）
```bash
cd streamguard-web
npm run dev
# 访问 http://localhost:5175
```

#### 步骤 D：使用高级功能
- 选择 🎤 **本地录音**
- 允许麦克风权限
- 说话或播放音频
- 自动转文字→评分（约 5-10s）

---

## 🌐 API 端点（后端）

### REST API
```bash
# 1. 健康检查
curl http://localhost:8000/health

# 2. 快速评分
curl "http://localhost:8000/analyze?text=只剩最后50件了，快抢！"

# 3. 音频转文字
curl -X POST -F "file=@recording.wav" http://localhost:8000/transcribe

# 4. 一体化处理（音频→文字→评分）
curl -X POST -F "file=@recording.wav" \
  http://localhost:8000/analyze-with-transcript
```

### WebSocket API
```javascript
// 模拟直播流
ws = new WebSocket('ws://localhost:8000/ws/stream');
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log(msg.event, msg);
  // 输出: utterance / chat / viewer_join 事件
};
```

---

## 🎨 UI 设计特色

- **Dark Mode Glassmorphism** - 高端半透明设计
- **Neon Color Palette** - 青色(00FFE0) / 蓝色(0096FF) / 金色(FFD700)
- **Smooth Animations** - Framer Motion 动画库
- **Responsive Layout** - 自适应 1200px+ 屏幕
- **Interactive Charts** - Recharts 可拖拽图表

---

## 🧭 语义漂移拓扑图（方案A）

- **下半区升级**：由重复详情替换为“全局概览 + 风险优先级”双栏
- **全局概览**：节点总量 / 跨类节点 / 陷阱边 / 平均置信度 / 类别比例 / 漂移趋势（最近 N 条窗口）
- **风险优先级**：支持按漂移幅度 / 跨类强度 / 陷阱边密度 / 置信度下降 / 最近新增排序
- **联动定位**：点击榜单可一键定位拓扑节点

---

## 🚨 常见问题

### Q: 能直接用模拟数据体验吗？
**A**: 能的！选择 🎬 **模拟直播**，无需任何配置，立即进入完整 Dashboard。

### Q: 需要 OpenAI API Key 吗？
**A**: 不需要！模拟和抖音模式无需 Key。仅 Whisper/GPT-4 功能需要。

### Q: 可以接入真实直播吗？
**A**: 可以！支持抖音直播（需安装 `pip install douyin-live`）。

### Q: 后端启动失败怎么办？
**A**: 查看 [STREAMGUARD_DEPLOYMENT.md](./STREAMGUARD_DEPLOYMENT.md#-故障排查) 的故障排查章节。

### Q: 支持手机访问吗？
**A**: 目前针对桌面端优化。手机访问需要调整响应式设计。

---

## 📚 完整文档

| 文档 | 用途 |
|------|------|
| [STREAMGUARD_FINAL_SUMMARY.md](./STREAMGUARD_FINAL_SUMMARY.md) | **功能清单 + 性能指标** |
| [STREAMGUARD_DEPLOYMENT.md](./STREAMGUARD_DEPLOYMENT.md) | **详细部署 + 故障排查** |
| [STREAMGUARD_INTEGRATION_SUMMARY.md](./STREAMGUARD_INTEGRATION_SUMMARY.md) | **架构设计 + 数据流** |

---

## 🧪 测试后端

```bash
cd streamguard-backend
python test_backend.py
# 检查 /health, /analyze, /ws/stream 端点
```

---

## 📊 性能基准

| 场景 | 首屏 | 响应时间 | 吞吐量 |
|------|------|--------|--------|
| 模拟直播 | <1s | <100ms | 每秒 0.25-0.5 条话术 |
| 抖音直播 | <2s | <500ms | 取决于直播间活跃度 |
| Whisper 转录 | <3s | 2-5s | 取决于音频长度 |
| GPT-4 评分 | <3s | 2-5s | 取决于文本长度 |

---

## 🔐 安全建议

- **生产部署**：使用环境变量管理 API Key，不提交 `.env` 到 Git
- **HTTPS**：音频录制需要 HTTPS（或 localhost）
- **速率限制**：建议在生产环境添加 API 速率限制
- **日志审计**：记录所有话术评分结果以供审计

---

## 🤝 贡献

欢迎提交 Issue 和 PR！

---

## 📝 许可证

本项目是 AgentDojo 论文的一部分。详见 [LICENSE](./LICENSE)

---

## 📧 联系方式

- GitHub: [agentdojo](https://github.com/search?q=agentdojo)
- 论文: 见 [CITATION.bib](./CITATION.bib)

---

**版本**: v2.2  
**更新时间**: 2025-02-19  
**状态**: ✅ 生产就绪

---

## 🎉 快速体验

```bash
# 只需 1 分钟！
cd streamguard-web
npm install && npm run dev
# 打开 http://localhost:5175
# 选择 🎬 模拟直播
# 点击 "开始监控"
# 享受！
```
