import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import * as path from 'path'

describe('CLI Integration Tests', () => {
  const cliPath = path.join(__dirname, '../../bin/agentkit.js')

  it('should show help when no command provided', () => {
    const result = execSync(`node ${cliPath} --help`, { encoding: 'utf8' })
    
    expect(result).toContain('AgentKit CLI')
    expect(result).toContain('Usage:')
    expect(result).toContain('create-plugin')
    expect(result).toContain('sign-plugin')
    expect(result).toContain('doctor')
  })

  it('should show version when requested', () => {
    const result = execSync(`node ${cliPath} --version`, { encoding: 'utf8' })
    
    expect(result).toContain('0.1.0-alpha')
  })

  it('should show create-plugin help', () => {
    const result = execSync(`node ${cliPath} create-plugin --help`, { encoding: 'utf8' })
    
    expect(result).toContain('AgentKit Plugin Creation')
    expect(result).toContain('Usage:')
    expect(result).toContain('--skip-prompts')
    expect(result).toContain('--with-tests')
  })

  it('should show sign-plugin help', () => {
    const result = execSync(`node ${cliPath} sign-plugin --help`, { encoding: 'utf8' })
    
    expect(result).toContain('AgentKit Plugin Signing')
    expect(result).toContain('Usage:')
    expect(result).toContain('--output')
    expect(result).toContain('--verbose')
  })

  it('should show doctor help', () => {
    const result = execSync(`node ${cliPath} doctor --help`, { encoding: 'utf8' })
    
    expect(result).toContain('AgentKit Environment Doctor')
    expect(result).toContain('Usage:')
    expect(result).toContain('--verbose')
    expect(result).toContain('--json')
  })

  it('should run doctor command', () => {
    const result = execSync(`node ${cliPath} doctor`, { 
      encoding: 'utf8',
      stdio: 'pipe'
    })
    
    expect(result).toContain('Environment Validation')
    expect(result).toContain('Node.js Version')
    expect(result).toContain('✅') // Should pass Node.js check
  })

  it('should reject invalid plugin names', () => {
    expect(() => {
      execSync(`node ${cliPath} create-plugin Invalid-Name --skip-prompts`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      })
    }).toThrow()
  })

  it('should require plugin file for signing', () => {
    expect(() => {
      execSync(`node ${cliPath} sign-plugin`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      })
    }).toThrow()
  })

  it('should handle unknown commands', () => {
    expect(() => {
      execSync(`node ${cliPath} unknown-command`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      })
    }).toThrow()
  })
})