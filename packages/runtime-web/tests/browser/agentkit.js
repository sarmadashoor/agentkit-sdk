// Simple AgentKit browser bundle for testing
// This would normally be built with webpack/rollup, but for testing we'll use a simple version

(function(global) {
    'use strict';

    // Mock AgentKit errors for browser testing
    class AgentKitError extends Error {
        constructor(message, options = {}) {
            super(message);
            this.name = this.constructor.name;
            this.code = options.code || 'UNKNOWN_ERROR';
            this.category = options.category || 'unknown';
            this.context = options.context || {};
            if (options.cause) {
                this.cause = options.cause;
            }
        }
    }

    class TransportSendError extends AgentKitError {
        constructor(message, options = {}) {
            super(message, { ...options, code: 'TRANSPORT_SEND_FAILED', category: 'transport' });
        }
    }

    class TransportReceiveError extends AgentKitError {
        constructor(message, options = {}) {
            super(message, { ...options, code: 'TRANSPORT_RECEIVE_FAILED', category: 'transport' });
        }
    }

    class InvalidConfigurationError extends AgentKitError {
        constructor(message, options = {}) {
            super(message, { ...options, code: 'INVALID_CONFIGURATION', category: 'config' });
        }
    }

    class NetworkError extends AgentKitError {
        constructor(message, options = {}) {
            super(message, { ...options, code: 'NETWORK_ERROR', category: 'network' });
        }
    }

    class RequestTimeoutError extends AgentKitError {
        constructor(timeoutMs, options = {}) {
            super(`Request timed out after ${timeoutMs}ms`, { ...options, code: 'REQUEST_TIMEOUT', category: 'network' });
        }
    }

    class HttpError extends AgentKitError {
        constructor(status, statusText, responseText, options = {}) {
            super(`HTTP ${status}: ${statusText}${responseText ? ' - ' + responseText : ''}`, 
                  { ...options, code: 'HTTP_ERROR', category: 'network' });
            this.status = status;
            this.statusText = statusText;
            this.responseText = responseText;
        }

        isClientError() {
            return this.status >= 400 && this.status < 500;
        }
    }

    class CorsError extends AgentKitError {
        constructor(message, options = {}) {
            super(`Network/CORS error: ${message}`, { ...options, code: 'CORS_ERROR', category: 'network' });
        }
    }

    class SerializationError extends AgentKitError {
        constructor(operation, dataType, options = {}) {
            super(`Failed to ${operation} ${dataType}`, { ...options, code: 'SERIALIZATION_FAILED', category: 'client' });
        }
    }

    // BrowserTransport implementation
    class BrowserTransport {
        constructor(config) {
            this.id = 'browser';
            this.name = 'Browser Transport';
            
            // Validate required config
            if (!config.endpoint) {
                throw new InvalidConfigurationError('Endpoint is required', {
                    context: { configKey: 'endpoint' }
                });
            }

            // Validate endpoint URL format
            try {
                const url = new URL(config.endpoint);
                if (!['http:', 'https:'].includes(url.protocol)) {
                    throw new InvalidConfigurationError('Invalid protocol - must be http or https', {
                        context: { endpoint: config.endpoint, protocol: url.protocol }
                    });
                }
            } catch (error) {
                throw new InvalidConfigurationError('Invalid endpoint URL format', {
                    cause: error,
                    context: { endpoint: config.endpoint }
                });
            }

            // Set config with defaults
            this.config = {
                endpoint: config.endpoint,
                timeout: config.timeout ?? 10000,
                maxRetries: config.maxRetries ?? 3,
                retryDelay: config.retryDelay ?? 1000,
                headers: config.headers ?? {}
            };

            this.isShutdown = false;
            this.activeRequests = new Set();
        }

        async init(config) {
            // Browser transport doesn't need initialization
        }

        async send(message) {
            if (this.isShutdown) {
                throw new TransportSendError('Transport has been shutdown', {
                    context: { transportId: this.id }
                });
            }

            try {
                await this.makeRequest('POST', message);
            } catch (error) {
                // Re-throw domain-specific errors directly, wrap others
                if (error instanceof HttpError || 
                    error instanceof NetworkError || 
                    error instanceof RequestTimeoutError || 
                    error instanceof CorsError ||
                    error instanceof SerializationError) {
                    throw error;
                }
                
                throw new TransportSendError('Failed to send message', {
                    cause: error,
                    context: { transportId: this.id, messageType: typeof message }
                });
            }
        }

        async receive() {
            if (this.isShutdown) {
                throw new TransportReceiveError('Transport has been shutdown', {
                    context: { transportId: this.id }
                });
            }

            try {
                return this.makeRequest('GET');
            } catch (error) {
                throw new TransportReceiveError('Failed to receive message', {
                    cause: error,
                    context: { transportId: this.id }
                });
            }
        }

        async shutdown() {
            if (this.isShutdown) {
                return; // Already shutdown, idempotent
            }

            this.isShutdown = true;

            // Abort all active requests
            for (const controller of this.activeRequests) {
                try {
                    controller.abort();
                } catch {
                    // Ignore errors during abort
                }
            }
            this.activeRequests.clear();
        }

        async makeRequest(method, body) {
            // Check if fetch is available
            if (typeof fetch === 'undefined') {
                throw new NetworkError('fetch is not available - browser environment required', {
                    context: { environment: 'non-browser' }
                });
            }

            let lastError = null;
            let attempt = 0;
            const maxAttempts = this.config.maxRetries + 1;

            while (attempt < maxAttempts) {
                try {
                    const result = await this.executeRequest(method, body);
                    return result;
                } catch (error) {
                    lastError = error;
                    attempt++;

                    // Don't retry on client errors (4xx) or when shutdown, or if we've reached max attempts
                    if (this.isShutdown || this.isClientError(error) || attempt >= maxAttempts) {
                        throw lastError;
                    }

                    // Exponential backoff: retryDelay * 2^(attempt-1)
                    const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
                    await this.sleep(delay);
                }
            }

            throw lastError || new NetworkError('Unknown error occurred during request');
        }

        async executeRequest(method, body) {
            let abortController;

            // Create AbortController if available
            if (typeof AbortController !== 'undefined') {
                abortController = new AbortController();
                this.activeRequests.add(abortController);

                // Set timeout
                setTimeout(() => {
                    if (abortController && !abortController.signal.aborted) {
                        abortController.abort();
                    }
                }, this.config.timeout);
            }

            try {
                const headers = {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    ...this.config.headers
                };

                const fetchOptions = {
                    method,
                    headers,
                    signal: abortController?.signal
                };

                if (body !== undefined && method !== 'GET') {
                    fetchOptions.body = JSON.stringify(body);
                }

                const response = await fetch(this.config.endpoint, fetchOptions);

                // Handle HTTP errors
                if (!response.ok) {
                    let errorText = '';
                    try {
                        errorText = await response.text();
                    } catch {
                        // Ignore errors reading response body
                    }
                    
                    throw new HttpError(response.status, response.statusText, errorText);
                }

                // Parse JSON response for GET requests
                if (method === 'GET') {
                    try {
                        return await response.json();
                    } catch (error) {
                        const message = `Failed to parse response JSON: ${error.message}`;
                        const parseError = new Error(message);
                        parseError.name = 'SerializationError';
                        throw parseError;
                    }
                }

                // For POST requests (send), we don't need to return data
                return undefined;
            } catch (error) {
                // Handle specific error types
                if (error instanceof Error) {
                    if (error.name === 'AbortError') {
                        throw new RequestTimeoutError(this.config.timeout, {
                            context: { endpoint: this.config.endpoint }
                        });
                    }
                    
                    // Handle network/CORS errors
                    if (error.message.includes('Failed to fetch')) {
                        throw new NetworkError(`Network error - this may be a CORS issue: ${error.message}`, {
                            cause: error,
                            context: { endpoint: this.config.endpoint }
                        });
                    }
                    
                    // Handle generic network errors
                    if (error.message.includes('Network error')) {
                        throw new NetworkError(error.message, {
                            cause: error,
                            context: { endpoint: this.config.endpoint }
                        });
                    }
                }
                
                throw error;
            } finally {
                // Clean up abort controller
                if (abortController) {
                    this.activeRequests.delete(abortController);
                }
            }
        }

        isClientError(error) {
            // Check if error is a 4xx client error (don't retry these)
            if (error instanceof HttpError) {
                return error.isClientError();
            }
            return error.message.includes('HTTP 4');
        }

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    // Test functions for browser testing
    async function testTransportLifecycle() {
        try {
            window.testFunctions.log('Starting transport lifecycle test...');
            
            const transport = new BrowserTransport({
                endpoint: '/api/test',
                timeout: 5000,
                maxRetries: 1
            });

            // Test initialization
            await transport.init();
            window.testFunctions.addResult('lifecycle-results', '✓ Transport initialization successful');

            // Test send
            await transport.send({ test: 'lifecycle', timestamp: Date.now() });
            window.testFunctions.addResult('lifecycle-results', '✓ Transport send successful');

            // Test receive
            const response = await transport.receive();
            window.testFunctions.addResult('lifecycle-results', '✓ Transport receive successful: ' + JSON.stringify(response).substring(0, 100));

            // Test shutdown
            await transport.shutdown();
            window.testFunctions.addResult('lifecycle-results', '✓ Transport shutdown successful');

            // Test post-shutdown behavior
            try {
                await transport.send({ test: 'should-fail' });
                window.testFunctions.addResult('lifecycle-results', '✗ Post-shutdown send should have failed', false);
            } catch (error) {
                window.testFunctions.addResult('lifecycle-results', '✓ Post-shutdown send correctly rejected');
            }

        } catch (error) {
            window.testFunctions.addResult('lifecycle-results', '✗ Transport lifecycle test failed: ' + error.message, false);
        }
    }

    async function testErrorRecovery() {
        try {
            window.testFunctions.log('Starting error recovery test...');
            
            const transport = new BrowserTransport({
                endpoint: '/api/error',
                timeout: 5000,
                maxRetries: 2,
                retryDelay: 100
            });

            // Test error handling
            try {
                await transport.send({ test: 'error' });
                window.testFunctions.addResult('error-results', '✗ Error endpoint should have failed', false);
            } catch (error) {
                if (error.message.includes('HTTP 500')) {
                    window.testFunctions.addResult('error-results', '✓ Server error correctly handled');
                } else {
                    window.testFunctions.addResult('error-results', '✗ Unexpected error type: ' + error.message, false);
                }
            }

            await transport.shutdown();

        } catch (error) {
            window.testFunctions.addResult('error-results', '✗ Error recovery test failed: ' + error.message, false);
        }
    }

    async function testTimeoutBehavior() {
        try {
            window.testFunctions.log('Starting timeout behavior test...');
            
            const transport = new BrowserTransport({
                endpoint: '/api/slow',
                timeout: 1000, // 1 second timeout
                maxRetries: 0
            });

            const startTime = Date.now();
            try {
                await transport.send({ test: 'timeout' });
                window.testFunctions.addResult('timeout-results', '✗ Slow endpoint should have timed out', false);
            } catch (error) {
                const elapsed = Date.now() - startTime;
                if (error.message.includes('timeout') || error.message.includes('abort')) {
                    window.testFunctions.addResult('timeout-results', `✓ Request correctly timed out after ${elapsed}ms`);
                } else {
                    window.testFunctions.addResult('timeout-results', '✗ Unexpected timeout error: ' + error.message, false);
                }
            }

            await transport.shutdown();

        } catch (error) {
            window.testFunctions.addResult('timeout-results', '✗ Timeout test failed: ' + error.message, false);
        }
    }

    async function testLargePayloads() {
        try {
            window.testFunctions.log('Starting large payload test...');
            
            const transport = new BrowserTransport({
                endpoint: '/api/large',
                timeout: 10000,
                maxRetries: 0
            });

            // Create a large payload
            const largePayload = {
                data: 'x'.repeat(100000), // 100KB
                arrays: Array(1000).fill().map((_, i) => ({ id: i, value: `item-${i}` })),
                timestamp: Date.now()
            };

            // Test sending large payload
            await transport.send(largePayload);
            window.testFunctions.addResult('payload-results', '✓ Large payload send successful');

            // Test receiving large payload
            const response = await transport.receive();
            if (response && response.data && response.data.length > 50000) {
                window.testFunctions.addResult('payload-results', `✓ Large payload receive successful (${response.data.length} chars)`);
            } else {
                window.testFunctions.addResult('payload-results', '✗ Large payload receive failed or too small', false);
            }

            await transport.shutdown();

        } catch (error) {
            window.testFunctions.addResult('payload-results', '✗ Large payload test failed: ' + error.message, false);
        }
    }

    async function testHookInvocation() {
        try {
            window.testFunctions.log('Starting hook invocation test...');
            
            // Create a transport with hooks (simulated via event listeners)
            const transport = new BrowserTransport({
                endpoint: '/api/test',
                timeout: 5000
            });

            let hooksCalled = [];

            // Simulate hooks by wrapping transport methods
            const originalSend = transport.send.bind(transport);
            transport.send = async function(...args) {
                hooksCalled.push('onSend');
                return originalSend(...args);
            };

            const originalShutdown = transport.shutdown.bind(transport);
            transport.shutdown = async function(...args) {
                hooksCalled.push('onShutdown');
                return originalShutdown(...args);
            };

            // Test hook invocation
            await transport.init();
            hooksCalled.push('onInit');

            await transport.send({ test: 'hooks' });
            await transport.shutdown();

            const expectedHooks = ['onInit', 'onSend', 'onShutdown'];
            const allHooksCalled = expectedHooks.every(hook => hooksCalled.includes(hook));

            if (allHooksCalled) {
                window.testFunctions.addResult('hook-results', `✓ All hooks called: ${hooksCalled.join(', ')}`);
            } else {
                window.testFunctions.addResult('hook-results', `✗ Missing hooks. Called: ${hooksCalled.join(', ')}`, false);
            }

        } catch (error) {
            window.testFunctions.addResult('hook-results', '✗ Hook invocation test failed: ' + error.message, false);
        }
    }

    // Export to global scope
    global.AgentKit = window.AgentKit = {
        BrowserTransport,
        errors: {
            AgentKitError,
            TransportSendError,
            TransportReceiveError,
            InvalidConfigurationError,
            NetworkError,
            RequestTimeoutError,
            HttpError,
            CorsError,
            SerializationError
        }
    };

    // Export test functions
    global.testTransportLifecycle = testTransportLifecycle;
    global.testErrorRecovery = testErrorRecovery;
    global.testTimeoutBehavior = testTimeoutBehavior;
    global.testLargePayloads = testLargePayloads;
    global.testHookInvocation = testHookInvocation;

    window.testFunctions.log('AgentKit browser bundle loaded successfully');

})(window);