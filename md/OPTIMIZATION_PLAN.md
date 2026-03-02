# Logic Tree Shield 性能优化方案

## 问题分析

### 当前状况（experiment_pe4）
- **Holistic Check 失败**: 85次（占阻断的70%）
- **Node-Level 失败**: 40次（占阻断的33%）
- **总API调用**: 510次（21分钟运行时间）
- **Unified Mode覆盖率**: 99%（技术上正常）
- **问题核心**: Agent频繁重试被阻断的操作，导致大量重复的API调用

### 根本原因
1. **Holistic Check过于严格**: 许多合理的间接步骤被误判（如查询频道列表、读取消息等准备性操作）
2. **缺乏调用去重**: 相同/相似的工具调用被重复检查多次
3. **无早期终止机制**: Agent在多次阻断后仍继续尝试相同操作
4. **阈值不合理**: `node_threshold=0.1`对间接贡献的操作过于苛刻

---

## 优化策略

### 🎯 方案1: 工具调用缓存（推荐 - 立即可实施）

**原理**: 对相同的工具调用（函数名+参数哈希）缓存检测结果，避免重复检查

**实现**:
```python
# 在 LogicTreeShield.__init__ 中添加
self.tool_call_cache = {}  # {(func_name, args_hash): (is_blocked, reason)}
self.cache_ttl = 10  # 缓存最近10次检测结果
```

**预期效果**: 
- 减少50-70%的重复API调用
- 响应时间提升40-60%

---

### ⚡ 方案2: 调整Holistic Check策略

**问题**: Holistic Check对workflow中的信息收集步骤过于严格

**优化选项**:

#### 选项A: 双阶段检查（推荐）
```python
# 第一阶段：Node-Level检查（严格）
if any(score < self.node_threshold for score in node_scores):
    # 阻断明显恶意的节点
    return BLOCK

# 第二阶段：Holistic Check（宽松）
# 仅当 Node-Level 全部通过时才进行
if all_nodes_pass and holistic_score < 0.3:  # 更低的阈值
    return BLOCK
else:
    return ALLOW
```

**预期效果**:
- Holistic Check误判率降低60-80%
- 合理的信息收集操作（如`get_channels`, `get_users`）通过率提升

#### 选项B: 自适应阈值
```python
# 根据操作类型动态调整阈值
READ_OPS = {"get_channels", "read_channel_messages", "get_users_in_channel"}
WRITE_OPS = {"send_message", "invite_user", "delete_channel"}

if tc.function in READ_OPS:
    # 读取操作：宽松阈值
    node_threshold = 0.05
    holistic_threshold = 0.2
elif tc.function in WRITE_OPS:
    # 写入操作：严格阈值
    node_threshold = 0.1
    holistic_threshold = 0.5
```

**预期效果**:
- 读取操作误判率降低70%
- 保持写入操作的安全性

---

### 🛡️ 方案3: 早期终止机制

**原理**: 当某个工具调用连续被阻断N次时，向Agent发送明确的终止信号

**实现**:
```python
# 在 extra_args 中跟踪
if "blocked_calls_count" not in extra_args:
    extra_args["blocked_calls_count"] = {}

call_key = (tc.function, json.dumps(tc.args, sort_keys=True))
extra_args["blocked_calls_count"][call_key] = extra_args["blocked_calls_count"].get(call_key, 0) + 1

if extra_args["blocked_calls_count"][call_key] >= 3:
    # 发送强制终止信号
    feedback = f"CRITICAL: This operation has been blocked {extra_args['blocked_calls_count'][call_key]} times. " \
               f"It violates security policies. Please try a completely different approach."
    # 可选：设置 raise_on_injection=True 强制中止
```

**预期效果**:
- 减少30-50%的无效重试
- Agent更快地转向替代方案

---

### 📊 方案4: 批量评估优化（已部分实现，需增强）

**当前问题**: 虽然设置了`batch_nodes=True`，但在Unified Mode下可能未充分利用

**优化**:
```python
# 在 query() 中批量处理多个工具调用
tool_calls = last_msg.get("tool_calls")
if len(tool_calls) > 1:
    # 一次性分解所有工具调用
    batch_results = self._batch_decompose_and_evaluate(tool_calls, context, user_tasks)
    # 减少LLM调用次数
```

**预期效果**:
- 多工具调用场景下API调用减少40%

---

### 🔧 方案5: 调整node_threshold阈值

**当前设置**: `node_threshold=0.1`（严格）

**建议调整**:
```python
# agent_pipeline.py line 351
shield = LogicTreeShield(
    llm=llm,
    node_threshold=0.05,  # 从 0.1 降低到 0.05（更宽松）
    holistic_check=True,
    holistic_threshold=0.3,  # 新增：独立的holistic阈值
    raise_on_injection=False,
    unified_mode=True
)
```

**理由**: 
- 根据Prompt中的说明，0.2-0.8 的间接贡献是合理的
- 0.1阈值会误判很多合理的准备性步骤
- 0.05阈值仍能阻断明显的恶意操作（score=0.0）

**预期效果**:
- Node-Level误判率降低50%
- 保持对明显注入的检测能力

---

## 实施优先级

### 🥇 优先级1（立即实施 - 高收益低风险）
1. **调整node_threshold**: 0.1 → 0.05
2. **工具调用缓存**: 实现call_key缓存机制
3. **早期终止**: 3次阻断后发送强制终止信号

**预期总体效果**: 运行时间从21分钟降至**8-10分钟**（减少50-60%）

### 🥈 优先级2（短期优化 - 需测试验证）
4. **双阶段Holistic Check**: 区分Node-Level和Holistic的阈值
5. **自适应阈值**: 根据操作类型调整

**预期总体效果**: 在优先级1基础上再降至**5-7分钟**（累计减少70-75%）

### 🥉 优先级3（中期优化 - 需要重构）
6. **批量评估优化**: 多工具调用批处理
7. **语义缓存**: 对相似（非完全相同）的调用复用结果

**预期总体效果**: 最终降至**3-5分钟**（累计减少80-85%）

---

## 实施代码示例

### 示例1: 工具调用缓存

```python
# 在 pi_detector.py LogicTreeShield.query() 的 assistant 分支中

# 在检查 tool_calls 的循环开始前
for tc in tool_calls:
    # 生成缓存键
    import hashlib
    args_str = json.dumps(tc.args or {}, sort_keys=True)
    call_hash = hashlib.md5(f"{tc.function}:{args_str}".encode()).hexdigest()
    cache_key = (tc.function, call_hash)
    
    # 检查缓存
    if cache_key in self.tool_call_cache:
        cached_result = self.tool_call_cache[cache_key]
        print(f"[Logic Tree Shield] 🔄 Cache hit for {tc.function}")
        
        if cached_result["is_blocked"]:
            # 使用缓存的阻断结果
            feedback = cached_result["feedback"]
            new_messages = list(messages)
            tool_msg = {
                "role": "tool",
                "content": [{"type": "text", "content": feedback + " (cached)"}],
                "tool_call_id": tc.id,
                "tool_call": tc,
                "error": feedback
            }
            new_messages.append(tool_msg)
            extra_args["is_injection"] = True
            return query, runtime, env, new_messages, extra_args
        else:
            # 缓存显示通过，跳过检查
            continue
    
    # ... 正常的检查流程 ...
    
    # 检查完成后，存入缓存
    self.tool_call_cache[cache_key] = {
        "is_blocked": is_blocked,
        "feedback": feedback,
        "timestamp": time.time()
    }
    
    # 限制缓存大小（LRU）
    if len(self.tool_call_cache) > 100:
        oldest_key = min(self.tool_call_cache.keys(), 
                        key=lambda k: self.tool_call_cache[k]["timestamp"])
        del self.tool_call_cache[oldest_key]
```

### 示例2: 调整阈值

```python
# 在 agent_pipeline.py line 351
shield = LogicTreeShield(
    llm=llm,
    node_threshold=0.05,      # 降低阈值（更宽松）
    holistic_check=True,
    raise_on_injection=False,
    unified_mode=True,
    adaptive_threshold=True   # 新增：启用自适应阈值
)

# 在 pi_detector.py LogicTreeShield.__init__ 添加参数
def __init__(self, ..., adaptive_threshold: bool = False):
    ...
    self.adaptive_threshold = adaptive_threshold
    
    # 定义操作分类
    self.READ_OPERATIONS = {
        "get_channels", "read_channel_messages", "get_users_in_channel",
        "read_inbox", "get_webpage", "get_users"
    }
    self.WRITE_OPERATIONS = {
        "send_direct_message", "send_channel_message", "invite_user_to_slack",
        "remove_user_from_slack", "delete_channel", "post_webpage"
    }
```

---

## 监控指标

实施优化后，监控以下指标：

1. **API调用次数**: 期望从510降至150-200
2. **运行时间**: 期望从21分钟降至5-10分钟
3. **阻断率**: Node-Level和Holistic的阻断比例
4. **缓存命中率**: 目标≥40%
5. **误判率**: 检查合理操作的通过率

---

## 测试建议

```bash
# 测试优化后的性能
python -m agentdojo.scripts.benchmark \
  --model openai/gpt-4o-mini \
  --attack tool_knowledge \
  --defense logic_tree_shield \
  -s slack \
  | Tee-Object -FilePath experiment_pe5_optimized.log

# 对比分析
python analyze_lts_api.py experiment_pe4.log experiment_pe5_optimized.log
```

---

## 风险评估

| 优化方案 | 安全风险 | 缓解措施 |
|---------|---------|---------|
| 降低node_threshold | 低 | 保留baseline security检查 |
| 工具调用缓存 | 中 | 限制缓存时效（10次调用后过期）|
| 早期终止 | 低 | 仅在3次失败后触发 |
| 自适应阈值 | 中 | 写入操作保持严格阈值 |
| 批量评估 | 低 | 不改变检测逻辑 |

---

## 总结

**当前状态**: Unified Mode技术上工作正常，但受限于重试和严格阈值

**核心问题**: Holistic Check误判 + Agent重复尝试 = 大量浪费的API调用

**最佳组合方案**:
1. ✅ 降低node_threshold (0.1 → 0.05)
2. ✅ 实现工具调用缓存
3. ✅ 添加早期终止机制

**预期效果**: 运行时间从21分钟降至**5-8分钟**（提升60-75%）

**实施难度**: 低（主要是参数调整和简单缓存逻辑）

**安全性影响**: 极小（保留所有核心检测逻辑）
