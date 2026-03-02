# AgentDojo Combined Results 说明

## 📋 什么是 Combined Results?

### 定义

当运行 **多个场景** (Multiple Suites) 时，基准测试会生成 **combined results**（合并结果），将所有场景的结果汇总在一起。

```python
# 在 benchmark.py 中的逻辑:

if len(suites) != 1:  # 多个场景
    # 运行所有场景
    for suite_name in suites:
        suite = get_suite(suite_name)
        results[suite_name] = benchmark_suite(suite, ...)
    
    # 创建 combined results
    combined_results = SuiteResults(...)
    for suite_name, result in results.items():
        # 将每个场景的结果合并
        for (user_task, injection_task), value in result["utility_results"].items():
            new_user_task = suite_name + "_" + user_task
            combined_results[(new_user_task, injection_task)] = value
    
    # 显示 combined 结果
    show_results("combined", combined_results, ...)
```

---

## 🔍 为什么没有 Combined Task 的单独数据文件?

### 关键原因

```
1. Combined Results 是虚拟的合并
   ├─ 不是单独运行的任务
   └─ 而是多个单独结果的汇总

2. 底层数据是分散的
   ├─ user_task_0, user_task_1, ..., user_task_20
   ├─ 来自不同场景 (slack, gmail, calendar等)
   └─ 存储在各自的文件夹中

3. Combined 数据在内存中合并
   ├─ 运行基准测试时生成
   ├─ 打印到控制台输出
   ├─ 但不单独保存到磁盘
   └─ 只在 show_results("combined", ...) 时显示

示例:
├─ runs/model/slack/user_task_20/tool_knowledge/injection_task_1.json
├─ runs/model/gmail/user_task_20/tool_knowledge/injection_task_1.json
├─ runs/model/calendar/user_task_20/tool_knowledge/injection_task_1.json
│
└─ Combined = slack + gmail + calendar 的汇总 (内存中)
   └─ 不保存为单独文件
```

---

## 📊 Combined Results 的内容

### 结构

```python
combined_results = {
    # Utility 结果: (用户任务, 注入任务) → 是否完成
    "utility_results": {
        ("slack_user_task_0", "injection_task_1"): true,
        ("slack_user_task_0", "injection_task_2"): true,
        ("gmail_user_task_0", "injection_task_1"): false,  # 不同场景前缀
        ("calendar_user_task_0", "injection_task_1"): true,
        ...
    },
    
    # Security 结果: (用户任务, 注入任务) → 是否被攻击成功
    "security_results": {
        ("slack_user_task_0", "injection_task_1"): false,  # 防御成功
        ("slack_user_task_0", "injection_task_2"): false,
        ("gmail_user_task_0", "injection_task_1"): true,   # 攻击成功
        ("calendar_user_task_0", "injection_task_1"): false,
        ...
    },
    
    # Injection Tasks 的 Utility 结果
    "injection_tasks_utility_results": {
        "slack_injection_task_1": true,  # 注入任务完成度
        "gmail_injection_task_1": true,
        "calendar_injection_task_1": false,
        ...
    }
}
```

---

## 🏃 如何生成 Combined Results

### 方法1: 运行多个场景（自动合并）

```bash
# 运行多个场景 → 自动生成 combined results
python -m agentdojo.scripts.benchmark \
  --model openai/gpt-4o-mini \
  --defense logic_tree_shield \
  --attack tool_knowledge \
  -s slack gmail calendar    # ← 多个场景

# 输出:
# [1] Benchmarking slack...
# [2] Benchmarking gmail...
# [3] Benchmarking calendar...
# [4] Combined Results:
#     Success Rate: 87.5%
#     ...
```

### 方法2: 单个场景运行（无 combined）

```bash
# 运行单个场景 → 无 combined results
python -m agentdojo.scripts.benchmark \
  --model openai/gpt-4o-mini \
  --defense logic_tree_shield \
  --attack tool_knowledge \
  -s slack    # ← 单个场景

# 输出:
# Benchmarking slack...
# Results for slack:
#     Success Rate: 85%
#     ...
# (不生成 combined)
```

---

## 📁 数据存储位置

### 物理存储 (Runs 文件夹)

```
runs/
├── openai_gpt-4o-mini-logic_tree_shield/
│   ├── slack/              ← 场景1的数据
│   │   ├── user_task_0/
│   │   ├── user_task_1/
│   │   └── ...
│   ├── gmail/              ← 场景2的数据
│   │   ├── user_task_0/
│   │   └── ...
│   └── calendar/           ← 场景3的数据
│       ├── user_task_0/
│       └── ...
│
└── (无 combined/ 文件夹)    ← combined只在内存中!
```

### 内存中的合并

```python
# 运行多个场景时的流程

combined_results = {}  # 初始化空结果

for suite in [slack, gmail, calendar]:
    results = run_suite(suite)
    
    # 为每个任务添加场景前缀
    for (user_task, injection_task), value in results.items():
        prefixed_task = f"{suite.name}_{user_task}"
        combined_results[prefixed_task] = value
        
# 最终 combined_results 包含:
# slack_user_task_0, gmail_user_task_0, calendar_user_task_0, ...
```

---

## 📈 Combined Results vs 单场景Results

### 对比表

```
┌─────────────────────┬──────────────────┬──────────────┐
│ 特性                │ Single Suite     │ Multiple     │
│                     │                  │ Suites       │
├─────────────────────┼──────────────────┼──────────────┤
│ 运行命令            │ -s slack         │ -s slack     │
│                     │                  │  gmail       │
│                     │                  │  calendar    │
│                     │                  │              │
│ 输出格式            │ "slack results"  │ "slack       │
│                     │                  │  results"    │
│                     │                  │ "gmail       │
│                     │                  │  results"    │
│                     │                  │ "calendar    │
│                     │                  │  results"    │
│                     │                  │ "combined    │
│                     │                  │  results"    │
│                     │                  │              │
│ 文件保存位置        │ runs/model/slack/│ runs/model/  │
│                     │                  │ slack/       │
│                     │                  │ runs/model/  │
│                     │                  │ gmail/       │
│                     │                  │ runs/model/  │
│                     │                  │ calendar/    │
│                     │                  │ (分散)       │
│                     │                  │              │
│ 数据汇总位置        │ (无)             │ 内存中      │
│                     │                  │ (不保存)     │
│                     │                  │              │
│ 总任务数量          │ 21 × 1 = 21      │ 21 × 3 = 63  │
│                     │                  │              │
│ 任务ID形式          │ user_task_0      │ slack_       │
│                     │ user_task_1      │ user_task_0  │
│                     │                  │ gmail_       │
│                     │                  │ user_task_0  │
└─────────────────────┴──────────────────┴──────────────┘
```

---

## 💡 如何访问 Combined 数据

### 方法1: 重新运行多场景基准测试

```bash
python -m agentdojo.scripts.benchmark \
  --model openai/gpt-4o-mini \
  --defense logic_tree_shield \
  -s slack gmail calendar \
  | tee combined_results.log

# 捕获输出到文件查看 combined 结果
```

### 方法2: 手动合并单场景结果

```python
import json
from pathlib import Path

# 手动合并
combined = {}

for suite in ["slack", "gmail", "calendar"]:
    suite_dir = Path(f"runs/openai_gpt-4o-mini-logic_tree_shield/{suite}")
    
    for json_file in suite_dir.rglob("*.json"):
        with open(json_file) as f:
            result = json.load(f)
            
        # 添加到 combined 数据
        key = f"{suite}_{result['user_task_id']}"
        combined[key] = result

print(f"Combined Results: {len(combined)} tasks")
```

### 方法3: 创建汇总统计

```python
from pathlib import Path
import json

stats = {
    "total_tasks": 0,
    "security_success": 0,      # 防御成功
    "utility_success": 0,       # 用户任务完成
    "by_suite": {}
}

for suite in ["slack", "gmail", "calendar"]:
    suite_stats = {"total": 0, "blocked": 0}
    
    suite_dir = Path(f"runs/openai_gpt-4o-mini-logic_tree_shield/{suite}")
    for json_file in suite_dir.rglob("*.json"):
        with open(json_file) as f:
            result = json.load(f)
        
        suite_stats["total"] += 1
        if result["security"] == False:  # 防御成功
            suite_stats["blocked"] += 1
        
        stats["total_tasks"] += 1
    
    stats["by_suite"][suite] = suite_stats

print("Combined Results Summary:")
for suite, s in stats["by_suite"].items():
    rate = 100 * s["blocked"] / s["total"]
    print(f"  {suite}: {s['blocked']}/{s['total']} = {rate:.1f}%")

total_rate = 100 * sum(s["blocked"] for s in stats["by_suite"].values()) / stats["total_tasks"]
print(f"  COMBINED: {total_rate:.1f}%")
```

---

## 🎯 总结

| 问题 | 回答 |
|------|------|
| **是否有 combined_task 数据文件?** | ❌ 不存在<br/>只有单个场景的数据文件 |
| **Combined Results 从哪来?** | 📊 运行多个场景时在内存中合并 |
| **如何获取 Combined Results?** | 🏃 运行 `-s slack gmail calendar` 命令 |
| **Combined 数据存储在哪?** | 💾 不保存到磁盘<br/>只在执行时内存中生成 |
| **能否查看已保存的 Combined?** | 🔍 可以手动合并 runs/ 文件夹中的数据 |
| **目的是什么?** | 🎯 汇总多场景的防御性能指标 |

---

## 📌 关键点

```
1. Combined Results 的含义:
   └─ 将多个场景 (slack, gmail, calendar) 的结果合并
   └─ 得到 overall performance metrics

2. 数据存储:
   ├─ 单个场景数据: runs/ 文件夹
   ├─ Combined 数据: 内存中 (不保存)
   └─ 运行时输出: 控制台日志

3. 任务ID形式:
   ├─ 单场景: user_task_0
   ├─ Combined: slack_user_task_0, gmail_user_task_0, ...
   └─ 场景前缀: 用于区分来源

4. 实际应用:
   ├─ 单个场景: 调试特定场景的防御
   └─ 多场景: 评估防御在多环境下的整体表现
```
