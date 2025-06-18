console.log('=== Environment Check ===')
console.log('Node version:', process.version)
console.log('Platform:', process.platform)
console.log('Architecture:', process.arch)
console.log('Current directory:', process.cwd())
console.log('Environment NODE_ENV:', process.env.NODE_ENV)

// Check for executables
const fs = require('fs')
const path = require('path')

const executables = [
  '/usr/bin/node',
  '/usr/bin/pnpm',
  '/usr/bin/npm',
  '/usr/bin/npx'
]

console.log('\n=== Executable Check ===')
executables.forEach(exec => {
  try {
    const exists = fs.existsSync(exec)
    console.log(`${exec}: ${exists ? 'EXISTS' : 'NOT FOUND'}`)
  } catch (e) {
    console.log(`${exec}: ERROR - ${e.message}`)
  }
})

// Check if we can find vitest
console.log('\n=== Vitest Check ===')
try {
  const nodeModulesBin = path.join(process.cwd(), 'node_modules', '.bin', 'vitest')
  console.log(`Local vitest: ${fs.existsSync(nodeModulesBin) ? 'EXISTS' : 'NOT FOUND'}`)
} catch (e) {
  console.log('Error checking vitest:', e.message)
}