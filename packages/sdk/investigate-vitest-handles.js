#!/usr/bin/env node

/**
 * Investigate Vitest handle creation patterns
 * This will help us understand if Vitest itself is creating handles that don't get cleaned up
 */

const { analyzeHandles } = require('./debug-handles.js');

console.log('🔍 Analyzing baseline handles before any tests...\n');

// Capture baseline handles
const { handlesByType: baseline } = analyzeHandles();

console.log('\n🧪 Testing with minimal Vitest setup...\n');

// Now import and run vitest programmatically to see what handles it creates
const { createVitest } = require('vitest/node');

async function runMinimalTest() {
  try {
    console.log('📝 Creating Vitest instance...');
    
    const vitest = await createVitest('test', {
      config: {
        test: {
          include: ['__tests__/init.test.ts'],
          reporter: 'basic',
          run: true,
          threads: false,
          pool: 'forks',
          poolOptions: {
            forks: {
              singleFork: true
            }
          }
        }
      }
    });
    
    console.log('🎯 Running single test...');
    
    // Run the test
    await vitest.start();
    
    console.log('\n🔍 Analyzing handles after Vitest run...');
    const { handlesByType: afterTest } = analyzeHandles();
    
    // Compare with baseline
    console.log('\n📊 HANDLE COMPARISON:');
    console.log('═'.repeat(50));
    
    Object.keys(afterTest).forEach(type => {
      const baselineCount = baseline[type] ? baseline[type].length : 0;
      const afterCount = afterTest[type].length;
      const diff = afterCount - baselineCount;
      
      if (diff > 0) {
        console.log(`${type}: ${baselineCount} → ${afterCount} (+${diff}) 🔴`);
      } else if (diff < 0) {
        console.log(`${type}: ${baselineCount} → ${afterCount} (${diff}) 🟢`);
      } else {
        console.log(`${type}: ${baselineCount} → ${afterCount} (no change) ⚪`);
      }
    });
    
    // Look for new handle types
    Object.keys(afterTest).forEach(type => {
      if (!baseline[type]) {
        console.log(`${type}: NEW handle type created by test! 🆕`);
      }
    });
    
    console.log('\n🧹 Attempting Vitest cleanup...');
    await vitest.close();
    
    console.log('\n🔍 Analyzing handles after Vitest close...');
    const { handlesByType: afterClose } = analyzeHandles();
    
    // Check if cleanup worked
    console.log('\n📊 AFTER CLEANUP:');
    console.log('═'.repeat(50));
    
    Object.keys(afterClose).forEach(type => {
      const beforeCleanup = afterTest[type] ? afterTest[type].length : 0;
      const afterCleanup = afterClose[type].length;
      const cleaned = beforeCleanup - afterCleanup;
      
      if (cleaned > 0) {
        console.log(`${type}: ${beforeCleanup} → ${afterCleanup} (-${cleaned} cleaned) 🟢`);
      } else if (cleaned < 0) {
        console.log(`${type}: ${beforeCleanup} → ${afterCleanup} (+${Math.abs(cleaned)} added) 🔴`);
      } else if (afterCleanup > 0) {
        console.log(`${type}: ${beforeCleanup} → ${afterCleanup} (not cleaned) 🔴`);
      }
    });
    
    // Check what's still hanging around
    const totalHandlesRemaining = Object.values(afterClose).reduce((sum, handles) => sum + handles.length, 0);
    
    if (totalHandlesRemaining > 0) {
      console.log(`\n❌ ${totalHandlesRemaining} handles still active after cleanup`);
      
      // Show detailed info about remaining handles
      Object.entries(afterClose).forEach(([type, handles]) => {
        if (handles.length > 0) {
          console.log(`\n🔍 Remaining ${type} handles:`);
          handles.forEach((handle, idx) => {
            console.log(`  #${idx}: ref=${handle.details.ref}, cleanup methods available:`, 
              Object.keys(handle.handle).filter(key => 
                ['close', 'destroy', 'end', 'terminate', 'unref', 'cancel'].includes(key) &&
                typeof handle.handle[key] === 'function'
              )
            );
          });
        }
      });
    } else {
      console.log('\n✅ All handles cleaned up successfully!');
    }
    
  } catch (error) {
    console.error('❌ Error during investigation:', error);
  }
}

runMinimalTest().catch(console.error);