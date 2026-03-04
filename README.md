# StreamGuard — 直播语义鉴别系统

> 实时感知直播间话术风险、弹幕舆情与合规异常的 AI 监控平台

---

## 项目简介

StreamGuard 是一套面向直播电商场景的实时合规监控系统。系统通过接入直播音频，将主播话术转写为文本后，联合大语言模型（LLM）与规则引擎进行语义合规分析；同时对弹幕舆情进行轻量级情感意图识别，最终在可视化仪表盘上展示风险评分、违规告警与趋势分析，帮助运营团队在直播进行中实时发现陷阱话术、虚假宣传等违规内容。

---

## 核心功能

### 1. 实时话术分析
- **音频自动转写**：优先调用 OpenAI Whisper API（云端），网络不可用时自动切换为本地 faster-whisper 模型（无需 API Key）
- **LLM + 规则双引擎**：DeepSeek / OpenAI 大模型对话术进行语义合规评分，同时以规则引擎作为零延迟基线兜底
- **三类话术分类**：事实陈述（fact）/ 夸大话术（hype）/ 陷阱话术（trap）
- **四维子评分**：语义一致性、事实核验度、合规分、主观性指数
- **润色与关键词提取**：LLM 自动将 ASR 原始转写整理为通顺句子并提取核心关键词

### 2. 弹幕舆情分析
- **零延迟规则识别**：纯关键词规则引擎，无需 LLM 调用，即时输出
- **七类意图分类**：购买意向 / 提问咨询 / 客诉投诉 / 质疑话术 / 支持主播 / 广告刷屏 / 普通弹幕
- **情感极性判断**：正向 / 负向 / 中性
- **弹幕-话术关联性**：识别弹幕是否在支持或质疑当前主播话术
- **刷屏过滤**：检测重复字符集刷屏行为

### 3. 可视化仪表盘
- **理性指数仪表盘（RationalityGauge）**：实时显示当前直播间整体话术合规水位
- **风险雷达图（RiskRadar）**：多维度合规评分雷达可视化
- **语义拓扑图（TopologyGraph）**：话术节点与弹幕关联网络图
- **语义信息流（SemanticFeed）**：按时间线滚动展示话术与弹幕分析结果
- **高危告警横幅（AlertBanner）**：检测到高风险内容时自动弹出告警

### 4. 直播发现与对比
- **抖音直播间搜索**：通过关键词搜索抖音在播直播间，展示主播信息、观众数、直播标题等
- **AI 评分对比**：同时选取多个直播间，由 AI 进行综合评级与横向对比
- **Cookie 鉴权**：支持扫码登录或粘贴 Cookie 方式实现账号授权
- **直播流接入**：通过 Selenium + Chrome CDP 自动发现 m3u8/flv 直播媒体流，免手动配置

### 5. 消费者顾问
- **商品搜索**：输入关键词，搜索当前直播间相关商品
- **个性化分析**：结合用户预算、核心需求与当前直播话术证据，由 AI 生成购买建议
- **风险提示**：将直播话术中检测到的违规内容作为负面证据纳入购买建议报告

### 6. 规则中心
- **30 条合规规则**，覆盖四大法规领域：
  - 《广告法》7 条（极限词、虚假广告、医疗广告等）
  - 《消费者权益保护法》6 条（知情权、虚假承诺等）
  - 《电子商务法》6 条（强制搭售、平台责任等）
  - 直播行业规范 10 条（主播资质、数据造假、未成年人保护等）
- 每条规则含：风险等级 / 违规次数统计 / 监测关键词 / 违规示例 / 详细条文说明
- 支持按法规分类筛选与全文关键词搜索

### 7. 历史归档与会话报告
- **会话存储**：每次监控会话结束后自动生成并保存报告（基于 localStorage）
- **报告内容**：话术总数、三类分布、合规评分、高危话术摘录、弹幕舆情统计
- **历史列表**：支持重命名、查看详情、删除单条及清空全部
- **可视化报告**：以柱状图展示历史会话合规分趋势

### 8. 数据统计分析
- 7 日话术类型趋势折线图
- 话术类型分布饼图
- 多维合规能力雷达图（价格透明度 / 话术压力值 / 描述真实度 / 时间紧迫感 / 证据充分度 / 合规得分）
- KPI 卡片：总话术数 / 高危话术数 / 平均合规分 / 监测时长

### 9. 指挥中心（Command Center）
- WebSocket 连接状态实时监控（已连接 / 连接中 / 重试中 / 已断开）
- 消息吞吐量统计（总消息数 / 每分钟消息率）
- 实时日志滚动面板（终端风格，自动滚底）
- 快速导出当前会话 JSON 快照

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + Vite |
| 动效库 | Framer Motion |
| 图表库 | Recharts |
| 后端框架 | FastAPI（Python 3.10+） |
| 大语言模型 | DeepSeek（默认）/ OpenRouter / OpenAI |
| 语音转写（云端）| OpenAI Whisper API |
| 语音转写（本地）| faster-whisper（CPU int8 量化） |
| 音频采集 | imageio-ffmpeg（内置 ffmpeg，无需手动安装） |
| 浏览器自动化 | Selenium + webdriver-manager + Chrome CDP |
| 环境配置 | python-dotenv |

---

## 快速启动

### 环境要求
- Python 3.10+
- Node.js 18+
- （可选）Conda 环境

### 1. 后端启动

```bash
cd streamguard-backend

# 安装依赖
pip install -r requirements.txt

# 配置环境变量（复制示例文件后填写 API Key）
# 编辑 .env，填入 DEEPSEEK_API_KEY 等

# 启动后端服务（默认端口 8011）
uvicorn app:app --host 0.0.0.0 --port 8011 --reload
```

或使用项目根目录的启动脚本：

```powershell
.\start-backend.ps1
```

### 2. 前端启动

```bash
cd streamguard-web
npm install
npm run dev
# 打开 http://localhost:5173
```

### 3. 环境变量配置

在 `streamguard-backend/.env` 中配置以下变量：

```env
# 大语言模型（三选一，优先级：DeepSeek > OpenRouter > OpenAI）
DEEPSEEK_API_KEY=sk-xxxxxxxx
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat

# 语音转写（可选，不填则自动使用本地 faster-whisper）
ASR_OPENAI_API_KEY=sk-xxxxxxxx

# 本地 Whisper 模型大小（tiny/base/small/medium，默认 base）
LOCAL_WHISPER_MODEL=base

# ASR 性能调优（可选）
WHISPER_CPU_THREADS=2
WHISPER_BEAM_SIZE=1
AUDIO_CAPTURE_IDLE=2
```

---

## 数据源模式

| 模式 | 说明 |
|------|------|
| 模拟数据 | 内置 15 条话术 + 20 条弹幕随机循环播放，无需任何账号或网络 |
| 抖音直播间 | 输入直播间 ID，通过 Selenium 自动发现媒体流，采集真实音频进行转写分析 |

---

## 项目结构

```
streamguard/
├── streamguard-backend/        # FastAPI 后端
│   ├── app.py                  # 主入口：API 路由、ASR、LLM 分析、WebSocket
│   ├── douyin_search.py        # 抖音直播间搜索与 Cookie 管理
│   ├── requirements.txt        # Python 依赖
│   └── .env                    # 环境变量（需自行创建）
│
└── streamguard-web/            # React 前端
    └── src/
        ├── pages/
        │   ├── WelcomePage.jsx         # 欢迎引导页
        │   ├── AnalyticsPage.jsx       # 数据统计分析
        │   ├── HistoryPage.jsx         # 历史会话归档
        │   ├── RulesPage.jsx           # 合规规则中心（30 条）
        │   ├── ConsumerAdvisorPage.jsx # 消费者顾问
        │   └── LiveDiscoverPage.jsx    # 抖音直播间发现
        └── components/
            ├── Header.jsx              # 顶部导航与会话控制栏
            ├── CommandCenter.jsx       # 指挥中心（连接状态与日志）
            ├── SemanticFeed.jsx        # 话术/弹幕实时信息流
            ├── RationalityGauge.jsx    # 理性指数仪表盘
            ├── RiskRadar.jsx           # 风险雷达图
            ├── TopologyGraph.jsx       # 语义拓扑图
            ├── AlertBanner.jsx         # 高危告警横幅
            ├── LiveVideoPlayer.jsx     # 直播视频播放器
            └── SessionReportModal.jsx  # 会话报告弹窗
```

---

## 合规覆盖范围

| 法规 | 条数 | 典型违规场景 |
|------|------|------------|
| 广告法 | 7 条 | 极限词、虚假广告、医疗夸大、未成年人广告 |
| 消费者权益保护法 | 6 条 | 知情权缺失、虚假承诺、强制搭售 |
| 电子商务法 | 6 条 | 平台连带责任、价格欺诈、刷单造假 |
| 直播行业规范 | 10 条 | 主播资质、数据造假、打赏诱导、内容低俗、未成年人保护 |

---

## License

本项目仅供学习与研究使用。
