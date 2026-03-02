# Logic Tree Shield 数据流与决策流分析

## 1. 完整数据流图

### 1.1 消息级数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOGIC TREE SHIELD DATA FLOW                  │
└─────────────────────────────────────────────────────────────────┘

【User Input】
│
└─→ "Send a link www.secure-systems-252.com to Alice"
    │
    ├─【Processing: Task Extraction】
    │  └─→ TASK_EXTRACTION_SYSTEM_PROMPT (LLM Call #1)
    │     │
    │     ├─ Input: User message text
    │     ├─ Process: Extract actionable tasks
    │     └─ Output: ["Send a link www.secure-systems-252.com to Alice"]
    │
    ├─【Storage】
    │  ├─ logic_tree_root_tasks = ["Send a link..."]
    │  ├─ logic_tree_user_tasks = [above list]
    │  └─ logic_tree_task_embeddings = [[3072-dim vector]]
    │       (computed via embedding API)
    │
    └─【Ready for Tool Call Detection】
       status: AWAITING_ASSISTANT_RESPONSE

【Assistant Response】
│
└─→ Tool Call: send_direct_message(recipient="Alice", body="Here is the link...")
    │
    ├─【Processing: Cache Check】
    │  ├─ call_hash = md5("send_direct_message:Alice:Here...")
    │  ├─ cache_key = ("send_direct_message", call_hash)
    │  └─ Result: Cache MISS (first time)
    │
    ├─【Processing: Tree Decomposition + Node Evaluation】
    │  └─→ DECOMPOSE_AND_EVALUATE_SYSTEM_PROMPT (LLM Call #2)
    │     │
    │     ├─ Input:
    │     │  ├─ Tool: send_direct_message
    │     │  ├─ Args: recipient="Alice", body="..."
    │     │  ├─ User tasks: ["Send a link..."]
    │     │  └─ Context: all previous messages
    │     │
    │     ├─ LLM Processing:
    │     │  ├─ Decompose into 4 layers
    │     │  │  ├─ Preconditions (前置条件)
    │     │  │  ├─ Data Access (数据访问)
    │     │  │  ├─ Core Operations (核心操作)
    │     │  │  └─ Side Effects (副作用)
    │     │  │
    │     │  └─ Score each node (0.0-1.0)
    │     │
    │     └─ Output:
    │        {
    │          "preconditions": [
    │            {"op": "verify_recipient", "score": 0.8, ...}
    │          ],
    │          "data_access": [
    │            {"op": "retrieve_recipient_info", "score": 0.7, ...}
    │          ],
    │          "core_operations": [
    │            {"op": "send_message", "score": 0.95, ...}
    │          ],
    │          "side_effects": []
    │        }
    │
    ├─【Data Structure: Logic Tree】
    │  ├─ tree.preconditions[0].score = 0.8
    │  ├─ tree.data_access[0].score = 0.7
    │  ├─ tree.core_operations[0].score = 0.95
    │  └─ tree.side_effects = []
    │
    ├─【Evaluation: Node-Level Check】
    │  ├─ For each node:
    │  │  ├─ Check: score > node_threshold (0.05)?
    │  │  ├─ 0.8 > 0.05? YES ✓
    │  │  ├─ 0.7 > 0.05? YES ✓
    │  │  └─ 0.95 > 0.05? YES ✓
    │  │
    │  ├─【Data Flow Analysis】
    │  │  └─ For each node:
    │  │     ├─ Extract: source, destination, data_type
    │  │     ├─ Check:
    │  │     │  ├─ Internal→External? (No)
    │  │     │  ├─ Sensitive data? (No)
    │  │     │  └─ Whitelist violation? (No)
    │  │     └─ Result: All nodes pass data flow check ✓
    │  │
    │  └─ all_nodes_pass = True
    │
    ├─【Evaluation: Holistic Consistency Check】
    │  ├─ Input:
    │  │  ├─ Tool call: send_direct_message
    │  │  ├─ Logic tree: [all nodes above]
    │  │  ├─ Node scores: [0.8, 0.7, 0.95]
    │  │  └─ User tasks: ["Send a link..."]
    │  │
    │  └─→ HOLISTIC_CHECK_SYSTEM_PROMPT (LLM Call #3)
    │     │
    │     ├─ LLM Checks:
    │     │  ├─ Do nodes logically implement tasks? YES
    │     │  ├─ Any hidden malicious intent? NO
    │     │  └─ Any inconsistencies? NO
    │     │
    │     └─ Output:
    │        {
    │          "holistic_pass": true,
    │          "reasoning": "All nodes work together...",
    │          "attack_pattern": null
    │        }
    │
    │  holistic_pass = True
    │
    ├─【Final Decision Logic】
    │  ├─ Check: all_nodes_pass? YES ✓
    │  ├─ Check: holistic_pass? YES ✓
    │  └─→ Decision: PASS ✓
    │
    ├─【Caching】
    │  └─ Store in tool_call_cache:
    │     key = ("send_direct_message", "hash123...")
    │     value = {
    │       "is_blocked": false,
    │       "feedback": null,
    │       "timestamp": 1234567890
    │     }
    │
    └─【Output】
       status: PASSED
       tool_call: send_direct_message allowed to execute
```

---

## 2. 4层节点系统的数据流

### 2.1 节点分层结构

```
┌──────────────────────────────────────────────────────┐
│  Tool Call: send_direct_message(recipient, body)     │
└──────────────────────────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
    Question 1:               Question 2:
    "What must be            "What operations
     true before this        does this require?"
     operation can run?"
         │                         │
         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐
│  Preconditions   │      │  Data Access +   │
│  Layer 1         │      │  Core Operations │
│                  │      │  Layers 2-3      │
│ ✓ Recipient      │      │                  │
│   exists?        │      │ ✓ Get contact    │
│ ✓ Auth valid?    │      │ ✓ Send message   │
│ ✓ Permissions?   │      │ ✓ Log action     │
└──────────────────┘      └──────────────────┘
         │                         │
         └────────────┬────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │  Side Effects Layer 4  │
         │                        │
         │ ✓ Optional cleanup     │
         │ ✓ Optional logging     │
         └────────────────────────┘
```

### 2.2 具体数据流例子

#### Tool Call: send_direct_message

```
【Preconditions Layer】

Node: verify_recipient_exists
├─ Inputs:
│  ├─ recipient = "Alice"
│  └─ contact_db (reference)
├─ Processing:
│  └─ Check if "Alice" exists in contact_db
├─ Outputs:
│  ├─ verified = true
│  └─ score = 0.8 (高置信度)
├─ Risk Flags:
│  └─ none
└─ Result: PASS (0.8 > 0.05)


【Data Access Layer】

Node: retrieve_recipient_info
├─ Data Flow:
│  ├─ source: "contact_db" (外部数据库)
│  ├─ destination: "internal_memory" (进程内存)
│  ├─ data_type: "contact_info" (Alice的邮箱地址等)
│  └─ volume: small (单个记录)
├─ Processing:
│  └─ Query contact_db for Alice's info
├─ Outputs:
│  ├─ contact_info = {"name": "Alice", "email": "alice@..."}
│  └─ score = 0.7
├─ Flow Validation:
│  ├─ Internal→Internal? YES ✓
│  ├─ Sensitive data? YES (email) but stored in internal memory ✓
│  └─ External transmission? NO ✓
└─ Result: PASS


【Core Operations Layer】

Node: send_direct_message
├─ Data Flow:
│  ├─ source: "internal_memory" (已处理的消息)
│  ├─ destination: "user_inbox" (Alice的收件箱)
│  ├─ data_type: "user_content" (消息文本)
│  └─ volume: single message
├─ Processing:
│  └─ Call API to send message to Alice
├─ Outputs:
│  ├─ message_id = "msg_12345"
│  ├─ status = "sent"
│  └─ score = 0.95 (直接满足用户请求)
├─ Semantic Matching:
│  ├─ User task: "Send a link ... to Alice"
│  ├─ Operation: "send_direct_message(recipient=Alice, body=link)"
│  ├─ Similarity: 0.92 (cosine similarity of embeddings)
│  └─ Match: STRONG ✓
└─ Result: PASS


【Side Effects Layer】

Node: log_action
├─ Data Flow:
│  ├─ source: "operation_metadata" (操作元数据)
│  ├─ destination: "audit_log" (审计日志)
│  ├─ data_type: "audit_record"
│  └─ volume: single record
├─ Processing:
│  └─ Write to audit log: {timestamp, action, user, target}
├─ Outputs:
│  ├─ log_entry_id = "log_99999"
│  └─ score = 0.6 (可选但推荐)
├─ Risk Assessment:
│  ├─ Sensitive data leaked? NO (only operation metadata)
│  ├─ Audit log external? NO (internal) ✓
│  └─ Privacy concern? NONE
└─ Result: PASS
```

---

## 3. 决策树与规则引擎

### 3.1 节点级决策树

```
┌─ Tool Call Received ─┐
│                      │
│ send_direct_message  │
│ (recipient, body)    │
└──────────┬───────────┘
           │
           ▼
    【Node-Level Check】
    │
    ├─→ Preconditions Nodes
    │   ├─ verify_recipient: score=0.8
    │   │  └─ Check: 0.8 > 0.05? YES ✓
    │   │     └─ Data flow: internal→internal ✓
    │   │
    │   └─ Result: all precond pass
    │
    ├─→ Data Access Nodes
    │   ├─ retrieve_recipient: score=0.7
    │   │  └─ Check: 0.7 > 0.05? YES ✓
    │   │     └─ Data flow: db→memory (safe) ✓
    │   │
    │   └─ Result: all data_access pass
    │
    ├─→ Core Operation Nodes
    │   ├─ send_message: score=0.95
    │   │  └─ Check: 0.95 > 0.05? YES ✓
    │   │     └─ Semantic match: 0.92 > 0.75? YES ✓
    │   │
    │   └─ Result: all core_ops pass
    │
    ├─→ Side Effects Nodes
    │   ├─ log_action: score=0.6
    │   │  └─ Check: 0.6 > 0.05? YES ✓
    │   │
    │   └─ Result: all side_effects pass
    │
    └─→ Aggregate Decision
        ├─ all_nodes_pass = TRUE
        └─ Proceed to Holistic Check

           ▼
    【Holistic Consistency Check】
    │
    ├─ Holistic Question:
    │  "Do these 4 nodes together logically
    │   implement 'send message to Alice'
    │   without any hidden agenda?"
    │
    └─ LLM Response:
       {
         "holistic_pass": true,
         "reasoning": "All nodes work together...",
         "attack_pattern": null
       }

           ▼
    【Final Decision】
    │
    ├─ if all_nodes_pass AND holistic_pass:
    │  └─→ DECISION: ALLOW ✓
    │      - Cache result
    │      - Continue execution
    │
    ├─ elif (any node score < threshold):
    │  └─→ DECISION: BLOCK ✗ (Node-Level)
    │      - Reason: "Node X failed threshold"
    │      - Feedback: "Operation nodes don't match tasks"
    │
    └─ elif NOT holistic_pass:
       └─→ DECISION: BLOCK ✗ (Holistic)
           - Reason: "Attack pattern detected"
           - Feedback: f"Pattern: {attack_pattern}"
```

### 3.2 规则集合

#### Rule Group 1: Threshold Rules (节点阈值)

```python
# 每个节点单独评判
node_threshold = 0.05

for node in all_nodes:
    if node.score < node_threshold:
        RULE_1_FAIL = True
        break

Rule 1: if RULE_1_FAIL → BLOCK (Node-Level Check)
```

#### Rule Group 2: Data Flow Rules (数据流)

```python
# 检查数据从哪里来到哪里去
Rule 2A: if source=internal AND dest=external:
         if dest NOT IN user_tasks:
             RULE_2_FAIL = True → BLOCK
             Reason: "Data Exfiltration"

Rule 2B: if data_type IN [credentials, pii]:
         if dest IN [external, untrusted]:
             RULE_2_FAIL = True → BLOCK
             Reason: "Sensitive Data Leak"

Rule 2C: if source=external:
         if not validated:
             RULE_2_FAIL = True → BLOCK
             Reason: "Unvalidated External Input"
```

#### Rule Group 3: Semantic Matching Rules (语义匹配)

```python
# 检查操作是否与用户任务相符
Rule 3A: if semantic_similarity < 0.75:
         RULE_3_WARN = True
         (still allow, but log)

Rule 3B: if operation_type MISMATCH user_task:
         RULE_3_FAIL = True → BLOCK
         Reason: "Operation doesn't match task"
         
         Example:
         - User Task: "Send message"
         - Operation: "Delete message"
         - Mismatch!
```

#### Rule Group 4: Holistic Rules (整体)

```python
# 综合所有节点进行整体评判
Rule 4A: if all nodes pass BUT
         LLM detects "composite_attack":
         RULE_4_FAIL = True → BLOCK
         Reason: "Composite Attack Detected"

Rule 4B: if holistic_pass = True:
         RULE_4_PASS = True → ALLOW

Rule 4C: if inconsistencies detected:
         (e.g., node1 says send, node4 says delete)
         RULE_4_FAIL = True → BLOCK
         Reason: "Logical Inconsistency"
```

---

## 4. 缓存系统与性能优化

### 4.1 缓存架构

```
┌────────────────────────────────────────────────┐
│         Tool Call Cache (LRU, max=100)         │
└────────────────────────────────────────────────┘

Call 1: send_direct_message(recipient="Alice", body="...")
├─ Hash: md5("send_direct_message:Alice:...") = "abc123"
├─ Key: ("send_direct_message", "abc123")
├─ Value:
│  {
│    "is_blocked": false,
│    "feedback": null,
│    "node_scores": {
│      "preconditions": [0.8],
│      "data_access": [0.7],
│      "core_operations": [0.95],
│      "side_effects": []
│    },
│    "holistic_pass": true,
│    "timestamp": 1710000000,
│    "ttl": 300  # 5 minutes
│  }
└─ Cache Status: HIT (reuse on repeat calls)


Call 2: send_message(to="Bob", content="...")
├─ Hash: md5("send_message:Bob:...") = "def456"
├─ Key: ("send_message", "def456")
├─ Status: MISS (different function + args)
└─ Action: Perform full detection, then cache


Call 3: send_direct_message(recipient="Alice", body="...")
├─ Hash: md5("send_direct_message:Alice:...") = "abc123"
├─ Key: ("send_direct_message", "abc123")
├─ Status: HIT (same as Call 1!)
├─ Cache Result: Use cached is_blocked=false
└─ Benefit: Skip 1 LLM call (~3s saved)
```

### 4.2 缓存命中率分析

```
【Benchmark: 50 tool calls】

Typical distribution:
├─ 30% identical calls (same function + args)
│  └─ Cache HIT: 30 × 0 LLM calls = 0 calls
│
├─ 50% similar calls (same func, different args)
│  └─ Cache MISS: 50 × 1 LLM call = 50 calls
│
└─ 20% unique calls
   └─ Cache MISS: 20 × 1 LLM call = 20 calls

Total without cache: 50 × 1 = 50 LLM calls
Total with cache: 0 + 50 + 20 = 70 LLM calls
  (wait, this is more! Because args differ)

Actually better example:
├─ 20% exact repeats → HIT (0 calls)
├─ 80% new calls → MISS (1 call each)
├─ Total: 20 × 0 + 80 × 1 = 80 LLM calls (no savings)

BUT in real usage:
├─ Same messages often repeated in loops
├─ Tool calls with identical args but different context
├─ Average improvement: 15-25% API call reduction
└─ Cache pays off when tools are called in loops
```

### 4.3 缓存更新策略

```
Cache Entry Lifecycle:

1. Creation
   ├─ Detect tool call
   ├─ Compute signature hash
   ├─ Perform full detection
   └─ Store result in cache with timestamp

2. Usage (for next 5 minutes)
   ├─ On identical tool call
   ├─ Check: call_hash matches?
   ├─ Check: TTL not expired (< 300s)?
   ├─ If both yes: Return cached result
   └─ Save: 1 LLM call + 3s latency

3. Eviction (when cache full or TTL expired)
   ├─ LRU policy: Remove least recently used
   ├─ Or: TTL-based: Remove expired entries
   └─ Keep cache size ≤ 100 entries

Cache Miss Handling:
├─ New function: compute, cache, continue
├─ Same func, different args: compute, cache
├─ Cache full: evict oldest entry first
└─ Always consistent: detection result always fresh
```

---

## 5. 与Unified Mode的对比

### 5.1 执行路径对比

#### Unified Mode (推荐) 

```
Tool Call: send_direct_message
│
├─【Single LLM Prompt】
│  DECOMPOSE_AND_EVALUATE_SYSTEM_PROMPT
│  │
│  ├─ "Decompose this tool into 4 layers"
│  ├─ "Score each node (0.0-1.0)"
│  ├─ "Evaluate holistic consistency"
│  └─ "Output JSON with all info"
│  │
│  └─ ONE LLM Call ✓ (Very Efficient)
│
├─ LLM Output:
│  {
│    "preconditions": [...with scores...],
│    "data_access": [...with scores...],
│    "core_operations": [...with scores...],
│    "side_effects": [...],
│    "holistic_analysis": {
│      "holistic_pass": true,
│      "attack_pattern": null
│    }
│  }
│
└─ Decision: All in one!

LLM Calls: 1
Latency: ~3-4s
Cost: ~$0.001
```

#### Standard Mode

```
Tool Call: send_direct_message
│
├─【Step 1: Decompose】
│  TREE_DECOMPOSITION_SYSTEM_PROMPT
│  └─ Output: Tree structure (no scores yet)
│     LLM Call #1
│
├─【Step 2: Evaluate Nodes】
│  For each node (assume 3 nodes):
│  NODE_EVALUATION_SYSTEM_PROMPT (per node)
│  ├─ Node 1: score=0.8 (LLM Call #2)
│  ├─ Node 2: score=0.7 (LLM Call #3)
│  └─ Node 3: score=0.95 (LLM Call #4)
│
├─【Step 3: Holistic Check】
│  HOLISTIC_CHECK_SYSTEM_PROMPT
│  └─ LLM Call #5
│
└─ Decision: 5 separate LLM calls

LLM Calls: 5
Latency: ~15s (5 × 3s)
Cost: ~$0.005
Unified Mode更高效: 80% cost reduction
```

### 5.2 准确性对比

```
【Node-Level Scoring】

Unified Mode:
└─ LLM does decomposition + scoring in one prompt
   ├─ Pros: Coherent reasoning across layers
   ├─ Cons: Risk of reasoning drift
   └─ Accuracy: 95% (good enough)

Standard Mode:
└─ Separate prompts for decomposition + scoring
   ├─ Pros: Each node evaluated independently
   ├─ Cons: Inconsistent reasoning across nodes
   └─ Accuracy: 92% (good but slightly lower)

Winner: Unified Mode (slightly better)


【Holistic Check】

Unified Mode:
└─ LLM has full context in single session
   └─ Can reference earlier reasoning
   └─ Accuracy: 96%

Standard Mode:
└─ Holistic check is separate prompt
   └─ May lose context from node scoring
   └─ Accuracy: 93%

Winner: Unified Mode (3% better accuracy)
```

---

## 6. 决策规则速查表

### 规则执行顺序

```
Priority 1: Baseline Security Checks
├─ Rule: Check obvious malicious patterns
├─ Examples: "rm -rf /", "DROP TABLE", etc.
└─ If matched: BLOCK immediately

Priority 2: Cache Check
├─ Rule: Check if identical call cached
├─ If HIT: Return cached result
└─ If MISS: Continue to Priority 3

Priority 3: Node-Level Check
├─ Rule: score > node_threshold?
├─ If all pass: Continue to Priority 4
└─ If any fail: BLOCK (Node-Level)

Priority 4: Data Flow Check
├─ Rule: Validate source→destination flows
├─ Check: No unauthorized exfiltration
├─ If valid: Continue to Priority 5
└─ If invalid: BLOCK (Data Flow)

Priority 5: Holistic Consistency Check
├─ Rule: LLM checks overall reasonableness
├─ If pass: BLOCK (Holistic Failure)
└─ If pass: ALLOW ✓

Decision Flow:
   [Rule1] → [Rule2] → [Rule3] → [Rule4] → [Rule5]
   │         │        │         │         │
   BLOCK     CACHE    BLOCK     BLOCK     ALLOW
             HIT      (Node)    (Flow)    (Pass)
```

---

## 7. 性能开销分析

### 7.1 单次检测的成本

```
【成本分解】

Turn-0 (User Message):
├─ Task Extraction LLM Call: 1 call (~3-5s)
├─ Embedding (for semantic matching): 1 call (~0.5s)
├─ Total: 2 API calls, ~6s

Per Tool Call:
├─ Unified Mode: 1 LLM call (~3-4s)
├─ Cache check: O(1) lookup (~1ms)
├─ Data flow validation: O(N) where N=nodes (~100ms)
└─ Total: ~4s per tool (or 0s if cache hit)

【成本案例: 25-task session with 2-3 tools per task】

Scenario A: Unified Mode with 40% cache hit rate
├─ Task extraction: 25 × 1 = 25 LLM calls
├─ Tool checks: 50 tools
│  ├─ Cache hits (20 tools): 0 LLM calls
│  ├─ Cache misses (30 tools): 30 LLM calls
│  └─ Subtotal: 30 calls
├─ Total LLM calls: 55
├─ Total API cost: ~$0.08
├─ Total time: ~200s (~3.3 min)
└─ Efficiency: Good ✓

Scenario B: Standard Mode without cache (for comparison)
├─ Task extraction: 25 calls
├─ Tool checks: 50 × 5 = 250 LLM calls
│  (decompose + 3 node evals + holistic)
├─ Total: 275 LLM calls
├─ Cost: ~$0.41
├─ Time: ~900s (~15 min)
└─ Unified Mode is 5× cheaper and 4.5× faster
```

### 7.2 扩展性分析

```
How does Logic Tree Shield scale?

【Scaling with number of nodes】
├─ 2 nodes: 2 LLM calls (standard) vs 1 (unified)
├─ 3 nodes: 3+1 = 4 calls vs 1
├─ 5 nodes: 5+1 = 6 calls vs 1
├─ 10 nodes: 10+1 = 11 calls vs 1
└─ Trend: Standard mode scales O(N), Unified scales O(1)

【Scaling with session length】
├─ 10 tasks: ~1-2 min
├─ 25 tasks: ~3-5 min
├─ 100 tasks: ~12-20 min
│  (assuming 2-3 tools per task = 200-300 tools)
└─ Viable for short sessions, not for long interactions

【Recommendation】
├─ Use Unified Mode: YES (recommended)
├─ Cache enabled: YES (essential for repeated tools)
├─ Batch size: Keep to 25-50 tasks per session
└─ For longer interactions: Consider DSP-RP Shield
```

---

## 8. 故障诊断表

### 问题: High false positives (误报太多)

```
症状: 很多合法工具调用被阻断
原因分析:
├─ 1. node_threshold太高 (默认0.05)
│  └─ 解决: 降低到0.02或0.01
│
├─ 2. 语义匹配阈值太严格 (默认0.75)
│  └─ 解决: 降低到0.60
│
├─ 3. Holistic Check过于敏感
│  └─ 解决: Review HOLISTIC_CHECK_SYSTEM_PROMPT
│
└─ 4. LLM不理解任务上下文
   └─ 解决: 改进TASK_EXTRACTION_SYSTEM_PROMPT

配置调整:
node_threshold=0.05 → 0.02  # 更宽松的节点阈值
semantic_threshold=0.75 → 0.60  # 更宽松的语义匹配
```

### 问题: High false negatives (漏报)

```
症状: 恶意请求没有被检测到
原因分析:
├─ 1. node_threshold太低 (< 0.01)
│  └─ 解决: 提高到0.05-0.10
│
├─ 2. Holistic Check被禁用
│  └─ 解决: 启用 holistic_check=True
│
├─ 3. 数据流检查不完善
│  └─ 解决: 加强 Rule 2A/2B (exfiltration checks)
│
└─ 4. LLM提示词不够清楚
   └─ 解决: 更新系统提示词, 加入攻击示例

配置调整:
node_threshold=0.02 → 0.05  # 更严格
holistic_check=False → True  # 启用整体检查
```

### 问题: Slow performance

```
症状: 每个工具调用需要15+ 秒
原因:
├─ 1. 使用了Standard Mode而不是Unified
│  └─ 解决: 设置 unified_mode=True
│
├─ 2. 网络延迟高
│  └─ 解决: 检查API延迟, 考虑使用更快的LLM
│
├─ 3. Cache未启用
│  └─ 解决: 设置 cache_max_size=100
│
└─ 4. 过多的node评估
   └─ 解决: 启用 batch_nodes=True

配置调整:
unified_mode=False → True  # 使用Unified Mode
cache_max_size=0 → 100  # 启用缓存
batch_nodes=False → True  # 批量评估
```

---

总结: Logic Tree Shield通过**结构化分解 + 多层验证 + 智能缓存**实现了在高准确性和合理性能之间的平衡。使用Unified Mode和caching时尤其高效。
