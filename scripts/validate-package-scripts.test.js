/**
 * Test to validate all packages have required npm scripts
 * This test enforces enterprise-grade standards across the monorepo
 */

const fs = require('fs');
const path = require('path');

describe('Package Scripts Validation', () => {
  const packagesDir = path.join(__dirname, '..', 'packages');
  const requiredScripts = ['build', 'test', 'clean', 'lint', 'typecheck'];
  
  // Get all package directories
  const packageDirs = fs.readdirSync(packagesDir).filter(dir => {
    const packageJsonPath = path.join(packagesDir, dir, 'package.json');
    return fs.existsSync(packageJsonPath);
  });

  test('all packages should exist', () => {
    expect(packageDirs.length).toBeGreaterThan(0);
    console.log(`Found ${packageDirs.length} packages: ${packageDirs.join(', ')}`);
  });

  packageDirs.forEach(packageDir => {
    describe(`Package: ${packageDir}`, () => {
      let packageJson;
      
      beforeAll(() => {
        const packageJsonPath = path.join(packagesDir, packageDir, 'package.json');
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      });

      test('should have package.json', () => {
        expect(packageJson).toBeDefined();
        expect(packageJson.name).toBeDefined();
        expect(packageJson.version).toBeDefined();
      });

      requiredScripts.forEach(script => {
        test(`should have '${script}' script`, () => {
          expect(packageJson.scripts).toBeDefined();
          expect(packageJson.scripts[script]).toBeDefined();
          expect(typeof packageJson.scripts[script]).toBe('string');
          expect(packageJson.scripts[script].length).toBeGreaterThan(0);
        });
      });

      test('should have consistent script patterns', () => {
        const scripts = packageJson.scripts;
        
        // lint and typecheck should use TypeScript compiler
        if (scripts.lint) {
          expect(scripts.lint).toMatch(/tsc\s+--noEmit/);
        }
        if (scripts.typecheck) {
          expect(scripts.typecheck).toMatch(/tsc\s+--noEmit/);
        }
        
        // test should use vitest
        if (scripts.test) {
          expect(scripts.test).toMatch(/vitest/);
        }
        
        // build should use tsup or tsc
        if (scripts.build) {
          expect(scripts.build).toMatch(/(tsup|tsc)/);
        }
      });
    });
  });
});