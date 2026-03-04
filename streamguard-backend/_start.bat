@echo off
cd /d "d:\学习资料\大创\2026\论文\MELON\agentdojo\streamguard-backend"
E:\software\anaconda\python.exe -X utf8 -m uvicorn app:app --host 127.0.0.1 --port 8011 --log-level info
