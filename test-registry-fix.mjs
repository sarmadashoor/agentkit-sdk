import { AgentRegistry } from './packages/registry/dist/index.mjs';
import { DummyTransport } from './packages/transports-dummy/dist/index.mjs';

console.log('Creating registry and transport...');
const registry = new AgentRegistry();
const transport = new DummyTransport({ debug: true });

console.log('Transport before registration:', {
  hasInit: 'init' in transport,
  initType: typeof transport.init,
  proto: Object.getPrototypeOf(transport)?.constructor?.name
});

console.log('\nRegistering transport...');
registry.registerTransport(transport);

console.log('\nLooking up transport...');
const retrieved = registry.lookupTransport('dummy');

console.log('Retrieved transport:', {
  hasInit: 'init' in retrieved,
  initType: typeof retrieved.init,
  proto: Object.getPrototypeOf(retrieved)?.constructor?.name,
  frozen: Object.isFrozen(retrieved)
});