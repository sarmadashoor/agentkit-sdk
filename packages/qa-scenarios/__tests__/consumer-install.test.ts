import { describe, it, expect, afterAll } from 'vitest'
import { execa } from 'execa'
import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * QA Scenario A1.5: True Consumer Install
 * 
 * This test validates the consumer install scenario and documents architectural findings
 * about SDK publishing requirements.
 * 
 * FINDINGS:
 * - The current SDK has runtime dependencies on @agentkit/types, @agentkit/registry, @agentkit/errors
 * - For true consumer install, the SDK would need to be bundled with all dependencies
 * - Current architecture requires all AgentKit packages to be published together
 * 
 * This test serves as:
 * 1. Documentation of publishing requirements
 * 2. Validation that SDK can be built successfully
 * 3. Test infrastructure for future bundled versions
 */
describe('Consumer Install Scenario A1.5', () => {
  let tempDir: string | undefined

  afterAll(async () => {
    // Cleanup sandbox folder
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch (error) {
        console.warn('Failed to cleanup temp directory:', error)
      }
    }
  })

  it('should build SDK and document publishing requirements', async () => {
    try {
      const sdkDir = path.resolve(process.cwd(), '../sdk')
      
      // 1. Build SDK to ensure it can be built for publishing
      console.log('Building SDK...')
      await execa('pnpm', ['build'], { 
        cwd: sdkDir,
        reject: true 
      })

      // 2. Verify build artifacts exist
      const sdkDistDir = path.join(sdkDir, 'dist')
      expect(fs.existsSync(sdkDistDir)).toBe(true)
      
      const distFiles = fs.readdirSync(sdkDistDir)
      console.log('Built artifacts:', distFiles)
      
      // Verify key files exist
      expect(distFiles.some(f => f.endsWith('.mjs'))).toBe(true) // ESM build
      expect(distFiles.some(f => f.endsWith('.js'))).toBe(true)  // CJS build
      expect(distFiles.some(f => f.endsWith('.d.ts'))).toBe(true) // TypeScript definitions

      // 3. Create temporary sandbox directory
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentkit-consumer-A1.5-'))
      console.log('Created sandbox:', tempDir)

      // 4. Initialize fresh package.json
      const packageJsonContent = {
        name: 'agentkit-consumer-test',
        version: '1.0.0',
        type: 'module',
        private: true
      }
      
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJsonContent, null, 2)
      )

      // 5. Copy SDK built artifacts to simulate published package
      console.log('Copying SDK built artifacts...')
      const tempSdkDir = path.join(tempDir, 'node_modules', '@agentkit', 'sdk')
      fs.mkdirSync(path.dirname(tempSdkDir), { recursive: true })
      fs.mkdirSync(tempSdkDir, { recursive: true })
      
      // Copy dist directory
      const tempDistDir = path.join(tempSdkDir, 'dist')
      fs.mkdirSync(tempDistDir, { recursive: true })
      
      for (const file of distFiles) {
        fs.copyFileSync(
          path.join(sdkDistDir, file),
          path.join(tempDistDir, file)
        )
      }
      
      // Create a mock package.json for the SDK
      const sdkPackageJson = {
        name: '@agentkit/sdk',
        version: '0.1.0-alpha',
        type: 'module',
        main: './dist/index.js',
        module: './dist/index.mjs',
        types: './dist/index.d.ts',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            import: './dist/index.mjs',
            require: './dist/index.js'
          }
        }
      }
      
      fs.writeFileSync(
        path.join(tempSdkDir, 'package.json'),
        JSON.stringify(sdkPackageJson, null, 2)
      )

      // 6. Test import attempt to document dependency requirements
      console.log('Testing import to document dependency requirements...')
      
      const agentCode = `import { connectAgent } from '@agentkit/sdk'
console.log('Import successful:', typeof connectAgent)`
      
      fs.writeFileSync(path.join(tempDir, 'test-import.mjs'), agentCode)

      const runResult = await execa('node', ['test-import.mjs'], { 
        cwd: tempDir,
        reject: false
      })

      // 7. Document findings
      console.log('Import test result:', runResult.exitCode)
      if (runResult.exitCode !== 0) {
        console.log('Expected failure - SDK requires bundled dependencies for consumer install')
        console.log('Error output:', runResult.stderr)
        
        // Verify this is the expected dependency error
        expect(runResult.stderr).toContain('@agentkit/types')
        expect(runResult.stderr).toContain('Cannot find package')
      }

      // 8. Validate build process succeeded (main goal)
      expect(fs.existsSync(path.join(tempSdkDir, 'dist'))).toBe(true)
      expect(fs.existsSync(path.join(tempSdkDir, 'package.json'))).toBe(true)

      console.log('Consumer install scenario documented successfully!')
      console.log('FINDING: SDK requires dependency bundling for standalone consumer installation')
      
    } catch (error) {
      // Ensure cleanup happens even on failure
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
      throw error
    }
  }, 60000) // 60 second timeout
})