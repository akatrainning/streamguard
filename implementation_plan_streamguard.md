# StreamGuard (直播理性哨兵) 开发方案

## 1. 项目定位

将 `agentdojo` 中的**语义对齐 (Semantic Alignment)** 技术落地于直播带货场景。通过对主播话术与商品事实的实时对齐，降低消费者的理性缺失，识别消费陷阱。

## 2. 核心功能

* **实时语义馈送 (Live Semantic Feed)**: 实时展示主播话术。
  * **Fact (事实)**: 绿色标记，表示已与详情页对齐。
  * **Hype (噱头)**: 黄色标记，表示催促性语义。
  * **Trap (陷阱)**: 红色标记，表示语义冲突。
* **理性指数仪表盘 (Rationality Index)**: 基于 [DualTrackShield](file:///d:/%E5%AD%A6%E4%B9%A0%E8%B5%84%E6%96%99/%E5%A4%A7%E5%88%9B/2026/%E8%AE%BA%E6%96%87/MELON/agentdojo/src/agentdojo/agent_pipeline/dual_track_shield.py#37-548) 的对齐分数动态生成理性评估指数。
* **风险雷达图 (Risk Analysis)**: 维度包括价格透明度、话术压力值、描述真实度等。
* **理性确认闸门 (Rationality Gate)**: 在下单前的“冷静期”交互。

## 3. 视觉设计 (Premium Aesthetics)

* **主题**: 暗黑极客风 (Deep Space Black & Neon Cyan)。
* **材质**: 玻璃拟态 (Glassmorphism)，大量使用毛玻璃背景与磨砂质感。
* **动画**: 使用 `framer-motion` 实现平滑的入场动画、数据增长滚动与实时波形反馈。
* **布局**: 双栏布局。左侧模拟直播间，右侧为 AI 分析中枢。

## 4. 技术栈

* **前端框架**: React (Vite)
* **样式库**: Vanilla CSS (CSS Modules) + TailwindCSS (如果需要快速布局)
* **动画库**: Framer Motion
* **图表库**: Recharts / Chart.js

## 5. UI 概念图

![bd32f3eb-7c85-4b3f-a730-dff56a70b986](file:///C:/Users/%E9%99%88%E5%BF%92%E4%B9%90/Pictures/Typedown/bd32f3eb-7c85-4b3f-a730-dff56a70b986.png)



## 6. 开发步骤

1. **基础设施搭建**: 初始化 Vite + React 环境。
2. **核心样式系统**: 定义颜色、字体、毛玻璃变量。
3. **仪表盘 UI 开发**: 实现布局与静态组件。
4. **动态模拟与动画**: 接入模拟数据流，实现动态交互效果。
5. **算法联动**: 预留后端接口，对接 [DualTrackShield](file:///d:/%E5%AD%A6%E4%B9%A0%E8%B5%84%E6%96%99/%E5%A4%A7%E5%88%9B/2026/%E8%AE%BA%E6%96%87/MELON/agentdojo/src/agentdojo/agent_pipeline/dual_track_shield.py#37-548) 逻辑。


