require('dotenv').config()

const http = require('http')
const path = require('path')
const fs = require('fs')
const WebSocket = require('ws')
const { setupWSConnection, getYDoc } = require('y-websocket/bin/utils')
const { AgentOrchestrator } = require('./agent/AgentOrchestrator')

const HOST = process.env.HOST || '0.0.0.0'
const PORT = parseInt(process.env.PORT || '1234', 10)

const STATIC_DIR = path.join(__dirname, '../../frontend/dist')

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
}

const server = http.createServer((req, res) => {
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ status: 'ok' }))
  }

  // Serve static frontend files
  let filePath = path.join(STATIC_DIR, req.url === '/' ? 'index.html' : req.url)
  const ext = path.extname(filePath)

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': contentType })
    fs.createReadStream(filePath).pipe(res)
  } else {
    // SPA fallback — serve index.html for all unmatched routes
    const indexPath = path.join(STATIC_DIR, 'index.html')
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      fs.createReadStream(indexPath).pipe(res)
    } else {
      res.writeHead(404)
      res.end('Not found')
    }
  }
})

const wss = new WebSocket.Server({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  if (req.url && req.url.startsWith('/ws')) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  } else {
    socket.destroy()
  }
})

wss.on('connection', (ws, req) => {
  // Strip /ws prefix if present (frontend connects via /ws path)
  if (req.url && req.url.startsWith('/ws')) {
    req.url = req.url.replace(/^\/ws/, '') || '/'
  }
  setupWSConnection(ws, req, { gc: true })
  console.log(`[ws] client connected — room: ${req.url}`)
})

server.listen(PORT, HOST, () => {
  console.log(`y-websocket server running on ws://${HOST}:${PORT}`)

  // Bootstrap AI agent for the default room
  const doc = getYDoc('main')
  const agent = new AgentOrchestrator(doc)
  console.log('[agent] AI Agent initialized for room: main')
})
