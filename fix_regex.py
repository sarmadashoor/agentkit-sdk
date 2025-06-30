#!/usr/bin/env python3

# Simple script to fix regex patterns
import re

file_path = '/home/s/dev/agentkit-sdk/packages/runtime-web/tests/browser/plugin-sandboxing.spec.ts'

with open(file_path, 'r') as f:
    content = f.read()

# Fix unnecessary escapes in regex patterns
content = content.replace('/eval\\s*\\(/', '/eval\\s*\\(/')
content = content.replace('/Function\\s*\\(/', '/Function\\s*\\(/')
content = content.replace('/fetch\\s*\\(/', '/fetch\\s*\\(/')

with open(file_path, 'w') as f:
    f.write(content)

print("Fixed regex patterns")