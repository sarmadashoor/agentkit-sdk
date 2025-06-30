#!/usr/bin/env python3

# Fix regex patterns by replacing literal backslashes
file_path = '/home/s/dev/agentkit-sdk/packages/runtime-web/tests/browser/plugin-sandboxing.spec.ts'

with open(file_path, 'rb') as f:
    content = f.read()

# Replace literal backslashes in regex patterns
# From hex dump we know: \s is 5c73 and \( is 5c28
# We want to remove the backslashes

# Fix eval\s*\( to eval\s*(
content = content.replace(b'/eval\\s*\\(/', b'/eval\\s*\\(/')

# Fix Function\s*\( to Function\s*(
content = content.replace(b'/Function\\s*\\(/', b'/Function\\s*\\(/')

# Fix fetch\s*\( to fetch\s*(
content = content.replace(b'/fetch\\s*\\(/', b'/fetch\\s*\\(/')

with open(file_path, 'wb') as f:
    f.write(content)

print("Fixed regex patterns with binary replacement")