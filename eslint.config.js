// Basic ESLint configuration for AgentKit SDK
// Uses built-in ESLint rules without requiring additional packages

export default [
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly'
      }
    },
    rules: {
      // Code quality
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off', // Allow console in SDK
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
      
      // Import rules
      'no-duplicate-imports': 'error',
      
      // Best practices
      'no-empty': 'warn',
      'no-empty-function': 'warn',
      'no-unreachable': 'error',
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-func-assign': 'error',
      'valid-typeof': 'error'
    }
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**/*.ts', '**/__tests__/**/*.js'],
    rules: {
      // Relax rules for test files
      'no-empty-function': 'off',
      'no-unused-vars': 'off'
    }
  },
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '*.d.ts',
      'packages/*/dist/**',
      'test-results/**',
      'playwright-report/**'
    ]
  }
]