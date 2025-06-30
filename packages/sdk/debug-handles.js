#!/usr/bin/env node

/**
 * Handle Detective - Comprehensive Node.js handle analysis tool
 * This script will help us identify exactly what handles are preventing process exit
 */

const util = require('util');

function getHandleDetails(handle) {
  const details = {
    type: handle.constructor.name,
    readable: handle.readable,
    writable: handle.writable,
    destroyed: handle.destroyed,
    closed: handle.closed,
    connecting: handle.connecting,
    pending: handle.pending,
    ref: handle._handle ? handle._handle.hasRef() : 'unknown'
  };

  // Add specific details based on handle type
  if (handle.constructor.name === 'Socket') {
    details.localAddress = handle.localAddress;
    details.localPort = handle.localPort;
    details.remoteAddress = handle.remoteAddress;
    details.remotePort = handle.remotePort;
    details.readyState = handle.readyState;
  }

  if (handle.constructor.name === 'Server') {
    details.listening = handle.listening;
    details.address = handle.address ? handle.address() : null;
  }

  if (handle.constructor.name === 'Timeout') {
    details.hasRef = handle.hasRef ? handle.hasRef() : 'unknown';
    details.ms = handle._idleTimeout;
  }

  if (handle.constructor.name === 'Pipe') {
    details.fd = handle.fd;
    details.readable = handle.readable;
    details.writable = handle.writable;
  }

  if (handle.constructor.name === 'MessagePort') {
    details.started = handle.start ? true : false;
  }

  return details;
}

function analyzeHandles() {
  console.log('\n🔍 COMPREHENSIVE HANDLE ANALYSIS\n');
  
  const handles = process._getActiveHandles();
  const resources = process._getActiveRequests();
  
  console.log(`📊 Summary: ${handles.length} active handles, ${resources.length} active requests\n`);
  
  // Group handles by type
  const handlesByType = {};
  handles.forEach((handle, index) => {
    const type = handle.constructor.name;
    if (!handlesByType[type]) {
      handlesByType[type] = [];
    }
    handlesByType[type].push({ index, handle, details: getHandleDetails(handle) });
  });

  // Analyze each type
  Object.entries(handlesByType).forEach(([type, handleList]) => {
    console.log(`\n🔎 ${type} handles (${handleList.length}):`);
    console.log('═'.repeat(50));
    
    handleList.forEach(({ index, handle, details }) => {
      console.log(`\n  Handle #${index}:`);
      console.log(`    Details:`, JSON.stringify(details, null, 6));
      
      // Try to identify potential cleanup methods
      const cleanupMethods = [];
      if (typeof handle.close === 'function') cleanupMethods.push('close()');
      if (typeof handle.destroy === 'function') cleanupMethods.push('destroy()');
      if (typeof handle.end === 'function') cleanupMethods.push('end()');
      if (typeof handle.terminate === 'function') cleanupMethods.push('terminate()');
      if (typeof handle.unref === 'function') cleanupMethods.push('unref()');
      if (typeof handle.cancel === 'function') cleanupMethods.push('cancel()');
      
      if (cleanupMethods.length > 0) {
        console.log(`    Available cleanup methods: ${cleanupMethods.join(', ')}`);
      }
      
      // Check if handle is keeping process alive
      const isReferenced = handle._handle ? handle._handle.hasRef() : 'unknown';
      console.log(`    Keeping process alive: ${isReferenced}`);
    });
  });

  // Analyze active requests
  if (resources.length > 0) {
    console.log(`\n\n🔄 ACTIVE REQUESTS (${resources.length}):`);
    console.log('═'.repeat(50));
    resources.forEach((req, index) => {
      console.log(`\n  Request #${index}:`);
      console.log(`    Type: ${req.constructor.name}`);
      console.log(`    Details:`, util.inspect(req, { depth: 2, colors: false }));
    });
  }

  return { handles, resources, handlesByType };
}

function suggestCleanup(handlesByType) {
  console.log(`\n\n💡 CLEANUP SUGGESTIONS:`);
  console.log('═'.repeat(50));
  
  Object.entries(handlesByType).forEach(([type, handleList]) => {
    if (handleList.length === 0) return;
    
    console.log(`\n${type}:`);
    switch (type) {
      case 'MessagePort':
        console.log(`  - Call port.close() on all ${handleList.length} MessagePort instances`);
        console.log(`  - Often created by Worker threads - ensure workers are terminated`);
        break;
      case 'Socket':
        console.log(`  - Call socket.destroy() or socket.end() on ${handleList.length} sockets`);
        console.log(`  - Check for HTTP/HTTPS clients or servers not properly closed`);
        break;
      case 'Server':
        console.log(`  - Call server.close() on ${handleList.length} servers`);
        console.log(`  - Ensure HTTP/HTTPS/TCP servers are shutdown`);
        break;
      case 'Timeout':
        console.log(`  - Call clearTimeout() or .unref() on ${handleList.length} timeouts`);
        console.log(`  - Use .unref() for timeouts that shouldn't keep process alive`);
        break;
      case 'Pipe':
        console.log(`  - Call pipe.close() or pipe.destroy() on ${handleList.length} pipes`);
        console.log(`  - Often related to child processes or IPC`);
        break;
      case 'Worker':
        console.log(`  - Call worker.terminate() on ${handleList.length} workers`);
        console.log(`  - Ensure Worker threads are properly cleaned up`);
        break;
      default:
        console.log(`  - Check cleanup methods for ${handleList.length} ${type} handles`);
    }
  });
}

// Export for use in other scripts
module.exports = { analyzeHandles, getHandleDetails, suggestCleanup };

// Run analysis if called directly
if (require.main === module) {
  const { handlesByType } = analyzeHandles();
  suggestCleanup(handlesByType);
}