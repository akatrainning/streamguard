# 🎥 StreamGuard 实时直播视频集成指南

## 功能概述

StreamGuard 现在支持在前端面板中实时显示直播视频。视频播放器会自动从直播平台（如抖音）获取直播流 URL，并支持以下格式：

- **HLS (m3u8)** - HTTP Live Streaming，支持大多数浏览器和移动设备
- **FLV** - Flash Video，提供低延迟的直播体验

## 工作原理

### 数据流
```
用户界面 → 输入房间ID → 后端 /media-url API
                             ↓
                        抓取直播流URL
                             ↓
                        返回 m3u8/flv URL
                             ↓
                        前端 VideoPlayer
                             ↓
                        使用 HLS.js/FLV.js 播放
```

### 组件架构

1. **VideoPlayer.jsx** - 核心视频播放器组件
   - 支持多种直播流格式
   - 自动加载必要的播放库（HLS.js、FLV.js）
   - 显示实时播放状态和错误提示

2. **后端 API** - `/media-url` 端点
   - 接收房间ID（`roomId`）
   - 使用无头浏览器抓取直播流 URL
   - 返回 m3u8 或 flv 格式的流地址

## 使用方法

### 启动应用

1. **启动后端服务**（如果尚未启动）
```bash
cd streamguard-backend
python -m uvicorn app:app --reload --port 8010
```

2. **启动前端开发服务器**
```bash
cd streamguard-web
npm run dev
```

3. **打开浏览器**
```
http://localhost:5173
```

### 选择数据源

1. 在启动页面选择数据源类型
2. 如果选择 **"抖音直播"（douyin）**，输入直播间房间 ID
3. 点击连接

### 查看直播视频

连接成功后，仪表板上将显示：

1. **视频播放器** - 位于顶部
   - 实时显示直播内容
   - 支持全屏播放
   - 显示直播状态指示器

2. **弹幕面板** - 位于左下方
   - 实时聊天消息流
   - 情感分析指标
   - 风险弹幕警告

3. **分析面板** - 右侧
   - 理性度评分
   - 风险雷达
   - 拓扑图表

## 技术细节

### VideoPlayer 组件属性

```jsx
<VideoPlayer
  roomId="12345"              // 直播间房间ID
  wsBase="http://localhost:8010"  // 后端 API 基座 URL
/>
```

### 支持的直播流格式

| 格式 | 扩展名 | 兼容性 | 延迟 |
|------|--------|--------|------|
| HLS | .m3u8 | ⭐⭐⭐⭐⭐ 优秀 | 10-30秒 |
| FLV | .flv | ⭐⭐⭐ 良好 | 2-5秒 |

### 外部库

视频播放器依赖以下 CDN 资源：

- **HLS.js** - 来自 `https://cdn.jsdelivr.net/npm/hls.js@latest`
- **FLV.js** - 来自 `https://cdn.jsdelivr.net/npm/flv.js@latest/dist/flv.min.js`

这些库会在需要时自动加载，无需手动安装。

## 故障排查

### 问题：视频无法加载

**原因 1：房间ID错误或直播已关闭**
- 检查房间ID是否正确
- 确保直播间正在进行直播

**原因 2：后端 API 不可访问**
```bash
# 检查后端服务是否运行
curl http://localhost:8010/health

# 检查 CORS 配置
# app.py 中应包含前端地址（如 http://localhost:5173）
```

**原因 3：浏览器不支持某些格式**
- 尝试更新浏览器
- 检查浏览器控制台（F12）的错误信息

### 问题：视频延迟大

兼容性优先使用 HLS (m3u8) 格式，这可能导致 10-30 秒的延迟。如果您的直播间同时提供 FLV 格式，系统会自动选择 FLV 以获得更低的延迟。

### 问题：直播流 URL 获取超时

后端发现直播 URL 可能需要 15-25 秒，尤其是在网络较慢的情况下。建议等待完整的加载过程。

## 日志和调试

### 在浏览器控制台检查

打开开发者工具（F12），查看 Console 标签页：

```javascript
// 应该看到类似的日志
Fetching media URL from: http://localhost:8010/media-url?roomId=...
Got video URL: https://...m3u8
```

### 检查网络请求

- 打开开发者工具的 Network 标签
- 查看 `/media-url` 请求的响应
- 确认返回的 URL 有效

## 性能优化

### 对于低带宽网络

1. 视频播放器已配置：
   - HLS 最大缓冲时间：60秒
   - 最大加载延迟：4秒

2. 如果仍然卡顿，可以：
   - 降低浏览器的视频质量选项
   - 关闭其他标签页以释放带宽

### 对于高性能需求

- 使用 FLV 格式（如果可用）获得更低延迟
- 确保网络连接稳定
- 使用较新的浏览器版本

## 相关文件

- 前端组件：`streamguard-web/src/components/VideoPlayer.jsx`
- 主应用：`streamguard-web/src/App.jsx`
- 后端 API：`streamguard-backend/app.py` → `@app.get("/media-url")`
- 介质发现函数：`streamguard-backend/app.py` → `_discover_douyin_media_url()`

## 下一步

### 可能的增强功能

1. **分辨率选择** - 添加自适应比特率选择
2. **录制功能** - 支持本地录制直播内容
3. **截图功能** - 捕获当前视频帧
4. **PiP 模式** - 画中画模式便于多任务处理
5. **字幕支持** - 自动生成和显示实时字幕

### 贡献

如果您发现问题或有改进建议，欢迎提交 Issue 或 Pull Request。

---

**版本**：StreamGuard v2.2+  
**最后更新**：2026年3月
