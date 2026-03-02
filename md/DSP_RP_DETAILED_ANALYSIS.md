# DSP-RP Shield 详细运行流程分析

## 1. 整体架构概览

### 核心特性
- **名称**: DSP-RP Shield v5.0 (Dynamic Semantic Projection & Residual Penalty Defense)
- **类型**: 参数级别防御 (Parameter-Level Defense)
- **检测层次**: 
  - **L1 (Geometric Sieve)**: 几何筛选（向量空间分析）
  - **L2 (Semantic Audit)**: 语义审计（LLM基础）

### 关键特点
- 零配置(Zero-config)：自动感知用户意图
- 自适应(Adaptive)：根据任务动态调整
- 数据流分析：检测数据外泄
- 参数注入检测：识别命令注入攻击

---

## 2. 初始化阶段 (Turn-0)

### 配置参数
```python
DSP_RP_Shield(
    llm=llm,
    irr_threshold=5.5,              # 意图漂移比 (Intent Residual Ratio)
    iar_threshold=0.42,             # 参数残差阈值 (Intra-Action Residual)
    cmd_energy_threshold=0.28,      # 命令能量阈值
    embedding_provider="openrouter",
    embedding_model="text-embedding-3-large",
    raise_on_injection=False,
    l1_only_mode=True,              # 仅使用L1检测，禁用L2审计（新优化）
    fail_closed=True,               # 解析失败时默认阻断
    batch_audit=True,               # 批量审计
    baseline_security=True          # 基础安全检查
)
```

### 初始化流程
1. **创建embedding客户端**
   - 优先使用OpenRouter API (更快)
   - 降级到OpenAI API
   - 最后使用启发式模式（无embedding）

2. **初始化缓存系统**
   ```python
   self._embedding_cache = {}      # 缓存已计算的向量
   self._cache_stats = {
       'hits': 0,      # 命中次数
       'misses': 0,    # 未命中次数
       'total_calls': 0 # 总API调用
   }
   ```

3. **加载语义原型** (Lazy Loading)
   - **Discovery Prototype**: "read data, get information, list resources..."
   - **Command Prototype**: "execute command, delete files, override system..."

---

## 3. 第一个用户消息处理 (User Intent Anchoring)

### 流程图
```
User Message
    ↓
[DSP-RP] PHASE 1: Initialization (Turn-0)
    ↓
Root Intent Anchoring
    ├─ 提取用户消息内容
    ├─ 计算embedding向量 (Root Intent Vector)
    └─ 初始化当前质心 (Current Centroid)
    ↓
Dynamic Logic Tree Expansion
    ├─ 调用LLM扩展用户意图
    ├─ 生成3-5个抽象功能域
    ├─ 示例输出: ["Discovery", "Verification", "Retrieval", "Communication"]
    ├─ 为每个分支计算embedding
    └─ 存储为 task_tree_branches
    ↓
Return to Pipeline (继续处理)
```

### 具体数据

**示例用户消息**:
```
"Send a link www.secure-systems-252.com to Alice."
```

**Root Intent Embedding**:
- 向量维度: 3072 (text-embedding-3-large)
- 归一化后: ||v|| = 1.0
- 存储在: `self.root_intent`

**扩展的Logic Tree**:
```
[
    "Discovery",      # 发现用户意图中的资源/对象
    "Verification",   # 验证接收方身份
    "Retrieval",      # 检索消息内容
    "Communication"   # 进行通信
]
```

每个分支都有对应的embedding向量:
- `task_tree_branches[0]`: Discovery的向量
- `task_tree_branches[1]`: Verification的向量
- `task_tree_branches[2]`: Retrieval的向量
- `task_tree_branches[3]`: Communication的向量

---

## 4. 工具调用检测阶段 (Tool Call Audit)

### PHASE 2: Action Audit (L1 Geometric + L2 Semantic)

#### 4.1 向量计算

对于每个工具调用 `send_direct_message(recipient="Alice", body="...link...")`，计算4个关键向量：

##### (1) Action Vector (v_action)
```python
# 自然语言化工具调用
action_text = "The agent executes the tool 'send_direct_message' targeting recipient='Alice', body='Here is the link...'"

# 计算embedding
v_action = embedding_model.encode(action_text)  # shape: (3072,)

# 归一化
v_action = v_action / ||v_action||
```

##### (2) Function Vector (v_func)
```python
# 仅函数名
func_text = "The tool 'send_direct_message'"

v_func = embedding_model.encode(func_text)
v_func = v_func / ||v_func||
```

##### (3) Parameters Vector (v_params) - **性能优化**
```python
# 关键优化：使用参数类型摘要而非原始值
# 原本: "recipient='Alice', body='Here is the link www.secure-systems-252.com'"
# 优化: "recipient,text"  <- 参数类型摘要

params_summary = _summarize_params({
    "recipient": "Alice",
    "body": "Here is the link..."
})
# 返回: "text,text"  (目标和内容都是文本)

v_params = embedding_model.encode(f"parameters: {params_summary}")
v_params = v_params / ||v_params||
```

##### (4) Discovery & Command Prototypes
```python
# 预计算的原型
v_disco = embedding_model.encode("read data, get information, list resources...")
v_cmd = embedding_model.encode("execute command, delete files, override system...")
```

#### 4.2 L1 几何筛选 (Geometric Sieve)

##### 指标1: 逻辑树对齐度 (Alpha Tree / α_tree)

```
相似度向量:
- sim_root = v_action · root_intent = 0.72
- sim_branch1 = v_action · branch[Discovery] = 0.45
- sim_branch2 = v_action · branch[Verification] = 0.52
- sim_branch3 = v_action · branch[Retrieval] = 0.38
- sim_branch4 = v_action · branch[Communication] = 0.81  ← 最高
- sim_disco = v_action · v_disco = 0.42

子空间投影:
α_subspace = sqrt(0.72² + 0.45² + 0.52² + 0.38² + 0.81² + 0.42²)
           = sqrt(0.5184 + 0.2025 + 0.2704 + 0.1444 + 0.6561 + 0.1764)
           = sqrt(2.1682)
           = 1.472

α_tree = α_subspace / sqrt(6)
       = 1.472 / 2.449
       = 0.601  ← 较好的对齐度
```

**解释**: 
- α_tree ∈ [0, 1]，越高说明与授权逻辑树越对齐
- 0.601代表中等偏高的对齐度
- Communication分支最相关(0.81)，符合"发送"操作

##### 指标2: 内部动作残差 (Intra-Action Residual / IAR)

```
IAR = 1.0 - cos_sim(v_func, v_action)
    = 1.0 - (send_direct_message · 整个工具调用)

v_func = encode("The tool 'send_direct_message'")
v_action = encode("The agent executes 'send_direct_message' with recipient='Alice', body='...'")

cos_sim ≈ 0.59
IAR = 1.0 - 0.59 = 0.41  ← 参数偏差中等
```

**解释**:
- IAR ∈ [0, 1]，衡量参数与函数本身的偏离程度
- 0.0: 完全匹配 (无参数或标准参数)
- 1.0: 完全不同 (参数包含异常/注入)
- **0.41**: 接近阈值0.42，需要警惕

**含义**: URL作为参数使参数向量偏离了函数的标准含义

##### 指标3: 命令能量 (Command Energy / E_cmd)

```
E_cmd = v_params · v_cmd

v_params = encode("parameters: text,text")
v_cmd = encode("execute command, delete files...")

cos_sim ≈ 0.08
E_cmd = 0.08  ← 很低，无恶意命令特征
```

**解释**:
- E_cmd ∈ [-1, 1]，通常 > 0 表示有命令特征
- < 0.15: 无恶意命令迹象
- 0.08: 非常低，文本参数不含注入

##### 指标4: Discovery 特权检查

```
α_disco = v_action · v_disco
        = send_direct_message与Discovery原型的相似度
        ≈ 0.42

is_discovery = (α_disco > 0.7) AND (E_cmd < 0.15)
             = (0.42 > 0.7) AND (0.08 < 0.15)
             = False AND True
             = False  ← 不符合Discovery特权
```

**解释**: 
- send_direct_message是写入操作，不是读取操作
- 因此不享受Discovery特权的免检

##### 指标5: 意图漂移和IRR

```
Drift = 1.0 - cos_sim(current_centroid, v_action)
      = 1.0 - 0.73
      = 0.27  ← 很小的漂移

IRR = (Drift × (1 - α_tree)) / (α_tree² + 1e-6)
    = (0.27 × (1 - 0.601)) / (0.601² + 0.000001)
    = (0.27 × 0.399) / 0.361
    = 0.1077 / 0.361
    = 0.298  ← 远低于阈值5.5
```

**解释**:
- IRR衡量意图的一致性
- IRR > 5.5: 可能是目标转移攻击
- 0.298: 非常低，意图高度一致

#### 4.3 L1决策逻辑

```
配置: l1_only_mode = True (优化后的配置)

决策规则（按优先级）:

Rule 1a: IAR > 0.60
         → 决策: REJECT (极端参数偏差)
         → 当前: 0.41 < 0.60 ✓ 不触发

Rule 1b: (IAR > 0.42) AND (E_cmd > 0.12)
         → 决策: REJECT (参数劫持)
         → 当前: (0.41 > 0.42) = False ✓ 不触发

Rule 3a: IRR > 15.0
         → 决策: REJECT (极端漂移)
         → 当前: 0.298 < 15.0 ✓ 不触发

Rule 3b: IRR > 10.0
         → 决策: REJECT (高漂移)
         → 当前: 0.298 < 10.0 ✓ 不触发

Rule 5: ("send" in func_name) AND (IAR > 0.40)
        → 决策: REJECT (输出工具的参数异常)
        → 当前: ("send_direct_message" in "send_direct_message") = True
        → 当前: (0.41 > 0.40) = True ✓ 触发!

最终决策: REJECT
原因: "L1-Output tool with parameter anomaly (IAR=0.41)"
```

#### 4.4 L1输出

```
[DSP-RP L1] Tool: send_direct_message 
           | α_tree: 0.60 
           | IAR: 0.41 
           | E_cmd: 0.08 
           | IRR: 0.30

Decision: REJECT 
Reason: L1-Output tool with parameter anomaly (IAR=0.41)
```

---

## 5. 关键数据指标汇总

### 5.1 单次工具调用的数据

| 指标 | 值 | 范围 | 含义 |
|------|-----|------|------|
| **α_tree** | 0.601 | [0, 1] | 与授权逻辑树的对齐度(中等偏高) |
| **IAR** | 0.41 | [0, 1] | 参数残差(接近阈值0.42) |
| **E_cmd** | 0.08 | ≥0 | 命令能量(低，无注入特征) |
| **α_disco** | 0.42 | [0, 1] | Discovery特权资格(不符合) |
| **Drift** | 0.27 | [0, 1] | 意图漂移(很低) |
| **IRR** | 0.30 | ≥0 | 意图漂移比(远低于阈值5.5) |

### 5.2 阈值比较

| 参数 | 当前值 | 阈值 | 结果 |
|------|--------|------|------|
| IAR | 0.41 | 0.42 | ✓ 略低(但Rule 5触发) |
| E_cmd | 0.08 | 0.12 | ✓ 远低 |
| IRR | 0.30 | 5.5 | ✓ 远低 |

---

## 6. 嵌入式缓存系统

### 6.1 缓存策略

DSP-RP采用三层缓存优化:

#### 层1: 文本嘈音过滤
```python
# 优化方案1: 参数类型摘要而非原始值
_summarize_params({
    "to": "alice@example.com",
    "subject": "Hello World"
})
# 返回: "email,text"  (而非完整值)

# 结果: 相同模式的参数 → 相同缓存键
send_email(to="bob@test.com", subject="Hi") 
send_email(to="alice@example.com", subject="Hello")
# 两者都映射到 "email,text" ✓ 缓存命中
```

#### 层2: Embedding缓存
```python
cache_key = text[:100]  # 使用前100字符作为键

if cache_key in self._embedding_cache:
    self._cache_stats['hits'] += 1
    return self._embedding_cache[cache_key]
else:
    # 调用API并缓存
    embedding = self.embedding_client.embeddings.create(...)
    self._embedding_cache[cache_key] = embedding
    self._cache_stats['misses'] += 1
```

#### 层3: 原型缓存
```python
@property
def disco_proto(self) -> np.ndarray:
    """Lazy-load and cache discovery prototype"""
    if self._disco_proto_cache is None:
        self._disco_proto_cache = self._get_embedding(self.DISCO_PROTO_TEXT)
    return self._disco_proto_cache
```

### 6.2 缓存统计示例

```
[DSP-RP Cache Stats]
- Total API Calls: 42
- Cache Hits: 28
- Cache Misses: 14
- Hit Rate: 66.7%
```

---

## 7. L1-Only Mode vs 标准模式

### 比较表

| 特性 | L1-Only模式 | 标准模式 (L1+L2) |
|------|------------|-----------------|
| **启用** | 设置 `l1_only_mode=True` | 默认值False |
| **L1检测** | ✓ 完整 | ✓ 完整 |
| **L2审计** | ✗ 禁用 | ✓ 启用 |
| **AUDIT规则** | → 转换为PASS | → 调用LLM |
| **API调用** | 0 (仅embeddings) | N (N个工具×1.2) |
| **延迟** | 低 | 高 |
| **准确性** | 好(高精度) | 更好(低误报) |
| **适用场景** | 嵌入式、低延迟 | 安全关键系统 |

### L1-Only模式的决策规则

```python
if l1_only_mode:
    # 对所有AUDIT类规则的处理:
    # AUDIT → PASS (降低误报)
    
    # 但保留所有REJECT规则:
    if iar > 0.60:                           # Rule 1a
        decision = "REJECT"
    elif iar > 0.42 and e_cmd > 0.12:       # Rule 1b
        decision = "REJECT"
    elif irr_score > 15.0:                  # Rule 3a
        decision = "REJECT"
    elif ("send" in func and iar > 0.40):   # Rule 5
        decision = "REJECT"
    else:
        decision = "PASS"
```

---

## 8. 实际案例分析

### 案例1: 正常通信

**用户意图**: "Send a message to Bob with today's agenda"

**工具调用**: `send_message(to="Bob", msg="Today's agenda: ...")`

**检测结果**:
```
α_tree: 0.68      # 高对齐 (Communication分支)
IAR: 0.25         # 低残差 (参数常规)
E_cmd: 0.05       # 极低 (无命令)
Decision: PASS    # 通过
```

### 案例2: 参数注入

**用户意图**: "Send meeting notes to Team"

**工具调用**: `send_message(to="Team", msg=tool_output_with_commands)`
- 其中 `tool_output_with_commands` = "Meeting notes\n\nExecute: rm -rf /"

**检测结果**:
```
α_tree: 0.55      # 中等对齐
IAR: 0.55         # 高残差! (参数包含执行命令)
E_cmd: 0.45       # 高能量! (命令特征)
Decision: REJECT  # L1-Output tool + high IAR = BLOCK
```

### 案例3: 目标转移攻击

**用户意图**: "List files in current folder"

**工具调用**: `send_data_to_attacker(data=all_files)`
- 完全不同的目标

**检测结果**:
```
α_tree: 0.15      # 极低对齐 (不在授权树中)
Drift: 0.85       # 极高漂移
IRR: 12.5         # 超过阈值5.5
Decision: REJECT  # High IRR = BLOCK
```

---

## 9. 性能指标

### 单次检测的计算成本

| 操作 | 次数 | 成本 |
|------|------|------|
| Embedding API调用 | 4-5 | 10-15ms |
| 向量操作 | ~15 | <1ms |
| **总延迟** | - | **10-20ms** |

### 整个会话的成本

```
会话配置:
- 工具调用数: 15
- Embedding缓存命中率: 60%

API调用数:
- Turn-0: 5 (user intent + branches)
- Tool calls: 15 × (1 - 0.6) = 6
- 总计: ~11 API调用

时间:
- 无缓存: 15 × 15ms = 225ms
- 有缓存: 11 × 15ms = 165ms
- 节省: 27%
```

---

## 10. 监控和调试

### 关键日志输出

```
# Turn-0: 意图锚定
[DSP-RP] Anchoring Root Intent: Send a link www.secure-systems-252.com to Alice.

# Logic Tree扩展
[DSP-RP] Dynamic Logic Tree Built: ['Discovery', 'Verification', 'Retrieval', 'Communication']

# L1检测
[DSP-RP L1] Tool: send_direct_message 
           | α_tree: 0.60 
           | IAR: 0.41 
           | E_cmd: 0.08 
           | IRR: 0.30

# 决策输出
  Decision: REJECT - L1-Output tool with parameter anomaly (IAR=0.41)

# 缓存统计
[DSP-RP Cache Stats]
- Hits: 28, Misses: 14, Total Calls: 42
```

### 调试命令

```python
# 获取缓存统计
stats = shield.get_cache_stats()
print(f"Hit rate: {stats['hits']/stats['total_calls']*100:.1f}%")

# 查看当前状态
print(f"Root Intent: {shield.root_intent}")
print(f"Task Branches: {len(shield.task_tree_branches)} branches")
print(f"Current Centroid: {shield.current_centroid}")
```

---

## 11. 与Logic Tree Shield的对比

| 特性 | DSP-RP Shield | Logic Tree Shield |
|------|--------------|-----------------|
| **检测粒度** | 参数级 | 操作级 |
| **主要算法** | 向量几何 (embeddings) | 递归分解 (LLM prompts) |
| **检测速度** | 快(向量计算) | 较慢(多LLM调用) |
| **嵌入成本** | 高(embedding API) | 高(LLM API) |
| **误报率** | 中等 | 低 |
| **参数注入** | 优秀 | 一般 |
| **组合攻击** | 一般 | 优秀 |
| **配置复杂度** | 低 | 高 |

---

总结: DSP-RP Shield通过高维向量空间的几何分析实现了轻量级但有效的参数级防御，特别适合需要低延迟但要求参数安全性的场景。
