module.exports = {
  '*.{ts,tsx}': [
    'eslint --fix',
    'prettier --write',
    'tsc --noEmit'
  ],
  '*.{js,json,md}': [
    'prettier --write'
  ]
}