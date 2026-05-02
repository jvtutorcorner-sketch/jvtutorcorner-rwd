import os, re
root_dir = r'.agents/skills'
replacements = [ 
    (r'=123456', '=<YOUR_PASSWORD>'),
    (r'="123456"', '="<YOUR_PASSWORD>"'),
    (r'=jv_secret_bypass_2024', '=<YOUR_BYPASS_SECRET>'),
    (r'=jv_secure_bypass_2024', '=<YOUR_BYPASS_SECRET>'),
    (r'"jv_secret_bypass_2024"', '"<YOUR_BYPASS_SECRET>"'),
    (r'"jv_secure_bypass_2024"', '"<YOUR_BYPASS_SECRET>"'),
    (r'\"jv_secret_bypass_2024\"', '\"<YOUR_BYPASS_SECRET>\"'),
    (r'\"jv_secure_bypass_2024\"', '\"<YOUR_BYPASS_SECRET>\"'),
    (r'jv_secret_bypass_2024', '<YOUR_BYPASS_SECRET>'),
    (r'jv_secure_bypass_2024', '<YOUR_BYPASS_SECRET>')
]
for root, dirs, files in os.walk(root_dir):
    for file in files:
        if file.endswith('.md'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            new_content = content
            for pattern, repl in replacements:
                new_content = re.sub(pattern, repl, new_content)
            if new_content != content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f'Cleaned secrets in {path}')
