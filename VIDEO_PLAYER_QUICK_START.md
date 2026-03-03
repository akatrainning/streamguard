# 🎥 StreamGuard 实时直播视频 - 快速开始

## ✅ 已完成的功能

### 新增组件
- **VideoPlayer.jsx** - 完整的直播视频播放器组件
  - 支持 HLS (m3u8) 和 FLV 格式
  - 自动加载播放库（HLS.js、FLV.js）
  - 实时状态指示和错误提示

### 前端集成
- App.jsx 已更新，包含 VideoPlayer
- 视频播放器显示在仪表板顶部
- 与现有弹幕面板和分析面板协调工作

### 后端 API（已有）
- `/media-url` 端点用于获取直播流 URL
- 支持自动发现多种流格式

## 🚀 使用步骤

### 1. 启动后端（如未启动）
```bash
cd streamguard-backend
python -m uvicorn app:app --reload --port 8010
```

### 2. 启动前端
```bash
cd streamguard-web
npm run dev
```

### 3. 打开浏览器
```
http://localhost:5173
```

### 4. 操作步骤
1. 选择数据源 → **"抖音直播"**（douyin）
2. 输入直播间 **房间 ID**（例：7123456789）
3. 点击 **连接**
4. 稍等 15-25 秒，视频播放器将加载并显示直播内容

## 📋 文件清单

### 新创建
- `streamguard-web/src/components/VideoPlayer.jsx` - 视频播放器组件
- `VIDEO_PLAYER_GUIDE.md` - 完整的技术指南

### 已修改  
- `streamguard-web/src/App.jsx` - 添加 VideoPlayer 导入和集成

## ⚙️ 配置说明

### 环境变量（可选）
如需修改后端端口或 API 地址，在 DataSourceSelector 中修改 `wsBase` 配置。

### 浏览器兼容性
| 浏览器 | HLS | FLV |
|--------|-----|-----|
| Chrome | ✅ | ⚠️** |
| Firefox | ✅ | ⚠️** |
| Safari | ✅ | ❌ |
| Edge | ✅ | ⚠️** |

*\*\*需要浏览器支持 MediaSource Extensions*

## 🛠️ 故障排查

### 视频无法加载
```bash
# 1. 检查后端是否运行
curl http://localhost:8010/health

# 2. 检查房间ID是否正确
# 3. 查看浏览器控制台（F12）的错误日志

# 4. 检查 CORS 配置
# 确保 app.py 中允许前端地址
```

### 直播流发现失败
- 确保房间正在直播
- 等待完整的 15-25 秒发现时间
- 检查网络连接

## 🎬 视频流格式说明

### HLS (m3u8)
- **优点**：兼容性好，支持自适应比特率
- **缺点**：延迟 10-30 秒
- **使用场景**：稳定直播观看

### FLV
- **优点**：低延迟 2-5 秒
- **缺点**：兼容性一般
- **使用场景**：对延迟敏感的应用

## 📊 实时监控功能

现在可以同时查看：
1. **📺 实时直播** - 顶部视频播放器
2. **💬 弹幕流** - 实时聊天消息、情感分析
3. **📈 分析指标** - 理性度、风险等级、意图分布
4. **🎯 语义分析** - 言论内容审查

## 🔗 相关链接

- [完整技术指南](./VIDEO_PLAYER_GUIDE.md)
- [原 README](./STREAMGUARD_README.md)
- [项目贡献指南](./CONTRIBUTING.md)

## ❓ 常见问题

**Q: 为什么发现直播流 URL 需要这么久？**  
A: 后端使用无头浏览器自动化抓取，需要加载整个页面和检查网络请求，通常需要 15-25 秒。

**Q: 可以自定义流 URL 吗？**  
A: 当前版本自动发现。如需自定义，可修改 `VideoPlayer.jsx` 的 `useEffect` 钩子。

**Q: 离线或网络差时怎么办？**  
A: 视频播放器有重试机制和错误提示。确保网络连接稳定后重新连接。

**Q: 支持录制直播吗？**  
A: 当前版本支持原生视频播放器的控制（暂停、音量等）。全屏录制可使用浏览器扩展。

## 📝 版本信息

- **StreamGuard 版本**：v2.2+
- **新功能添加日期**：2026年3月
- **兼容 Node.js**：16+
- **兼容 Python**：3.8+

---

当遇到问题时，请查看完整的 [VIDEO_PLAYER_GUIDE.md](./VIDEO_PLAYER_GUIDE.md) 获取更多帮助。
