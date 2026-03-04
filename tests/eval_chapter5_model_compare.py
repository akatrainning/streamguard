import json
import os
import re
from pathlib import Path
from collections import Counter, defaultdict


def load_samples(root: Path):
    js = (root / 'streamguard-web' / 'src' / 'data' / 'mockStream.js').read_text(encoding='utf-8')
    pat = re.compile(r"\{\s*id:\s*\d+,\s*text:\s*'([^']+)'\s*,\s*type:\s*'([^']+)'", re.S)
    items = [{'text': m.group(1), 'label': m.group(2)} for m in pat.finditer(js)]
    if not items:
        raise RuntimeError('No labeled samples found in mockStream.js')
    return items


def f1_macro(y_true, y_pred, labels=('fact', 'hype', 'trap')):
    f1s = []
    for c in labels:
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == c and p == c)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t != c and p == c)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == c and p != c)
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
        f1s.append(f1)
    return sum(f1s) / len(f1s)


def evaluate(name, samples, predict_fn):
    y_true = [x['label'] for x in samples]
    y_pred = [predict_fn(x['text']) for x in samples]
    acc = sum(int(a == b) for a, b in zip(y_true, y_pred)) / len(y_true)
    mf1 = f1_macro(y_true, y_pred)

    cm = defaultdict(Counter)
    for t, p in zip(y_true, y_pred):
        cm[t][p] += 1

    return {
        'method': name,
        'accuracy': round(acc, 4),
        'macro_f1': round(mf1, 4),
        'confusion': {k: dict(cm[k]) for k in ('fact', 'hype', 'trap')},
    }


def load_backend_module(root: Path):
    import importlib.util
    p = root / 'streamguard-backend' / 'app.py'
    spec = importlib.util.spec_from_file_location('sg_app', str(p))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def build_bert_predictor_local_only():
    from transformers import pipeline

    # Try cached multilingual NLI checkpoints only; never download from internet.
    candidates = [
        'MoritzLaurer/mDeBERTa-v3-base-mnli-xnli',
        'joeddav/xlm-roberta-large-xnli',
        'facebook/bart-large-mnli',
    ]
    labels_zh = ['事实陈述', '夸大宣传', '陷阱话术']
    label_map = {'事实陈述': 'fact', '夸大宣传': 'hype', '陷阱话术': 'trap'}

    last_err = None
    clf = None
    used = None
    for m in candidates:
        try:
            clf = pipeline('zero-shot-classification', model=m, tokenizer=m, device=-1, local_files_only=True, framework='pt')
            used = m
            break
        except Exception as e:
            last_err = str(e)

    if clf is None:
        raise RuntimeError(f'No cached BERT/XNLI model found. last_error={last_err}')

    def predict(text: str) -> str:
        res = clf(text, candidate_labels=labels_zh, hypothesis_template='该句属于{}。', multi_label=False)
        top = res['labels'][0]
        return label_map.get(top, 'fact')

    return used, predict


def build_llm_predictor(root: Path):
    mod = load_backend_module(root)
    if not getattr(mod, 'client_sync', None) or not getattr(mod, 'LLM_API_KEY', ''):
        raise RuntimeError('LLM API not configured (OPENAI/OPENROUTER/DEEPSEEK key missing)')

    model = getattr(mod, 'LLM_MODEL', 'gpt-4o-mini')
    provider = getattr(mod, 'LLM_PROVIDER', 'unknown')

    # Preflight connectivity check: if this fails, we mark LLM as skipped.
    try:
        mod.client_sync.chat.completions.create(
            model=model,
            messages=[
                {'role': 'system', 'content': 'Return exactly one word: pong'},
                {'role': 'user', 'content': 'ping'},
            ],
            temperature=0.0,
            max_tokens=5,
        )
    except Exception as e:
        raise RuntimeError(f'LLM connectivity failed: {e}')

    def predict(text: str) -> str:
        prompt = (
            '你是直播话术分类器。仅输出 JSON，如 {"type":"fact|hype|trap"}。'
            'fact=客观信息；hype=夸大宣传；trap=陷阱/强迫/绝对化误导。'
        )
        resp = mod.client_sync.chat.completions.create(
            model=model,
            messages=[
                {'role': 'system', 'content': prompt},
                {'role': 'user', 'content': text},
            ],
            temperature=0.0,
            max_tokens=60,
        )
        content = (resp.choices[0].message.content or '').strip()
        if '```json' in content:
            content = content.split('```json', 1)[1].split('```', 1)[0].strip()
        elif '```' in content:
            content = content.split('```', 1)[1].split('```', 1)[0].strip()
        try:
            parsed = json.loads(content)
            t = parsed.get('type', 'fact')
        except Exception:
            # Fallback strict parsing if model does not fully comply.
            t = 'trap' if 'trap' in content.lower() else ('hype' if 'hype' in content.lower() else 'fact')
        return t if t in ('fact', 'hype', 'trap') else 'fact'

    return f'{provider}:{model}', predict


def main():
    root = Path(__file__).resolve().parents[1]
    samples = load_samples(root)
    mod = load_backend_module(root)

    results = {
        'meta': {
            'dataset': 'streamguard-web/src/data/mockStream.js',
            'dataset_size': len(samples),
            'labels': ['fact', 'hype', 'trap'],
            'note': 'This experiment compares rule-based methods against model-based methods (BERT/LLM when available).',
        },
        'methods': [],
        'skipped': [],
    }

    # Rule baselines
    results['methods'].append(evaluate('rule_keyword', samples, lambda t: mod.analyze_with_keywords(t).get('type', 'fact')))
    results['methods'].append(evaluate('rule_audio', samples, lambda t: mod.analyze_audio_with_rules(t).get('type', 'fact')))

    # BERT zero-shot (local cached only)
    try:
        bert_name, bert_predict = build_bert_predictor_local_only()
        r = evaluate(f'bert_zero_shot[{bert_name}]', samples, bert_predict)
        results['methods'].append(r)
    except Exception as e:
        results['skipped'].append({'method': 'bert_zero_shot', 'reason': str(e)})

    # LLM prompt classifier via backend analyze_utterance
    try:
        llm_name, llm_predict = build_llm_predictor(root)
        r = evaluate(f'llm_prompt[{llm_name}]', samples, llm_predict)
        results['methods'].append(r)
    except Exception as e:
        results['skipped'].append({'method': 'llm_prompt', 'reason': str(e)})

    # Rank by macro_f1 then accuracy
    results['methods'] = sorted(results['methods'], key=lambda x: (x['macro_f1'], x['accuracy']), reverse=True)

    out_file = root / 'results' / 'chapter5_model_compare.json'
    out_file.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')

    print('[ok] wrote', out_file)
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

