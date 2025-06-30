#!/usr/bin/env python3

file_path = '/home/s/dev/agentkit-sdk/packages/runtime-web/tests/browser/plugin-sandboxing.spec.ts'

with open(file_path, 'rb') as f:
    content = f.read()

# Based on hex dump, we need to replace:
# At 0x0AD0: 282f 6576 616c 5c73 2a5c 282f 290a  -> (/eval\s*\(/).
# We want to remove 5c73 and 5c28 (the literal backslashes)

# Replace eval\s*\( with eval\s*(  (remove backslashes from \s and \()
content = content.replace(b'eval\\x5cs*\\x5c(', b'eval\\s*\\(')
content = content.replace(b'Function\\x5cs*\\x5c(', b'Function\\s*\\(')
content = content.replace(b'fetch\\x5cs*\\x5c(', b'fetch\\s*\\(')

# Try another approach - direct byte replacement
content = content.replace(b'\\x5cs', b's')
content = content.replace(b'\\x5c(', b'(')

with open(file_path, 'wb') as f:
    f.write(content)

print("Tried byte-level fixes")