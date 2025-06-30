import { PluginConfig } from '../../types'

/**
 * Generates development tooling configuration files
 */
export class PluginToolingGenerator {
  /**
   * Generate ESLint configuration
   */
  generateEslintConfig(config: PluginConfig): string {
    return `module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended'
  ],
  env: {
    node: true,
    es2022: true${config.browserSafe ? ',\n    browser: true' : ''}
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }]
  },
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.js']
}
`
  }

  /**
   * Generate Prettier configuration
   */
  generatePrettierConfig(): any {
    return {
      semi: false,
      trailingComma: 'none',
      singleQuote: true,
      printWidth: 100,
      tabWidth: 2,
      arrowParens: 'always'
    }
  }

  /**
   * Generate .gitignore file
   */
  generateGitignore(): string {
    return `# Dependencies
node_modules/

# Build outputs
dist/
*.tsbuildinfo

# Test coverage
coverage/
.nyc_output/

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
.env.*.local

# Temporary files
*.tmp
*.temp
`
  }

  /**
   * Generate lint-staged configuration
   */
  generateLintStagedConfig(): any {
    return {
      '*.ts': ['eslint --fix', 'prettier --write'],
      '*.{json,md}': ['prettier --write']
    }
  }

  /**
   * Generate Vitest configuration
   */
  generateVitestConfig(config: PluginConfig): string {
    return `import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: '${config.browserSafe ? 'jsdom' : 'node'}',
    coverage: {
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.spec.ts'
      ]
    }
  }
})
`
  }

  /**
   * Generate Playwright configuration (for browser-safe plugins)
   */
  generatePlaywrightConfig(_config: PluginConfig): string {
    return `import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './',
  testMatch: '*.browser.test.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ],
  webServer: {
    command: 'npm run serve',
    port: 3000,
    reuseExistingServer: !process.env.CI
  }
})
`
  }

  /**
   * Generate EditorConfig
   */
  generateEditorConfig(): string {
    return `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
`
  }

  /**
   * Generate GitHub Actions workflow
   */
  generateGithubWorkflow(config: PluginConfig): string {
    return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18, 20]

    steps:
      - uses: actions/checkout@v4
      
      - name: Use Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run linter
        run: npm run lint
        
      - name: Run tests
        run: npm run test:run
        
      - name: Build
        run: npm run build
        
      ${config.browserSafe ? `- name: Run browser tests
        run: npm run test:browser` : ''}
`
  }
}