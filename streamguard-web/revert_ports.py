import os
import glob
import re

search_dir = r"d:\学习资料\2024OOP\git\streamguard\streamguard-web\src"
files_to_check = []

for root, _, files in os.walk(search_dir):
    for f in files:
        if f.endswith((".js", ".jsx", ".ts", ".tsx")):
            files_to_check.append(os.path.join(root, f))

files_to_check.append(r"d:\学习资料\2024OOP\git\streamguard\streamguard-web\vite.config.js")

count = 0
for fpath in files_to_check:
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()

    new_content = content.replace("8012", "8011")
    if content != new_content:
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(new_content)
        count += 1
        print(f"Updated {fpath}")

print(f"Total files updated: {count}")
