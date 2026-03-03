import os
from dotenv import load_dotenv
load_dotenv()

from openai import OpenAI
import json

key = os.getenv("OPENROUTER_API_KEY", "")
print(f"Key loaded: {key[:20]}..." if key else "NO KEY FOUND")
print(f"OPENAI_AVAILABLE: True")

base_url = "https://openrouter.ai/api/v1"
model = os.getenv("LLM_MODEL", "deepseek/deepseek-chat")
print(f"Model: {model}")
print(f"Base URL: {base_url}")

c = OpenAI(api_key=key, base_url=base_url)

system_prompt = """You are a live-stream compliance auditor. Analyze text for semantic alignment issues.
Return JSON: {"type": "fact"|"hype"|"trap", "score": 0-1, "sub_scores": {...}, "violations": [...], "suggestion": "..."}"""

text = "这款面膜只剩最后10件，错过今天等一年！"

try:
    r = c.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Evaluate: {text}"}
        ],
        temperature=0.3,
        max_tokens=500,
    )
    result = r.choices[0].message.content
    print("Raw AI response:", result)
    # Try parse
    if "```json" in result:
        result = result.split("```json")[1].split("```")[0]
    elif "```" in result:
        result = result.split("```")[1].split("```")[0]
    parsed = json.loads(result.strip())
    print("Parsed OK:", parsed)
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
