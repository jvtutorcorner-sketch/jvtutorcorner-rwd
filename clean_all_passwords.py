import os, re
root_dir = r'.agents/skills'
replacements = [ 
    (r'123456', '<YOUR_PASSWORD>'),
    (r'vitu otqp cmdu wxwd', '<YOUR_SMTP_PASS>')
]
count=0
for root, dirs, files in os.walk(root_dir):
    for file in files:
        if file.endswith('.md') and not file == 'SKILL.md' and r'env-check' not in root:
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
                count+=1
print('Done cleaning.')
