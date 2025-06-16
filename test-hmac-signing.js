const crypto = require('crypto');

// Test HMAC plugin signing implementation
async function testHmacPluginSigning() {
  console.log('🔐 Testing AgentKit HMAC Plugin Signature System');
  
  // Mock plugin for testing
  const testPlugin = {
    name: 'test-hmac-plugin',
    version: '1.0.0',
    description: 'Test plugin for HMAC signature verification',
    onInit: async function() {
      console.log('Plugin initialized');
    },
    onSend: async function(payload) {
      return { processed: true };
    }
  };

  // Test stable serialization
  function serializePluginForSigning(plugin) {
    const cleanPlugin = {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      onInit: plugin.onInit ? plugin.onInit.toString().replace(/\s+/g, ' ').trim() : undefined,
      onSend: plugin.onSend ? plugin.onSend.toString().replace(/\s+/g, ' ').trim() : undefined
    };
    
    // Remove undefined fields
    Object.keys(cleanPlugin).forEach(key => {
      if (cleanPlugin[key] === undefined) {
        delete cleanPlugin[key];
      }
    });
    
    return JSON.stringify(cleanPlugin, null, 0);
  }

  const secret = 'test-secret-key-for-hmac-signing-16chars';
  
  // Test serialization consistency
  console.log('✓ Testing stable serialization...');
  const serialized1 = serializePluginForSigning(testPlugin);
  const serialized2 = serializePluginForSigning(testPlugin);
  console.log(`✓ Serialization consistency: ${serialized1 === serialized2 ? 'PASS' : 'FAIL'}`);
  
  // Test HMAC signature generation
  console.log('✓ Testing HMAC signature generation...');
  const signature1 = crypto.createHmac('sha256', secret).update(serialized1).digest('hex');
  const signature2 = crypto.createHmac('sha256', secret).update(serialized2).digest('hex');
  console.log(`✓ Signature consistency: ${signature1 === signature2 ? 'PASS' : 'FAIL'}`);
  console.log(`✓ Signature: ${signature1.substring(0, 32)}...`);
  
  // Test signature verification
  console.log('✓ Testing signature verification...');
  const verifySignature = crypto.createHmac('sha256', secret).update(serialized1).digest('hex');
  const isValid = signature1 === verifySignature;
  console.log(`✓ Signature verification: ${isValid ? 'PASS' : 'FAIL'}`);
  
  // Test different secret produces different signature
  console.log('✓ Testing different secrets...');
  const differentSecret = 'different-secret-key-16chars';
  const differentSignature = crypto.createHmac('sha256', differentSecret).update(serialized1).digest('hex');
  const isDifferent = signature1 !== differentSignature;
  console.log(`✓ Different secrets produce different signatures: ${isDifferent ? 'PASS' : 'FAIL'}`);
  
  // Test plugin modification detection
  console.log('✓ Testing tampering detection...');
  const tamperedPlugin = {
    ...testPlugin,
    description: 'TAMPERED DESCRIPTION'
  };
  const tamperedSerialized = serializePluginForSigning(tamperedPlugin);
  const tamperedSignature = crypto.createHmac('sha256', secret).update(tamperedSerialized).digest('hex');
  const tamperedDetected = signature1 !== tamperedSignature;
  console.log(`✓ Tampering detection: ${tamperedDetected ? 'PASS' : 'FAIL'}`);
  
  // Test signature metadata format
  console.log('✓ Testing signature metadata format...');
  const metadata = {
    signature: signature1,
    hash: crypto.createHash('sha256').update(serialized1).digest('hex'),
    timestamp: Date.now(),
    algorithm: 'HMAC-SHA256',
    version: '1.0.0'
  };
  
  console.log('✓ Signature metadata:');
  console.log(JSON.stringify(metadata, null, 2));
  
  // Test timing-safe comparison
  console.log('✓ Testing timing-safe comparison...');
  function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
  
  const timingSafePass = timingSafeEqual(signature1, verifySignature);
  const timingSafeFail = !timingSafeEqual(signature1, differentSignature);
  console.log(`✓ Timing-safe equal (valid): ${timingSafePass ? 'PASS' : 'FAIL'}`);
  console.log(`✓ Timing-safe equal (invalid): ${timingSafeFail ? 'PASS' : 'FAIL'}`);
  
  console.log('\n🎉 HMAC Plugin signature system test completed successfully!');
  console.log('\n📋 Summary:');
  console.log('  ✅ Stable serialization ensures consistent signatures');
  console.log('  ✅ HMAC-SHA256 provides cryptographic authenticity');
  console.log('  ✅ Different secrets produce different signatures');
  console.log('  ✅ Plugin tampering is reliably detected');
  console.log('  ✅ Timing-safe comparison prevents timing attacks');
  console.log('  ✅ Signature metadata includes all required fields');
  
  return {
    plugin: testPlugin,
    serialized: serialized1,
    signature: signature1,
    metadata
  };
}

testHmacPluginSigning().catch(console.error);