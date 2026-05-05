#!/usr/bin/env python3
"""Test if app module can be imported"""
import sys
import traceback

try:
    import app
    print("SUCCESS: app module loaded")
    sys.exit(0)
except Exception as e:
    print("ERROR: Failed to import app module")
    print(f"Error: {e}")
    traceback.print_exc()
    sys.exit(1)
