const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = 3000

// Simple test server for browser tests
const server = http.createServer((req, res) => {
  // Enable CORS for all requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)
  
  // Serve static test files
  if (url.pathname === '/' || url.pathname === '/index.html') {
    serveFile(res, path.join(__dirname, 'browser', 'index.html'), 'text/html')
    return
  }

  // Serve AgentKit bundle
  if (url.pathname === '/agentkit.js') {
    serveFile(res, path.join(__dirname, 'browser', 'agentkit.js'), 'application/javascript')
    return
  }

  // Mock API endpoints for testing
  if (url.pathname === '/api/test') {
    handleApiRequest(req, res)
    return
  }

  if (url.pathname === '/api/slow') {
    // Simulate slow response for timeout testing
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'slow response' }))
    }, 2000)
    return
  }

  if (url.pathname === '/api/error') {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Server error' }))
    return
  }

  if (url.pathname === '/api/large') {
    // Test large payload handling
    const payload = {
      data: 'x'.repeat(1024 * 1024), // 1MB payload
      timestamp: Date.now()
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(payload))
    return
  }

  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not Found')
})

function serveFile(res, filePath, contentType) {
  try {
    const content = fs.readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': contentType })
    res.end(content)
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('File not found')
  }
}

function handleApiRequest(req, res) {
  let body = ''
  
  req.on('data', chunk => {
    body += chunk.toString()
  })
  
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}')
      
      // Echo back the request with some metadata
      const response = {
        received: data,
        method: req.method,
        headers: req.headers,
        timestamp: Date.now(),
        url: req.url
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(response))
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON' }))
    }
  })
}

server.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`)
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down test server...')
  server.close()
  process.exit(0)
})