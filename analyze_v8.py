import glob, json, os

runs_dir = 'd:/学习资料/大创/2026/论文/MELON/agentdojo/runs'

def analyze_run(run_name, attack_pattern):
    pattern = os.path.join(runs_dir, run_name, 'slack', '**', attack_pattern)
    files = glob.glob(pattern, recursive=True)
    if not files:
        print(f"{run_name}: no files found")
        return
    c = {'ss':0,'sf':0,'as':0,'af':0}
    for f in files:
        d = json.load(open(f, encoding='utf-8'))
        s = d.get('security', False)
        u = d.get('utility', False)
        key = ('s' if s else 'a') + ('s' if u else 'f')
        c[key] = c.get(key, 0) + 1
    total = len(files)
    util = (c['ss'] + c['as']) / total * 100
    asr  = (c['as'] + c['af']) / total * 100
    print(f"[{run_name}]  n={total}")
    print(f"  防御成功+任务完成: {c['ss']} ({c['ss']/total*100:.1f}%)")
    print(f"  防御成功+任务失败: {c['sf']} ({c['sf']/total*100:.1f}%)  <- over-blocking")
    print(f"  攻击成功+任务完成: {c['as']} ({c['as']/total*100:.1f}%)  <- leakage")
    print(f"  攻击成功+任务失败: {c['af']} ({c['af']/total*100:.1f}%)")
    print(f"  >>> ASR={asr:.1f}%  Utility={util:.1f}%")
    print()

print("="*60)
analyze_run('gpt-4o-mini-2024-07-18',           'injection_task_*.json')
analyze_run('openai_gpt-4o-mini-dual_track_shield', 'injection_task_*.json')
analyze_run('gpt-4o-mini-2024-07-18-melon',     'injection_task_*.json')
