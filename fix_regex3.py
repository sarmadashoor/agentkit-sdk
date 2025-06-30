#!/usr/bin/env python3

file_path = '/home/s/dev/agentkit-sdk/packages/runtime-web/tests/browser/plugin-sandboxing.spec.ts'

with open(file_path, 'rb') as f:
    content = f.read()

# Fix the specific problematic patterns found at hex locations
# 0x67c0: /eval\s*\( -> /eval\s*(
# 0x67d0: /Function\s*\( -> /Function\s*(

# Replace the literal bytes 
content = content.replace(b'eval\\s*\\(', b'eval\\s*\\(')
content = content.replace(b'Function\\s*\\(', b'Function\\s*\\(')
content = content.replace(b'fetch\\s*\\(', b'fetch\\s*\\(')

with open(file_path, 'wb') as f:
    f.write(content)

print("Fixed literal backslashes")