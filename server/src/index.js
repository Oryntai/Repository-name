require('dotenv').config()

const http = require('http')
const WebSocket = require('ws')
const { setupWSConnection, getYDoc } = require('y-websocket/bin/utils')
const { AgentOrchestrator } = require('./agent/AgentOrchestrator')

const HOST = process.env.HOST || '0.0.0.0'
const PORT = parseInt(process.env.PORT || '1234', 10)

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'ok' }))
})

const wss = new WebSocket.Server({ server })

wss.on('connection', (ws, req) => {
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
