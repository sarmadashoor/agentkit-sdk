import { PluginConfig } from '../../types'

/**
 * Generates configuration files for the plugin
 */
export class PluginConfigGenerator {
  /**
   * Generate plugin.json metadata file
   */
  generatePluginJson(config: PluginConfig): any {
    return {
      name: config.name,
      version: '1.0.0',
      description: config.description || `${config.name} plugin for AgentKit`,
      author: config.author,
      license: config.license,
      main: './index.ts',
      hooks: config.hooks,
      browserSafe: config.browserSafe || false,
      compatibility: {
        minSdkVersion: '0.1.0',
        ...(config.browserSafe && {
          browserCompatibility: {
            chrome: 'latest',
            firefox: 'latest',
            safari: 'latest',
            edge: 'latest'
          }
        })
      }
    }
  }

  /**
   * Generate package.json for the plugin
   */
  generatePackageJson(config: PluginConfig): any {
    const packageName = config.scoped 
      ? `${config.scoped}/agentkit-plugin-${config.name}`
      : `agentkit-plugin-${config.name}`

    return {
      name: packageName,
      version: '1.0.0',
      description: config.description || `${config.name} plugin for AgentKit`,
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      files: ['dist', 'README.md', 'plugin.json'],
      scripts: {
        build: 'tsup',
        dev: 'tsup --watch',
        'plugin:dev': 'nodemon --watch src --exec "npm run build && node test-harness.js"',
        test: 'vitest',
        'test:run': 'vitest run',
        'test:coverage': 'vitest run --coverage',
        ...(config.browserSafe && {
          'test:browser': 'playwright test',
          'test:browser:ui': 'playwright test --ui'
        }),
        lint: 'eslint src --ext .ts',
        'lint:fix': 'eslint src --ext .ts --fix',
        format: 'prettier --write "src/**/*.ts"',
        'format:check': 'prettier --check "src/**/*.ts"',
        prepublishOnly: 'npm run build && npm run test:run'
      },
      keywords: ['agentkit', 'plugin', config.name],
      author: config.author,
      license: config.license,
      peerDependencies: {
        '@agentkit/types': '^0.1.0-alpha',
        '@agentkit/sdk': '^0.1.0-alpha'
      },
      devDependencies: {
        '@agentkit/types': '^0.1.0-alpha',
        '@agentkit/sdk': '^0.1.0-alpha',
        '@types/node': '^20.10.4',
        '@typescript-eslint/eslint-plugin': '^6.13.2',
        '@typescript-eslint/parser': '^6.13.2',
        '@vitest/coverage-v8': '^1.0.4',
        eslint: '^8.55.0',
        'eslint-config-prettier': '^9.1.0',
        'eslint-plugin-prettier': '^5.0.1',
        'lint-staged': '^15.2.0',
        nodemon: '^3.0.2',
        prettier: '^3.1.1',
        tsup: '^8.0.1',
        typescript: '^5.3.3',
        vitest: '^1.0.4',
        zod: '^3.22.4',
        ...(config.browserSafe && {
          '@playwright/test': '^1.40.1',
          playwright: '^1.40.1'
        })
      },
      ...(config.scoped && {
        publishConfig: {
          access: 'restricted'
        }
      }),
      engines: {
        node: '>=18.0.0'
      }
    }
  }

  /**
   * Generate TypeScript configuration
   */
  generateTsConfig(config: PluginConfig): any {
    return {
      extends: '../../tsconfig.json',
      compilerOptions: {
        outDir: './dist',
        rootDir: './src',
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        composite: true,
        tsBuildInfoFile: './dist/.tsbuildinfo'
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist', '**/*.test.ts', '**/*.spec.ts']
    }
  }

  /**
   * Generate TSUP configuration for building
   */
  generateTsupConfig(config: PluginConfig): string {
    return `import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  minify: false,
  sourcemap: true,
  splitting: false,
  target: 'es2020',
  external: ['@agentkit/types', '@agentkit/sdk'],
  ${config.browserSafe ? `
  // Browser-compatible build
  platform: 'neutral',
  esbuildOptions: {
    conditions: ['browser']
  }` : ''}
})
`
  }
}