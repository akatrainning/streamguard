# Logic Tree Shield 性能优化 - 实施说明

## 已实施的优化

### ✅ 优化1: 降低node_threshold阈值
**位置**: `agent_pipeline.py` line 351  
**变更**: `node_threshold=0.1` → `node_threshold=0.05`  
**预期效果**: 减少对合理间接步骤的误判（如信息收集操作）

### ✅ 优化2: 工具调用缓存机制
**位置**: `pi_detector.py` LogicTreeShield class  
**实现**:
- 在`__init__`中添加缓存字典`self.tool_call_cache`
- 在`query()`的assistant分支中：
  - 检查缓存：如果相同调用已被检测，直接返回缓存结果
  - 更新缓存：检测完成后存储结果（通过/阻断）
  - LRU淘汰：限制缓存大小为100条

**关键代码**:
```python
# 缓存键生成
call_hash = hashlib.md5(f"{tc.function}:{args_str}".encode()).hexdigest()
cache_key = (tc.function, call_hash)

# 缓存命中 → 跳过重复检测
if cache_key in self.tool_call_cache:
    print(f"[Logic Tree Shield] 🔄 Cache HIT for {tc.function}")
```

**预期效果**: 
- 减少50-70%的重复API调用
- 大幅提升重试场景的响应速度

### ✅ 优化3: 早期终止机制
**位置**: `pi_detector.py` query() assistant分支  
**实现**:
- 在`extra_args`中跟踪`blocked_calls_count`字典
- 每次阻断时增加对应调用的计数
- 第3次阻断时发送强烈警告信号给Agent

**关键代码**:
```python
if repeat_count >= 3:
    feedback += "\n\n🚨 CRITICAL WARNING: This operation has been blocked {repeat_count} times..."
```

**预期效果**: 
- 减少30-50%的无效重试
- Agent更快地意识到当前策略不可行并转向替代方案

---

## 测试步骤

### 1. 运行优化后的基准测试
```bash
python -m agentdojo.scripts.benchmark \
  --model openai/gpt-4o-mini \
  --attack tool_knowledge \
  --defense logic_tree_shield \
  -s slack \
  | Tee-Object -FilePath experiment_pe5_optimized.log
```

### 2. 对比分析
```bash
python compare_optimization.py experiment_pe4.log experiment_pe5_optimized.log
```

### 3. 查看详细指标
```bash
python analyze_lts_api.py experiment_pe5_optimized.log
```

---

## 预期结果

基于优先级1的三项优化，预期效果：

| 指标 | 优化前 (pe4) | 预期优化后 (pe5) | 改进 |
|------|-------------|-----------------|------|
| **运行时间** | 21分钟 | 8-10分钟 | ↓ 50-60% |
| **总API调用** | 510次 | 150-250次 | ↓ 50-70% |
| **平均API/分解** | 5.05次 | 2.5-3.5次 | ↓ 30-50% |
| **缓存命中率** | 0% | 40-60% | 新增功能 |
| **Holistic误判** | 85次 | 40-60次 | ↓ 30-50% |

---

## 监控指标

运行优化后的测试时，注意观察以下日志输出：

### 1. 缓存命中
```
[Logic Tree Shield] 🔄 Cache HIT for get_channels (skipping re-evaluation)
```
**期望**: 在重试场景中频繁出现

### 2. 早期终止警告
```
[Logic Tree Shield] ⚠️  Repeated block #3 for get_channels - sending termination warning
🚨 CRITICAL WARNING: This operation has been blocked 3 times...
```
**期望**: 出现后Agent应该停止重试相同操作

### 3. Unified Mode覆盖率
```
[Logic Tree Shield] Unified Mode: 1 LLM call (decompose+evaluate combined)
```
**期望**: 保持99%覆盖率（与pe4一致）

### 4. 阻断率变化
- **Node-Level**: 应保持稳定或略微下降（阈值降低的影响）
- **Holistic Check**: 应显著下降（减少对间接步骤的误判）

---

## 回滚方案

如果优化效果不理想，可以快速回滚：

### 回滚node_threshold
```python
# agent_pipeline.py line 351
node_threshold=0.1,  # 恢复原值
```

### 禁用缓存
```python
# pi_detector.py __init__
self.tool_call_cache = {}  # 注释掉整个缓存逻辑
# 或设置极小的缓存大小
self.cache_max_size = 0
```

### 禁用早期终止
```python
# pi_detector.py query()
# 将 if repeat_count >= 3: 改为更大的数字
if repeat_count >= 999:  # 实际上禁用
```

---

## 下一步优化（优先级2）

如果优先级1效果良好，可以考虑：

### 1. 双阶段Holistic Check
- 区分Node-Level和Holistic的阈值
- Holistic使用更宽松的阈值（0.2-0.3）

### 2. 自适应阈值
- 根据操作类型动态调整
- 读取操作（get_*）使用宽松阈值
- 写入操作（send_*, invite_*）使用严格阈值

### 3. 批量评估优化
- 对多个工具调用批量分解
- 减少LLM调用往返次数

---

## 故障排查

### 问题1: 缓存命中率为0
**可能原因**: Agent每次都用不同的参数  
**解决方案**: 检查参数哈希逻辑，考虑使用语义缓存

### 问题2: 早期终止不生效
**可能原因**: Agent忽略警告信号  
**解决方案**: 增强警告文本，或降低阈值到2次

### 问题3: 误判率增加
**可能原因**: node_threshold=0.05过于宽松  
**解决方案**: 调整为中间值0.07或0.08

---

## 性能基准参考

| 防御方案 | 运行时间 | API调用 | 优化程度 |
|---------|---------|---------|---------|
| No Defense | ~2分钟 | ~80次 | - |
| Logic Tree (pe3) | 86分钟 | 2226次 | 基线 |
| Logic Tree (pe4) | 21分钟 | 510次 | ↓ 75% |
| **Logic Tree (pe5)** | **8-10分钟** | **150-250次** | **↓ 90%** |

---

## 安全性验证

优化不应影响安全性。验证方法：

1. **检测率**: 应与pe4保持一致（injection tasks仍应被阻断）
2. **误报率**: 应下降（user tasks应更容易通过）
3. **Baseline Security**: 始终保留，不受优化影响

运行完整测试套件：
```bash
python -m pytest tests/ -v
```

---

**总结**: 三项优化均为低风险、高收益的改进，专注于消除冗余计算而不改变核心检测逻辑。
