# StreamGuard 文件导航指南

## 🎯 快速导航

### 🚀 我想快速开始
→ **[STREAMGUARD_README.md](./STREAMGUARD_README.md)**
- 30 秒快速启动
- 5 种数据源说明
- 系统架构概览
- API 示例

### 📖 我想了解完整功能
→ **[STREAMGUARD_FINAL_SUMMARY.md](./STREAMGUARD_FINAL_SUMMARY.md)**
- 20+ 个功能清单
- 5 种数据源对比
- 性能基准数据
- 优化建议

### 🔧 我想部署到生产
→ **[STREAMGUARD_DEPLOYMENT.md](./STREAMGUARD_DEPLOYMENT.md)**
- 分步骤部署指南
- OpenAI API 配置
- 详细数据流程图
- 故障排查表

### 🏗️ 我想理解系统设计
→ **[STREAMGUARD_INTEGRATION_SUMMARY.md](./STREAMGUARD_INTEGRATION_SUMMARY.md)**
- 完整架构图
- 前后端集成
- 代码清单
- 继续工作计划

### ✅ 我想查看完成情况
→ **[STREAMGUARD_DEPLOYMENT_CHECKLIST.md](./STREAMGUARD_DEPLOYMENT_CHECKLIST.md)**
- 交付物清单
- 验证清单
- 功能矩阵
- 部署检查

### 🎉 我想看项目总结
→ **[STREAMGUARD_PROJECT_COMPLETE.md](./STREAMGUARD_PROJECT_COMPLETE.md)**
- 项目完成声明
- 核心成果
- 立即体验步骤
- 技术亮点

---

## 📁 前端文件说明

### 核心文件（必看）
```
streamguard-web/
├── src/App.jsx (88 行)
│   ├── 数据源选择逻辑 ⭐ 新增
│   ├── Hook 切换机制
│   └── 路由管理
│
├── src/components/DataSourceSelector.jsx (297 行) ⭐ 新增
│   ├── 5 选项 UI
│   ├── 配置表单
│   ├── 性能提示
│   └── 回调处理
│
├── src/hooks/useRealStream.js (250 行) ⭐ 新增
│   ├── WebSocket 连接
│   ├── 事件路由
│   ├── 重连机制
│   └── 状态暴露
│
├── src/hooks/useAudioCapture.js (165 行) ⭐ 新增
│   ├── MediaRecorder 配置
│   ├── 权限申请
│   ├── 流式发送
│   └── 错误处理
│
└── src/components/Header.jsx
    └── 数据源切换按钮 ⭐ 已更新
```

### 其他前端文件

#### 页面 (pages/)
- `HistoryPage.jsx` - 历史会话，搜索和导出
- `AnalyticsPage.jsx` - 数据分析，4 个 KPI + 图表
- `RulesPage.jsx` - 合规规则库，10 条规则

#### 组件 (components/)
- `Sidebar.jsx` - 4 页导航
- `LiveStreamPanel.jsx` - 产品卡 + 聊天
- `SemanticFeed.jsx` - 话术列表，点击展开详情
- `RationalityGauge.jsx` - 理性指数 + 趋势图
- `RiskRadar.jsx` - 5 维度风险分析
- `TopologyGraph.jsx` - 3 车道时间线
- `AlertBanner.jsx` - 浮动告警卡
- `RationalityGate.jsx` - 10 秒冷却模态

#### 数据和配置
- `src/data/mockStream.js` - 模拟话术和聊天数据
- `src/index.css` - 全局样式（Dark mode）
- `package.json` - NPM 依赖配置
- `vite.config.js` - Vite 打包配置

---

## 📁 后端文件说明

### 核心文件（必看）
```
streamguard-backend/
├── app.py (240 行) ⭐ 新增
│   ├── FastAPI 应用定义
│   ├── OpenAI 集成点
│   ├── Whisper/GPT-4 接口
│   ├── 6 个 API 端点
│   └── 2 个 WebSocket 端点
│
├── requirements.txt (5 行) ⭐ 更新
│   ├── fastapi
│   ├── uvicorn[standard]
│   ├── websockets
│   ├── openai>=1.0.0
│   └── python-dotenv
│
└── .env.example (8 行) ⭐ 新增
    └── OPENAI_API_KEY=sk-xxx...
```

### 其他后端文件
- `test_backend.py` - API 测试脚本
- `main.py` - 原始版本（有编码问题，参考用）

---

## 📚 文档文件清单

### 🎯 快速开始
- **[STREAMGUARD_README.md](./STREAMGUARD_README.md)** (400 行)
  - 30 秒快速启动指南
  - Windows/Mac/Linux 详细步骤
  - 5 种数据源对比表
  - API 端点示例

### 📋 完整清单
- **[STREAMGUARD_FINAL_SUMMARY.md](./STREAMGUARD_FINAL_SUMMARY.md)** (500+ 行)
  - 20+ 功能完成清单
  - 5 种数据源详细说明
  - 性能指标表
  - 高级优化建议
  - 多角色学习路径

### 🔧 部署指南
- **[STREAMGUARD_DEPLOYMENT.md](./STREAMGUARD_DEPLOYMENT.md)** (600+ 行)
  - 快速开始（3 步）
  - OpenAI API 配置（详细步骤）
  - 数据流程详解
  - 故障排查表格
  - 优化建议

### 🏗️ 架构设计
- **[STREAMGUARD_INTEGRATION_SUMMARY.md](./STREAMGUARD_INTEGRATION_SUMMARY.md)** (400 行)
  - 完整功能清单
  - 代码清单和文件大小
  - 数据源集成
  - 继续工作计划

### ✅ 项目检查
- **[STREAMGUARD_DEPLOYMENT_CHECKLIST.md](./STREAMGUARD_DEPLOYMENT_CHECKLIST.md)** (400 行)
  - 交付物清单
  - 功能矩阵
  - 验证清单
  - 部署就绪检查

### 🎉 项目完成
- **[STREAMGUARD_PROJECT_COMPLETE.md](./STREAMGUARD_PROJECT_COMPLETE.md)** (300 行)
  - 项目概览
  - 立即体验（30 秒）
  - 核心成果
  - 技术亮点
  - 使用场景

---

## 🚀 启动脚本

### Windows
- **streamguard-web/start.bat** - 前端快速启动
- **streamguard-backend/start.bat** - 后端快速启动

### Mac/Linux
```bash
# 前端
cd streamguard-web
npm install
npm run dev

# 后端
cd streamguard-backend
pip install -r requirements.txt
python -m uvicorn app:app --reload --port 8000
```

---

## 📊 文件大小统计

| 类型 | 文件数 | 代码行数 | 用途 |
|------|--------|---------|------|
| 前端 | 15+ | 1000+ | React 组件 |
| 后端 | 3 | 400+ | FastAPI 服务 |
| 文档 | 5 | 2000+ | 指南和说明 |
| 配置 | 5 | 100+ | 打包和配置 |
| **合计** | **28+** | **3500+** | - |

---

## 🎯 按角色阅读指南

### 🎨 前端开发者
1. 首先读: [STREAMGUARD_README.md](./STREAMGUARD_README.md) → 快速启动
2. 然后读: `src/App.jsx` 和 `src/components/DataSourceSelector.jsx`
3. 深入读: [STREAMGUARD_INTEGRATION_SUMMARY.md](./STREAMGUARD_INTEGRATION_SUMMARY.md) → 架构理解
4. 修改建议: 自定义 DataSourceSelector UI 或扩展新组件

### 🔧 后端开发者
1. 首先读: [STREAMGUARD_DEPLOYMENT.md](./STREAMGUARD_DEPLOYMENT.md) → 部署指南
2. 然后读: `streamguard-backend/app.py` → API 端点
3. 深入读: OpenAI 集成部分，了解 Whisper + GPT-4 接口
4. 修改建议: 优化 system prompt 或实现流式处理

### 📊 数据科学家
1. 首先读: [STREAMGUARD_FINAL_SUMMARY.md](./STREAMGUARD_FINAL_SUMMARY.md) → 功能和性能
2. 然后读: `app.py` 中的 `analyze_utterance()` 函数
3. 深入读: OpenAI 集成和评分逻辑
4. 修改建议: 微调 system prompt 或替换评分模型

### 🏗️ 系统架构师
1. 首先读: [STREAMGUARD_INTEGRATION_SUMMARY.md](./STREAMGUARD_INTEGRATION_SUMMARY.md) → 完整设计
2. 然后读: [STREAMGUARD_FINAL_SUMMARY.md](./STREAMGUARD_FINAL_SUMMARY.md) → 性能指标
3. 深入读: 所有 4 份文档，理解全局
4. 优化建议: 参考"高阶优化建议"章节

### 📝 论文写作者
1. 首先读: [STREAMGUARD_PROJECT_COMPLETE.md](./STREAMGUARD_PROJECT_COMPLETE.md) → 项目总结
2. 然后读: [STREAMGUARD_FINAL_SUMMARY.md](./STREAMGUARD_FINAL_SUMMARY.md) → 功能清单
3. 参考数据: 性能指标、架构设计、代码实现
4. 可用于: 系统设计、实验方法、结果验证

---

## 🔗 文档之间的关系

```
STREAMGUARD_README.md (快速开始)
    ↓
    用户想体验 → 选择数据源 → 进入 Dashboard
    
用户想理解系统
    ↓
    STREAMGUARD_FINAL_SUMMARY.md (完整功能清单)
    ↓
    想了解部署 → STREAMGUARD_DEPLOYMENT.md (部署指南)
    想了解架构 → STREAMGUARD_INTEGRATION_SUMMARY.md (架构设计)
    想看检查清单 → STREAMGUARD_DEPLOYMENT_CHECKLIST.md (交付检查)
    
想查看项目总体情况
    ↓
    STREAMGUARD_PROJECT_COMPLETE.md (项目完成声明)
```

---

## ✨ 快速查找

### 我想...
| 任务 | 查看文件 |
|------|--------|
| 快速启动系统 | [README](./STREAMGUARD_README.md) + start.bat |
| 了解 5 种数据源 | [README](./STREAMGUARD_README.md) + [Summary](./STREAMGUARD_FINAL_SUMMARY.md) |
| 配置 OpenAI | [Deployment](./STREAMGUARD_DEPLOYMENT.md) |
| 修改前端 UI | `streamguard-web/src/components/` |
| 修改后端 API | `streamguard-backend/app.py` |
| 理解数据流 | [Integration](./STREAMGUARD_INTEGRATION_SUMMARY.md) |
| 看性能指标 | [Final Summary](./STREAMGUARD_FINAL_SUMMARY.md) |
| 写论文引用 | [Project Complete](./STREAMGUARD_PROJECT_COMPLETE.md) |

---

## 📞 文档获取帮助

### 如果出现问题

1. **前端问题** → 查看 [STREAMGUARD_DEPLOYMENT.md](./STREAMGUARD_DEPLOYMENT.md#-故障排查)
2. **后端问题** → 查看 [STREAMGUARD_DEPLOYMENT.md](./STREAMGUARD_DEPLOYMENT.md#-故障排查)
3. **理解困难** → 查看 [STREAMGUARD_INTEGRATION_SUMMARY.md](./STREAMGUARD_INTEGRATION_SUMMARY.md#数据流程详解)
4. **功能不清楚** → 查看 [STREAMGUARD_FINAL_SUMMARY.md](./STREAMGUARD_FINAL_SUMMARY.md)

---

## 🎓 文档品质

| 文档 | 完整性 | 易读性 | 实用性 |
|------|--------|--------|--------|
| README | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Final Summary | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Deployment | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Integration | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Checklist | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## 📈 推荐阅读顺序

### 第一次使用（15 分钟）
1. 这个文件（文件导航）- 2 分钟
2. [STREAMGUARD_README.md](./STREAMGUARD_README.md) - 5 分钟
3. 启动应用，选择模拟直播 - 3 分钟
4. 浏览 Dashboard 的 4 个页面 - 5 分钟

### 深入理解（1 小时）
1. [STREAMGUARD_FINAL_SUMMARY.md](./STREAMGUARD_FINAL_SUMMARY.md) - 15 分钟
2. [STREAMGUARD_INTEGRATION_SUMMARY.md](./STREAMGUARD_INTEGRATION_SUMMARY.md) - 20 分钟
3. 查看源代码（App.jsx, DataSourceSelector.jsx） - 15 分钟
4. 回顾关键概念 - 10 分钟

### 部署上线（2 小时）
1. [STREAMGUARD_DEPLOYMENT.md](./STREAMGUARD_DEPLOYMENT.md) - 30 分钟
2. 配置 OpenAI API Key - 10 分钟
3. 启动后端 - 5 分钟
4. 测试 API 端点 - 20 分钟
5. 使用 Whisper 功能 - 15 分钟
6. 生产调优 - 40 分钟

---

## 🎯 最常访问的部分

### 最常问的问题
Q: 能直接用吗？  
→ [README - 快速开始](./STREAMGUARD_README.md#-快速开始30秒)

Q: Whisper 怎么用？  
→ [Deployment - 录音+Whisper+GPT-4 模式](./STREAMGUARD_DEPLOYMENT.md#-录音--whisper--gpt-4-模式)

Q: 需要什么配置？  
→ [README - 环境要求](./STREAMGUARD_README.md#-环境要求)

Q: 支持哪些功能？  
→ [Final Summary - 已完成功能](./STREAMGUARD_FINAL_SUMMARY.md#-已完成核心功能20)

---

**更新时间**: 2025-02-19  
**版本**: v2.2
