import asyncio, os, json
from dotenv import load_dotenv
load_dotenv()

async def test():
    from openai import AsyncOpenAI
    dk = os.getenv('DEEPSEEK_API_KEY','')
    orkey = os.getenv('OPENROUTER_API_KEY','')
    ok = os.getenv('OPENAI_API_KEY','')
    if dk:
        key = dk
        base = os.getenv('LLM_BASE_URL','https://api.deepseek.com/v1')
        model = os.getenv('LLM_MODEL','deepseek-chat')
    elif orkey:
        key = orkey
        base = os.getenv('LLM_BASE_URL','https://openrouter.ai/api/v1')
        model = os.getenv('LLM_MODEL','deepseek/deepseek-chat')
    else:
        key = ok
        base = os.getenv('LLM_BASE_URL','')
        model = os.getenv('LLM_MODEL','gpt-4o-mini')
    print(f'model={model}, base={base}')
    client = AsyncOpenAI(api_key=key, base_url=base) if base else AsyncOpenAI(api_key=key)
    try:
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {'role':'system','content':'只返回合法JSON，不要markdown'},
                {'role':'user','content':'为关键词"玻尿酸精华"生成2个候选商品，返回JSON: {"products":[{"id":"p1","name":"名称","brand":"品牌","channel":"渠道","price":"价格","spec":"规格","fit_for":[],"known_risks":[]}]}'}
            ],
            max_tokens=400,
            temperature=0.3
        )
        print('LLM 返回:')
        print(resp.choices[0].message.content[:400])
    except Exception as e:
        print('LLM 错误:', type(e).__name__, str(e)[:400])

asyncio.run(test())
