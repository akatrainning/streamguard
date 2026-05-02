# StreamGuard

StreamGuard is a live-stream compliance monitoring demo. It contains a FastAPI
backend and a React/Vite frontend for monitoring live-stream scripts, chat
sentiment, risk alerts, rule checks, history reports, and Douyin live-room
discovery.

## Project Layout

```text
streamguard/
  streamguard-backend/   FastAPI backend, WebSocket streams, ASR/LLM analysis
  streamguard-web/       React + Vite frontend dashboard
  start-backend.ps1      Windows helper for the backend
  start-frontend.ps1     Windows helper for the frontend
  start-dev.ps1          Starts backend and frontend in two PowerShell windows
```

Removed legacy AgentDojo research code, experiment outputs, notebooks, and old
documentation so this repository only keeps StreamGuard application content.

## Requirements

- Python 3.10+
- Node.js 18+
- Chrome, if you use Douyin live-room discovery or live capture

## Backend

```powershell
cd streamguard-backend
pip install -r requirements.txt
copy .env.example .env
python -m uvicorn app:app --reload --host 0.0.0.0 --port 8011
```

The backend listens on `http://localhost:8011`.

Optional `.env` values:

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash

ASR_OPENAI_API_KEY=sk-...
LOCAL_WHISPER_MODEL=tiny
WHISPER_CPU_THREADS=2
WHISPER_BEAM_SIZE=1
AUDIO_CAPTURE_WINDOW_SECS=5
ENABLE_LIVE_AUDIO_ASR=1
DOUYIN_SHOW_BROWSER=0
```

Without API keys, the app still supports local/mock workflows and rule-based
fallback behavior where available.

## Frontend

```powershell
cd streamguard-web
npm install
npm run dev
```

Open the Vite URL printed in the terminal, usually `http://localhost:5173`.
The frontend proxies API and WebSocket calls to backend port `8011`.

## Quick Start On Windows

From the repository root:

```powershell
.\start-backend.ps1
.\start-frontend.ps1
```

Or start both in separate PowerShell windows:

```powershell
.\start-dev.ps1
```

## Useful Checks

```powershell
cd streamguard-web
npm run build

cd ..\streamguard-backend
python -m py_compile app.py douyin_cdp.py douyin_search.py douyin_selenium.py douyin_ws_client.py
```
