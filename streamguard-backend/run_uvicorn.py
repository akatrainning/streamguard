import uvicorn
import sys
import os
import logging

if __name__ == "__main__":
    # Ensure current directory is in sys.path BEFORE any imports
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)
        
    os.chdir(current_dir)
    
    try:
        print(f"Working Directory: {os.getcwd()}")
        print(f"Python Executable: {sys.executable}")
        
        # Attempt to import app directly to catch strictly syntax/dependency errors
        import app
        print("✓ Successfully imported 'app' module in the top-level process.")
        
        port = int(os.environ.get("PORT", "8011"))
        print(f"Starting Uvicorn on 0.0.0.0:{port}...")
        
        # Run uvicorn programmatically
        uvicorn.run(
            "app:app", 
            host="0.0.0.0", 
            port=port, 
            reload=True,
            reload_dirs=[current_dir], # Explicitly watch backend dir
            log_level="info",
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        print("\n[CRITICAL] Failed to run uvicorn due to exception above.", file=sys.stderr)
        input("Press Enter to exit...")  # Keeps window open if double clicked
        sys.exit(1)
