#!/usr/bin/env python3
import sys
import os

# Set up path
backend_dir = r"d:\学习资料\2024OOP\git\streamguard\streamguard-backend"
os.chdir(backend_dir)
sys.path.insert(0, backend_dir)

print(f"Working directory: {os.getcwd()}")
print(f"Python version: {sys.version}")

# Try to import and run the app
try:
    print("\n===== Attempting to import app =====")
    from app import app
    print("✓ Successfully imported app from app.py")
    print(f"✓ App object type: {type(app)}")
    print(f"✓ App title: {app.title}")
    
    # Try to access the app's routes
    print(f"\n✓ App has {len(app.routes)} routes")
    
except Exception as e:
    print(f"\n✗ Failed to import app:")
    print(f"Error type: {type(e).__name__}")
    print(f"Error message: {e}")
    import traceback
    print("\nFull traceback:")
    traceback.print_exc()
    sys.exit(1)

print("\n✓ SUCCESS: App is fully importable!")
