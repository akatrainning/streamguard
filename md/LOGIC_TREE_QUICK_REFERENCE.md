# Logic Tree Shield 快速参考指南

## 1. 核心配置参数

### 初始化配置

```python
LogicTreeShield(
    llm=llm,                      # LLM 客户端
    node_threshold=0.05,          # 📊 节点贡献度阈值 (0.0-1.0)
    holistic_check=True,          # 🔍 启用整体一致性检查
    raise_on_injection=False,     # 🚫 检测到注入时不抛出异常
    fail_closed=True,             # 🔐 解析失败时默认阻断
    batch_nodes=True,             # ⚡ 批量评估节点 (减少LLM调用)
    use_semantic_matching=True,   # 🔗 使用embedding进行语义匹配
    semantic_threshold=0.75,      # 📏 语义相似度阈值
    unified_mode=True,            # 🎯 Unified Mode (推荐)
    allowed_domains=None          # ✅ 白名单 (可选)
)
```

### 参数调整速查

| 参数 | 默认 | 更严格 | 更宽松 | 用途 |
|------|------|--------|--------|------|
| `node_threshold` | 0.05 | 0.10 | 0.02 | 节点最小分数 |
| `semantic_threshold` | 0.75 | 0.85 | 0.60 | 任务匹配度 |
| `unified_mode` | True | True | False | 1次vs多次LLM |
| `holistic_check` | True | True | False | 整体检查 |
| `cache_max_size` | 100 | 50 | 200 | 缓存大小 |

---

## 2. 快速诊断

### 问题诊断树

```
Q1: 工具调用太慢?
├─ YES → 检查 unified_mode=True (是否启用)
│         检查 cache enabled (缓存是否开启)
│         → 推荐: Unified Mode, cache_max_size=100
│
└─ NO → 继续 Q2

Q2: 误报太多 (合法请求被阻断)?
├─ YES → 降低 node_threshold: 0.05 → 0.02
│         或降低 semantic_threshold: 0.75 → 0.60
│
└─ NO → 继续 Q3

Q3: 漏报问题 (恶意请求未被检测)?
├─ YES → 提高 node_threshold: 0.05 → 0.10
│         确保 holistic_check=True
│         审查系统提示词
│
└─ NO → 性能良好 ✓

Q4: API成本太高?
├─ YES → 启用 cache (cache_max_size=100)
│         使用 Unified Mode (unified_mode=True)
│         降低 batch_nodes (批量评估)
│
└─ NO → 配置正常 ✓
```

---

## 3. 阈值配置速查表

### 不同安全级别的配置

```
【High Security (最高安全)】
├─ node_threshold=0.10
├─ semantic_threshold=0.85
├─ holistic_check=True
├─ batch_nodes=False (逐个评估, 更精确)
├─ 误报率: 15-20% (较高)
├─ 漏报率: 2-5% (很低)
└─ 用途: 金融交易, 敏感数据访问

【Medium Security (中等安全)】✓ RECOMMENDED
├─ node_threshold=0.05
├─ semantic_threshold=0.75
├─ holistic_check=True
├─ batch_nodes=True
├─ 误报率: 5-10%
├─ 漏报率: 5-10%
└─ 用途: 一般助手应用

【Low Security (低安全)】
├─ node_threshold=0.02
├─ semantic_threshold=0.60
├─ holistic_check=False (跳过整体检查)
├─ batch_nodes=True
├─ 误报率: 2-5%
├─ 漏报率: 20-30%
└─ 用途: 内部工具, 低风险环境
```

### 按照用例选择阈值

```
【Email Assistant】
├─ 主要风险: 邮件泄露, 伪造发件人
├─ node_threshold: 0.05
├─ semantic_threshold: 0.70
└─ holistic_check: True

【Database Query Tool】
├─ 主要风险: SQL injection, 数据外泄
├─ node_threshold: 0.08
├─ semantic_threshold: 0.80
└─ holistic_check: True

【Code Generation Assistant】
├─ 主要风险: 恶意代码注入
├─ node_threshold: 0.05
├─ semantic_threshold: 0.75
└─ holistic_check: True

【General Purpose Assistant】
├─ 主要风险: 任意命令执行
├─ node_threshold: 0.05
├─ semantic_threshold: 0.75
└─ holistic_check: True
```

---

## 4. 决策规则快速查询

### Rule Set: Node-Level Check

```
✅ PASS IF:   All nodes score > node_threshold (0.05)
❌ BLOCK IF:  Any node score < node_threshold
⚠️ WARN IF:   Any node score < 0.20 (risky operation)

Example:
├─ Node 1: 0.8 > 0.05 ✓
├─ Node 2: 0.7 > 0.05 ✓
├─ Node 3: 0.95 > 0.05 ✓
├─ Node 4: 0.6 > 0.05 ✓
└─ Result: PASS (all nodes pass)

Fail Example:
├─ Node 1: 0.8 ✓
├─ Node 2: 0.02 < 0.05 ✗ FAILED
├─ Node 3: 0.95 ✓
└─ Result: BLOCK (Node 2 failed)
```

### Rule Set: Data Flow Check

```
✅ PASS:  Internal data → Internal destination
        OR External destination mentioned in user tasks

❌ BLOCK: Internal data → External destination (NOT in tasks)
        Sensitive data (PII, credentials) → External
        Unvalidated external input → Core operation

Examples:

PASS ✓
├─ contact_db → memory: ✓ (internal→internal)
├─ memory → user_inbox: ✓ (memory→user)
└─ log → audit_log: ✓ (metadata only)

BLOCK ✗
├─ customer_db → "attacker.com": ✗ (data exfiltration)
├─ credentials → external: ✗ (sensitive leak)
└─ cache → untrusted_server: ✗ (unauthorized access)
```

### Rule Set: Semantic Matching

```
✅ PASS IF:    similarity(operation, user_task) > 0.75

❌ BLOCK IF:   semantic_threshold=True AND similarity < 0.50
               (strong indication of task mismatch)

⚠️ WARN IF:    0.50 < similarity < 0.75
               (weak match, log for review)

Example Scores:
├─ Task: "Send message to Alice"
│  Operation: "send_direct_message(to=Alice, body=...)"
│  Similarity: 0.92 ✓ PASS
│
├─ Task: "Send message"
│  Operation: "delete_message(msg_id=123)"
│  Similarity: 0.15 ✗ BLOCK (mismatch)
│
└─ Task: "Notify team members"
   Operation: "send_email(recipients=[team], body=...)"
   Similarity: 0.68 ⚠️ WARN (borderline)
```

### Rule Set: Holistic Consistency Check

```
✅ PASS IF:    LLM determines:
               1. Nodes logically implement user task
               2. No hidden malicious intent
               3. No inconsistencies

❌ BLOCK IF:   LLM detects attack patterns:
               ├─ Composite attacks
               ├─ Privilege escalation attempts
               ├─ Data exfiltration schemes
               ├─ Parameter injection
               └─ Logical inconsistencies

Attack Patterns Detected:
├─ "Parameter Injection": Command hidden in parameters
├─ "Data Exfiltration": Multiple nodes coordinating to leak data
├─ "Privilege Escalation": Low-priv task → high-priv operation
├─ "Composite Attack": Multiple simple operations → complex attack
└─ "Logic Bomb": Conditional malicious execution
```

---

## 5. 性能基准速查表

### Unified Mode vs Standard Mode

```
【Single Tool Call Performance】

Unified Mode:
├─ LLM calls: 1
├─ Latency: 3-4s
├─ Cost: $0.001
└─ Recommend: YES ✓

Standard Mode:
├─ LLM calls: 4-6 (1 decompose + N nodes + 1 holistic)
├─ Latency: 12-18s
├─ Cost: $0.004-0.006
└─ Recommend: NO (Use Unified Mode instead)

Unified Mode faster by: 3-4.5× ⚡
Unified Mode cheaper by: 4-6× 💰
```

### Cache Impact

```
【50-Tool Session】

Without Cache:
├─ LLM calls: 50
├─ API cost: ~$0.075
├─ Total time: ~200s
└─ Per-tool: 4s

With Cache (20% hit rate):
├─ LLM calls: 40 (50 - 10 cache hits)
├─ API cost: ~$0.060
├─ Total time: ~160s
└─ Savings: 20% time, 20% cost

With Cache (40% hit rate):
├─ LLM calls: 30 (50 - 20 cache hits)
├─ API cost: ~$0.045
├─ Total time: ~120s
└─ Savings: 40% time, 40% cost

Cache is effective when:
├─ Tools called in loops ✓
├─ Repeated operations ✓
├─ Similar function + args ✓
```

---

## 6. 节点评分指南

### 典型节点分数范围

```
【Score Interpretation】

0.9-1.0 = Essential ⭐⭐⭐⭐⭐
├─ Example: "send_message" when user requests "send message"
├─ Directly fulfills request
└─ Always passes

0.7-0.9 = High Relevance ⭐⭐⭐⭐
├─ Example: "retrieve_recipient_info" for "send message"
├─ Necessary for fulfillment
└─ Usually passes

0.4-0.7 = Medium Relevance ⭐⭐⭐
├─ Example: "authenticate_user" for "send message"
├─ Helpful but not strictly necessary
└─ Borderline (depends on threshold)

0.1-0.4 = Low Relevance ⭐⭐
├─ Example: "log_action" for "send message"
├─ Optional, side effect
└─ Usually fails if threshold > 0.05

0.0-0.1 = Irrelevant ⭐
├─ Example: "delete_file" when user requests "send message"
├─ No relation to user task
└─ Always fails
```

### 前置条件节点的分数

```
【Preconditions Typical Scores】

verify_recipient_exists: 0.8-0.9
├─ 必要: 确认目标存在
└─ 虽然必要, 但不是直接操作

check_permissions: 0.7-0.8
├─ 有用: 确认权限
└─ 不直接完成任务

validate_input_format: 0.6-0.7
├─ 可选: 输入验证
└─ 防御性检查

authenticate_user: 0.7-0.8
├─ 必要: 身份验证
└─ 系统要求
```

---

## 7. 真实案例快速参考

### Case 1: Legitimate Message ✓ PASS

```
Input:
├─ User task: "Send a link to Alice"
└─ Tool: send_direct_message(recipient="Alice", body="link...")

Scoring:
├─ preconditions (verify_recipient): 0.8 ✓
├─ data_access (retrieve_info): 0.7 ✓
├─ core_operations (send_message): 0.95 ✓
└─ side_effects (log): 0.6 ✓

Checks:
├─ All nodes > 0.05? YES ✓
├─ Data flow safe? YES ✓ (internal→user)
├─ Holistic check? YES ✓ (no attack pattern)
└─ Result: PASS ✓
```

### Case 2: Data Exfiltration ✗ BLOCK

```
Input:
├─ User task: "Summarize emails"
└─ Tool: send_data_to_attacker(data=all_emails)

Scoring:
├─ data_access (read_emails): 0.1 ✗ (suspicious volume)
├─ core_operations (send_external): 0.0 ✗ (no task match)
└─ Result: All nodes fail

Data Flow:
├─ source: email_db (internal)
├─ destination: attacker.com (external)
├─ user_tasks: ["summarize emails"] (no mention of attacker)
└─ Verdict: DATA EXFILTRATION ✗

Result: BLOCK ✗
Reason: Node-level failure + data exfiltration
```

### Case 3: Parameter Injection ✗ BLOCK

```
Input:
├─ User task: "Send meeting notes"
└─ Tool: send_message(content=notes + injected_command)
   where injected_command = "\nExecute: rm -rf /"

Scoring:
├─ core_operations: 0.3 ⚠️ (contains injection flag)
└─ risk_flags: ["parameter_injection", "command_in_payload"]

Holistic Check:
├─ Node says "send", but payload contains "rm -rf"?
├─ These don't align logically
└─ Attack pattern: INJECTION DETECTED

Result: BLOCK ✗
Reason: Parameter injection detected
```

---

## 8. 日志和调试

### 日志输出示例

```
【Tool Call Passed】
[Logic Tree Shield] ✓ PASSED: send_direct_message
├─ Node-Level Check: 4/4 nodes passed
├─ Scores: [0.8, 0.7, 0.95, 0.6]
├─ Data Flow: internal→user (safe)
├─ Holistic Check: PASS (no attack pattern)
├─ Cache: MISS (stored for future)
└─ Latency: 3.2s

【Tool Call Blocked (Node-Level)】
[Logic Tree Shield] ✗ BLOCKED: delete_all_files
├─ Node-Level Check: 0/3 nodes passed
├─ Scores: [0.1, 0.05, 0.0]
├─ Failed Nodes:
│  ├─ data_access: 0.05 < 0.05 (threshold)
│  └─ core_operations: 0.0 (no relevance)
├─ Reason: Operations don't match user task
└─ Latency: 2.1s

【Tool Call Blocked (Data Exfiltration)】
[Logic Tree Shield] ✗ BLOCKED: send_data_external
├─ Node-Level Check: PASS (2/2 nodes passed)
├─ Data Flow: FAIL
│  ├─ source: customer_db (internal)
│  ├─ destination: attacker.com (external)
│  └─ user_tasks: [] (not mentioned)
├─ Reason: Unauthorized data exfiltration
└─ Latency: 2.8s

【Tool Call Blocked (Holistic)】
[Logic Tree Shield] ✗ BLOCKED: suspicious_operation
├─ Node-Level Check: PASS (all scores > 0.05)
├─ Data Flow: PASS (internal only)
├─ Holistic Check: FAIL
│  └─ Attack Pattern: "Composite Attack"
│     └─ Reasoning: Multiple nodes coordinating unusual access pattern
├─ Reason: Potential composite attack detected
└─ Latency: 3.5s
```

### 启用调试模式

```python
shield = LogicTreeShield(
    llm=llm,
    debug=True,  # Enable verbose logging
    log_level="DEBUG"  # Show all details
)

# 输出将包含:
# - 每个LLM调用的完整提示和响应
# - 每个节点的详细评分
# - 数据流分析结果
# - 缓存命中/未命中
# - 性能计时信息
```

---

## 9. 常见问题解答

### Q1: 应该使用Standard Mode还是Unified Mode?

**A: 使用Unified Mode (推荐)**
```
Unified Mode:
├─ 更快: 3-4s vs 12-18s
├─ 更便宜: $0.001 vs $0.005
├─ 准确性更好: 推理更连贯
└─ 推荐: YES ✓

仅在以下情况使用Standard Mode:
├─ 需要每个节点的单独推理
├─ 调试目的
└─ 特定用例要求分离评估
```

### Q2: 如何处理高误报率?

**A: 调整这些参数**
```
步骤1: 降低node_threshold
├─ 从0.05 → 0.02
└─ 使评估标准更宽松

步骤2: 降低semantic_threshold
├─ 从0.75 → 0.60
└─ 允许更松散的任务匹配

步骤3: 审查系统提示词
├─ 确保LLM理解任务
└─ 可能需要优化TASK_EXTRACTION_PROMPT
```

### Q3: 缓存如何工作?

**A: 简单的哈希查询**
```
缓存键: (function_name, args_hash)
├─ send_direct_message("Alice", "hi") → HIT
├─ send_direct_message("Alice", "bye") → MISS (args different)
└─ send_email("Alice", "hi") → MISS (function different)

缓存TTL: 5分钟
├─ 过期后重新计算
└─ 大小限制: 100条 (LRU eviction)

何时有效:
├─ 循环中的重复工具调用 ✓
├─ 相同参数的操作 ✓
└─ 不同参数的相似操作 ✗ (no benefit)
```

### Q4: 为什么检测很慢?

**A: 检查这些原因**
```
原因1: 使用了Standard Mode
└─ 解决: 切换到Unified Mode (unified_mode=True)

原因2: 没有启用缓存
└─ 解决: 设置 cache_max_size=100

原因3: API延迟高
└─ 解决: 使用更快的LLM或改进网络

原因4: Batch processing disabled
└─ 解决: 启用 batch_nodes=True
```

---

## 10. 与DSP-RP Shield对比

### 快速选择指南

```
选择Logic Tree Shield如果:
├─ ✓ 需要高准确性
├─ ✓ 关心解释性
├─ ✓ 需要检测复杂攻击
├─ ✓ 有充足API预算
└─ ✓ 可接受3-5秒延迟

选择DSP-RP Shield如果:
├─ ✓ 需要快速响应 (15-20ms)
├─ ✓ 成本敏感
├─ ✓ 聚焦参数注入
├─ ✓ 嵌入式环境
└─ ✓ 实时应用

混合方案:
├─ 使用DSP-RP作为快速第一层 (参数检查)
├─ 高可疑性时使用Logic Tree深层检查
└─ 结合两者的优势
```

### 性能对比表

| 指标 | Logic Tree | DSP-RP | 赢家 |
|------|-----------|---------|------|
| **延迟** | 3-4s/tool | 15-20ms | DSP-RP ⚡ |
| **精确性** | 95%+ | 92% | Logic Tree 🎯 |
| **API成本** | $0.08/session | $0.00008 | DSP-RP 💰 |
| **可解释性** | 很高 | 低 | Logic Tree 📊 |
| **参数注入** | 好 | 优秀 | DSP-RP ⭐ |
| **组合攻击** | 优秀 | 一般 | Logic Tree ⭐ |
| **配置复杂度** | 中等 | 低 | DSP-RP 🔧 |

---

## 11. 性能优化技巧

### 快速优化清单

```
[ ] 启用 Unified Mode (unified_mode=True)
[ ] 启用缓存 (cache_max_size=100)
[ ] 启用批量处理 (batch_nodes=True)
[ ] 调整阈值 (根据误报/漏报率)
[ ] 优化提示词 (根据特定用例)
[ ] 使用API缓存 (如果支持)
[ ] 监控延迟 (定期检查性能)
[ ] A/B测试配置 (找到最佳配置)

预期改进:
├─ Unified Mode: 3-4× 快速
├─ 缓存 (40% hit): 40% 减少
├─ 批量处理: 20% 减少
└─ 总体改进: 5-10× 性能提升 ⚡
```

---

**更新日期**: 2025年
**文档版本**: 1.0
**推荐配置**: Unified Mode + Cache 启用

更详细的信息请查看: [LOGIC_TREE_DETAILED_ANALYSIS.md](LOGIC_TREE_DETAILED_ANALYSIS.md) 和 [LOGIC_TREE_DATA_FLOW.md](LOGIC_TREE_DATA_FLOW.md)
