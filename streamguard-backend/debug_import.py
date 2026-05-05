#!/usr/bin/env python3
"""Debug script to test app import"""
import sys
import os

# Change to the backend directory
backend_dir = r"d:\学习资料\2024OOP\git\streamguard\streamguard-backend"
os.chdir(backend_dir)
sys.path.insert(0, backend_dir)

print(f"Working directory: {os.getcwd()}")
print(f"Python path: {sys.path[:3]}")
print("\nAttempting to import app module...")

try:
    import app
    print("✓ Successfully imported app module")
    print(f"✓ FastAPI app object: {app.app}")
except ModuleNotFoundError as e:
    print(f"✗ ModuleNotFoundError: {e}")
    sys.exit(1)
except ImportError as e:
    print(f"✗ ImportError: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
except Exception as e:
    print(f"✗ Unexpected error: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n✓ All checks passed!")
sys.exit(0)
