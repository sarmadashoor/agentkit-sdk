import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { runDoctorCommand } from '../src/commands/doctor'

describe('Doctor Command', () => {
  let tmpDir: string
  let originalCwd: string
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentkit-doctor-test-'))
    originalCwd = process.cwd()
    originalEnv = { ...process.env }
    
    // Mock process.cwd to return our temp directory
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.removeSync(tmpDir)
    process.env = originalEnv
  })

  describe('Basic Health Checks', () => {
    it('should check Node.js version successfully', async () => {
      const checks = await runDoctorCommand({ json: true })
      
      const nodeCheck = checks.find(check => check.name === 'Node.js Version')
      expect(nodeCheck).toBeDefined()
      expect(nodeCheck!.status).toBe('pass') // Should pass since we're running on Node 18+
      expect(nodeCheck!.message).toContain('supported')
    })

    it('should check environment variables', async () => {
      // Set a test environment
      process.env.NODE_ENV = 'test'
      
      const checks = await runDoctorCommand({ json: true })
      
      const envCheck = checks.find(check => check.name === 'Environment Variables')
      expect(envCheck).toBeDefined()
      expect(['pass', 'warn']).toContain(envCheck!.status) // Could be warn if signing secret missing
    })

    it('should check file system permissions', async () => {
      const checks = await runDoctorCommand({ json: true })
      
      const fsCheck = checks.find(check => check.name === 'File System Permissions')
      expect(fsCheck).toBeDefined()
      expect(fsCheck!.status).toBe('pass')
      expect(fsCheck!.message).toContain('Read/write permissions OK')
    })

    it('should check network configuration', async () => {
      const checks = await runDoctorCommand({ json: true })
      
      const networkCheck = checks.find(check => check.name === 'Network Configuration')
      expect(networkCheck).toBeDefined()
      expect(['pass', 'warn']).toContain(networkCheck!.status)
    })
  })

  describe('Plugin Directory Checks', () => {
    it('should create plugin directory if it does not exist', async () => {
      // Set a custom plugin directory
      const pluginDir = path.join(tmpDir, '.agentkit', 'plugins')
      process.env.AGENTKIT_PLUGIN_DIR = pluginDir
      
      const checks = await runDoctorCommand({ json: true })
      
      const pluginDirCheck = checks.find(check => check.name === 'Plugin Directory')
      expect(pluginDirCheck).toBeDefined()
      expect(pluginDirCheck!.status).toBe('pass')
      expect(fs.existsSync(pluginDir)).toBe(true)
    })

    it('should handle existing plugin directory', async () => {
      // Create plugin directory beforehand
      const pluginDir = path.join(tmpDir, '.agentkit', 'plugins')
      fs.ensureDirSync(pluginDir)
      fs.writeFileSync(path.join(pluginDir, 'test-plugin.js'), 'console.log("test")')
      
      process.env.AGENTKIT_PLUGIN_DIR = pluginDir
      
      const checks = await runDoctorCommand({ json: true })
      
      const pluginDirCheck = checks.find(check => check.name === 'Plugin Directory')
      expect(pluginDirCheck).toBeDefined()
      expect(pluginDirCheck!.status).toBe('pass')
      expect(pluginDirCheck!.message).toContain('1 items')
    })
  })

  describe('SDK Installation Checks', () => {
    it('should detect AgentKit packages when present', async () => {
      // Create a package.json with AgentKit dependencies
      const packageJson = {
        name: 'test-project',
        dependencies: {
          '@agentkit/sdk': '^0.1.0-alpha'
        },
        devDependencies: {
          '@agentkit/types': '^0.1.0-alpha'
        }
      }
      
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      )
      
      const checks = await runDoctorCommand({ json: true })
      
      const sdkCheck = checks.find(check => check.name === 'AgentKit SDK')
      expect(sdkCheck).toBeDefined()
      expect(sdkCheck!.status).toBe('pass')
      expect(sdkCheck!.message).toContain('AgentKit packages found (2)')
    })

    it('should warn when no AgentKit packages are found', async () => {
      // Create a package.json without AgentKit dependencies
      const packageJson = {
        name: 'test-project',
        dependencies: {
          'express': '^4.18.0'
        }
      }
      
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      )
      
      const checks = await runDoctorCommand({ json: true })
      
      const sdkCheck = checks.find(check => check.name === 'AgentKit SDK')
      expect(sdkCheck).toBeDefined()
      expect(sdkCheck!.status).toBe('warn')
      expect(sdkCheck!.message).toContain('No AgentKit packages detected')
    })

    it('should warn when not in a Node.js project', async () => {
      // Don't create package.json
      
      const checks = await runDoctorCommand({ json: true })
      
      const sdkCheck = checks.find(check => check.name === 'AgentKit SDK')
      expect(sdkCheck).toBeDefined()
      expect(sdkCheck!.status).toBe('warn')
      expect(sdkCheck!.message).toContain('Not in a Node.js project directory')
    })
  })

  describe('Output Formats', () => {
    it('should return checks array when called programmatically', async () => {
      const checks = await runDoctorCommand({ json: true })
      
      expect(Array.isArray(checks)).toBe(true)
      expect(checks.length).toBeGreaterThan(0)
      
      // Check that each check has required properties
      for (const check of checks) {
        expect(check).toHaveProperty('name')
        expect(check).toHaveProperty('status')
        expect(check).toHaveProperty('message')
        expect(['pass', 'warn', 'fail']).toContain(check.status)
      }
    })

    it('should handle verbose mode', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      await runDoctorCommand({ verbose: true })
      
      expect(consoleSpy).toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })

    it('should handle JSON output mode', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      
      const checks = await runDoctorCommand({ json: true })
      
      expect(Array.isArray(checks)).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"checks"')
      )
      
      consoleSpy.mockRestore()
    })
  })

  describe('Environment Variables', () => {
    it('should handle missing NODE_ENV', async () => {
      delete process.env.NODE_ENV
      
      const checks = await runDoctorCommand({ json: true })
      
      const envCheck = checks.find(check => check.name === 'Environment Variables')
      expect(envCheck).toBeDefined()
      expect(envCheck!.details).toContain('NODE_ENV not set')
    })

    it('should handle missing signing secret', async () => {
      delete process.env.AGENTKIT_SIGNING_SECRET
      process.env.NODE_ENV = 'development'
      
      const checks = await runDoctorCommand({ json: true })
      
      const envCheck = checks.find(check => check.name === 'Environment Variables')
      expect(envCheck).toBeDefined()
      expect(['pass', 'warn']).toContain(envCheck!.status)
    })

    it('should pass when all environment variables are set', async () => {
      process.env.NODE_ENV = 'development'
      process.env.AGENTKIT_SIGNING_SECRET = 'test-secret-key'
      
      const checks = await runDoctorCommand({ json: true })
      
      const envCheck = checks.find(check => check.name === 'Environment Variables')
      expect(envCheck).toBeDefined()
      expect(envCheck!.status).toBe('pass')
    })
  })
})