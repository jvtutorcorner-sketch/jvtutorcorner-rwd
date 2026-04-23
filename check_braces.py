with open('d:\\jvtutorcorner-rwd\\app\\add-app\\page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

open_count = content.count('{')
close_count = content.count('}')

print(f'Open braces: {open_count}')
print(f'Close braces: {close_count}')
print(f'Difference: {open_count - close_count}')

# Find lines with braces
lines = content.split('\n')
print(f'\nTotal lines: {len(lines)}')

# Track the first unmatched brace
balance = 0
first_unmatched_line = None

for i, line in enumerate(lines, 1):
    prev_balance = balance
    balance += line.count('{') - line.count('}')
    
    # If balance changes, show this line
    if balance != prev_balance and ('{' in line or '}' in line):
        if i > 1980:  # Show lines near the end
            print(f'{i}: balance={balance} {line[:70]}')
    
    if balance > 0 and first_unmatched_line is None:
        first_unmatched_line = i

if balance > 0:
    print(f'\nFinal balance: {balance} (unclosed {{)')
    
    # Find which line has the unmatched brace
    balance = 0
    for i, line in enumerate(lines, 1):
        new_balance = balance + line.count('{') - line.count('}')
        if new_balance > balance and balance >= 0:
            print(f'Opening brace at line {i}: {line[:70]}...')
        balance = new_balance

