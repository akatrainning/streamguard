#!/usr/bin/env python3
"""Debug script with step-by-step import tracking"""
import sys
import os

# Change to the backend directory
backend_dir = r"d:\学习资料\2024OOP\git\streamguard\streamguard-backend"
os.chdir(backend_dir)
sys.path.insert(0, backend_dir)

print(f"[1/5] Working directory: {os.getcwd()}", flush=True)

try:
    print("[2/5] Importing models...", flush=True)
    import models
    print("[2/5] ✓ models imported", flush=True)
    
    print("[3/5] Importing rag_pipeline...", flush=True)
    import rag_pipeline
    print("[3/5] ✓ rag_pipeline imported", flush=True)
    
    print("[4/5] Importing main app module...", flush=True)
    import app
    print("[4/5] ✓ app imported", flush=True)
    
    print("[5/5] FastAPI app object exists:", hasattr(app, "app"), flush=True)
    
    print("\n✓ SUCCESS: All imports completed!", flush=True)
    sys.exit(0)
    
except Exception as e:
    print(f"\n✗ ERROR during import: {type(e).__name__}: {e}", flush=True)
    import traceback
    traceback.print_exc()
    sys.exit(1)
