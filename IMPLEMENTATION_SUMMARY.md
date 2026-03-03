# 🎥 StreamGuard 实时直播视频集成 - 实现总结

## 项目概述

本次更新为 StreamGuard 直播合规监控系统添加了完整的实时直播视频播放功能，允许用户在前端仪表板中实时观看直播内容。

## 核心功能

### 1. 实时视频播放 ✨
- **多格式支持**：HLS (m3u8) 和 FLV 格式
- **自动格式选择**：根据直播平台返回的 URL 自动选择最优播放器
- **智能库加载**：通过 CDN 动态加载必要的播放器库
- **错误恢复**：自动重连和错误提示

### 2. 用户体验
- **实时状态指示**：显示连接、加载、播放中等状态
- **视频控制**：支持暂停、音量、全屏等原生控制
- **信息显示**：显示房间 ID 和流格式信息
- **响应式设计**：视频播放器尺寸自适应（16:9 比例）

### 3. 后端集成
- **媒体 URL 发现**：通过 `/media-url` 端点获取直播流 URL
- **自动化抓取**：使用无头浏览器和 Chrome DevTools Protocol 发现流 URL
- **协议转换**：自动将 WebSocket URL 转换为 HTTP URL

## 技术架构

### 文件结构

```
streamguard-web/
├── src/
│   ├── components/
│   │   ├── VideoPlayer.jsx        ← NEW: 视频播放器组件
│   │   ├── LiveStreamPanel.jsx    ← 弹幕面板（保留）
│   │   └── ...
│   └── App.jsx                    ← MODIFIED: 集成视频播放器
└── package.json                   ← 无需更改（不依赖新的 npm 包）

streamguard-backend/
├── app.py                         ← 已有 /media-url 端点
└── ...
```

### 组件设计

#### VideoPlayer.jsx
**职责**：
- 获取直播流 URL
- 初始化播放器（HLS.js 或 FLV.js）
- 管理播放状态和错误处理
- 显示用户界面

**主要 Props**：
- `roomId` (string) - 直播间房间 ID
- `wsBase` (string) - 后端 API 基座 URL（默认：http://localhost:8010）

**依赖库**：
- React 19.2+（已有）
- HLS.js（CDN 动态加载）
- FLV.js（CDN 动态加载）

#### API 端点
```
GET /media-url?roomId={roomId}

响应格式：
{
  "url": "https://...m3u8" 或 "https://...flv"
}

错误响应：
{
  "detail": "media url not found"
}
```

## 数据流

```
用户选择房间 ID
    ↓
App.jsx 中的 VideoPlayer 挂载
    ↓
VideoPlayer 发送 /media-url 请求
    ↓
后端运行 _discover_douyin_media_url()
    ↓
后端启动无头浏览器，加载直播页面
    ↓
监听 WebSocket 流，识别媒体 URL
    ↓
返回直播流 URL (m3u8 或 flv)
    ↓
前端选择合适的播放器
    ↓
加载播放器库（HLS.js 或 FLV.js）
    ↓
初始化播放器并加载流
    ↓
用户观看实时直播
```

## 代码修改详情

### 1. 创建 VideoPlayer.jsx

**关键特性**：

```jsx
// URL 协议转换（ws:// → http://）
let httpBase = wsBase;
if (httpBase.startsWith("ws://")) {
  httpBase = httpBase.replace("ws://", "http://");
} else if (httpBase.startsWith("wss://")) {
  httpBase = httpBase.replace("wss://", "https://");
}

// HLS 播放器初始化
const hls = new window.Hls({
  enableWorker: true,
  lowLatencyMode: true,
  maxLoadingDelay: 4,
  maxBufferLength: 60,
});

// FLV 播放器初始化
const flvPlayer = window.flvjs.createPlayer({
  type: "flv",
  url: videoUrl,
});
```

**特殊处理**：
- 自动错误恢复：网络错误时自动重新加载
- 媒体错误恢复：自动恢复媒体错误
- 清理机制：卸载时销毁播放器实例

### 2. 修改 App.jsx

**导入**：
```jsx
import VideoPlayer from "./components/VideoPlayer";
```

**集成**：
```jsx
{/* 视频播放器区域 */}
{sourceConfig.roomId && (
  <VideoPlayer
    roomId={sourceConfig.roomId}
    wsBase={sourceConfig.wsBase || "http://localhost:8010"}
  />
)}
```

**位置**：
- 在 CommandCenter 下方
- 在左右布局的上方
- 占据全宽（max-width: 1500px）

## 浏览器兼容性

| 功能 | Chrome | Firefox | Safari | Edge |
|------|--------|---------|--------|------|
| HLS (m3u8) | ✅ | ✅ | ✅** | ✅ |
| FLV | ⚠️ | ⚠️ | ❌ | ⚠️ |
| 视频控制 | ✅ | ✅ | ✅ | ✅ |
| 全屏播放 | ✅ | ✅ | ✅ | ✅ |

\*\*Safari 通过原生 HLS 支持  
⚠️ 需要特定的浏览器支持或扩展

## 性能考量

### 内存使用
- HLS.js: ~5-10 MB
- FLV.js: ~3-5 MB
- 视频缓冲: 可配置（当前 60 秒）

### 网络带宽
- 取决于直播流的比特率
- HLS 通常 1-5 Mbps
- FLV 通常 0.5-3 Mbps

### 延迟
- HLS: 10-30 秒（标准 HTTP Live Streaming 延迟）
- FLV: 2-5 秒（更低的延迟）

## 错误处理

### 常见错误和解决方案

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| 未提供房间ID | roomId 为空 | 确保选择了数据源并输入房间ID |
| 获取直播流失败 | 网络问题 | 检查网络连接和后端状态 |
| 未找到直播流URL | 房间不在直播 | 确保目标房间正在直播 |
| 无法加载播放器 | CDN 不可用 | 检查网络连接或使用代理 |
| 媒体加载失败 | 流 URL 过期或错误 | 重新连接获取新的 URL |

## 测试清单

- [ ] 后端 `/media-url` 端点可访问
- [ ] 房间未在直播时显示合适错误
- [ ] 房间直播时能够获取流 URL
- [ ] HLS 格式流能够正常播放
- [ ] FLV 格式流能够正常播放（如可用）
- [ ] 视频播放器全屏功能正常
- [ ] 在网络不稳定时有重试机制
- [ ] 关闭房间连接时播放器清理正确

## 后续改进建议

### 短期（可立即实现）
1. **分辨率选择** - 添加清晰度切换
2. **截图功能** - 保存当前画面
3. **PiP 模式** - 画中画观看
4. **播放速率** - 调整播放速度

### 中期（需要后端配合）
1. **录制功能** - 本地录制直播
2. **字幕支持** - 自动生成字幕
3. **音频提取** - 分离出音频轨道
4. **多码率自适应** - 根据网速自动调整

### 长期（架构优化）
1. **直播存档** - 保存回放链接
2. **多窗口PiP** - 同时观看多个房间
3. **个性化设置** - 保存用户偏好
4. **CDN 优化** - 使用更快的 CDN

## 依赖关系

### NPM 依赖
无新增 npm 依赖

### 外部 CDN 资源
- HLS.js: `https://cdn.jsdelivr.net/npm/hls.js@latest`
- FLV.js: `https://cdn.jsdelivr.net/npm/flv.js@latest/dist/flv.min.js`

### 后端依赖（已有）
- FastAPI
- Selenium（用于无头浏览器）
- webdriver-manager（驱动管理）

## 重要注意事项

### 隐私和法律
- 用户使用此功能观看直播时应符合当地法律
- 不应用于未授权的直播监控或录制
- 遵守直播平台的服务条款

### 性能优化
- 首次加载播放器库需要网络访问
- 考虑在生产环境中缓存播放器库
- 监控内存使用，长时间直播时可能需要定期刷新

### 安全性
- 不在客户端验证 URL（由后端负责）
- 使用 CORS 策略限制跨域访问
- 考虑添加 Content Security Policy (CSP) 头

## 文档

### 已生成
- `VIDEO_PLAYER_GUIDE.md` - 完整技术指南
- `VIDEO_PLAYER_QUICK_START.md` - 快速开始指南
- `IMPLEMENTATION_SUMMARY.md` - 本文档

### 相关文档（已有）
- `STREAMGUARD_README.md` - 项目总体介绍
- `STREAMGUARD_DEPLOYMENT.md` - 部署指南
- `CONTRIBUTING.md` - 贡献指南

## 版本信息

- **StreamGuard 版本**：v2.2+
- **实现日期**：2026年3月
- **兼容 React**：19.2+
- **兼容浏览器**：现代浏览器（2020+）

## 总结

✅ **已完成**：
- VideoPlayer 组件开发
- 前端集成
- 错误处理和重试
- 用户界面设计
- 文档编写

🎯 **功能覆盖**：
- HLS / FLV 直播流播放
- 自动流格式选择
- 实时状态显示
- 错误恢复和重连

📊 **集成质量**：
- 无新增 NPM 依赖
- 与现有系统无缝集成
- 符合代码风格规范

---

**需要帮助？**  
查看 [VIDEO_PLAYER_GUIDE.md](./VIDEO_PLAYER_GUIDE.md) 了解更多技术细节。
