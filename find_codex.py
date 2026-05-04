import os

def find_codex_dirs(start_path):
    found = []
    print(f"Scanning {start_path} for 'codex'...")
    try:
        # We'll use os.scandir for a faster shallow search (up to 4 levels)
        def scan_level(current_path, depth):
            if depth > 4:
                return
            try:
                for entry in os.scandir(current_path):
                    if entry.is_dir():
                        if "codex" in entry.name.lower():
                            found.append(entry.path)
                            print(f"Found: {entry.path}")
                        scan_level(entry.path, depth + 1)
            except OSError:
                pass
        
        scan_level(start_path, 0)
    except Exception as e:
        print(f"Error: {e}")
    return found

def get_dir_size(path):
    total = 0
    try:
        for dirpath, _, filenames in os.walk(path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                try:
                    if not os.path.islink(fp):
                        total += os.path.getsize(fp)
                except OSError:
                    pass
    except OSError:
        pass
    return total

if __name__ == '__main__':
    user_dir = os.path.expanduser('~')
    appdata = os.environ.get('APPDATA', '')
    localappdata = os.environ.get('LOCALAPPDATA', '')
    
    paths_to_scan = [user_dir, appdata, localappdata]
    # Remove duplicates
    paths_to_scan = list(set([p for p in paths_to_scan if p]))
    
    all_found = []
    for p in paths_to_scan:
        all_found.extend(find_codex_dirs(p))
    
    all_found = list(set(all_found)) # unique
    
    if not all_found:
        print("未找到包含 'codex' 的目录。也许可能是某个大模型缓存目录（如 .cache/huggingface）？")
    else:
        print("\n--- Codex Directories Size ---")
        for fn in all_found:
            size_bytes = get_dir_size(fn)
            print(f"{fn} : {size_bytes / (1024**3):.2f} GB")
