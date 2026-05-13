import * as http from 'http'
import * as crypto from 'crypto'
import { EventEmitter } from 'events'
import { logger } from '../logger'
import type { WatchEvent, WatchStatus } from '../datasource/DataSource'

function generateWebSocketKey(): string {
  return crypto.randomBytes(16).toString('base64')
}

function computeAcceptKey(key: string): string {
  return crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64')
}

class WebSocketConnection extends EventEmitter {
  private socket: import('net').Socket | null = null
  private buffer = Buffer.alloc(0)

  connect(url: string): void {
    const parsed = new URL(url)
    const isSecure = parsed.protocol === 'wss:'
    const mod = isSecure ? require('tls') as typeof import('tls') : require('net') as typeof import('net')
    const port = parsed.port ? parseInt(parsed.port, 10) : (isSecure ? 443 : 80)
    const hostname = parsed.hostname

    const key = generateWebSocketKey()

    const request = [
      `GET ${parsed.pathname}${parsed.search || ''} HTTP/1.1`,
      `Host: ${hostname}:${port}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Version: 13',
      '',
      '',
    ].join('\r\n')

    const socket = mod.connect(port, hostname, () => {
      socket.write(request)
    })

    let headers = ''
    socket.on('data', (data: Buffer) => {
      if (!this.socket) {
        headers += data.toString()
        const headerEnd = headers.indexOf('\r\n\r\n')
        if (headerEnd === -1) return

        const headerPart = headers.substring(0, headerEnd)
        const statusLine = headerPart.split('\r\n')[0]
        if (!statusLine?.includes('101')) {
          this.emit('error', new Error(`WebSocket upgrade failed: ${statusLine}`))
          socket.destroy()
          return
        }

        const acceptKey = computeAcceptKey(key)
        const serverAccept = headerPart.match(/Sec-WebSocket-Accept:\s*(.+)/i)?.[1]?.trim()
        if (serverAccept !== acceptKey) {
          this.emit('error', new Error('WebSocket accept key mismatch'))
          socket.destroy()
          return
        }

        this.socket = socket
        this.emit('open')

        const remaining = data.subarray(headerEnd + 4)
        if (remaining.length > 0) {
          this.buffer = Buffer.concat([this.buffer, remaining])
          this.processFrames()
        }
      } else {
        this.buffer = Buffer.concat([this.buffer, data])
        this.processFrames()
      }
    })

    socket.on('error', (err: Error) => {
      logger.warn('WatchService', 'WebSocket error', { error: err.message })
      this.emit('error', err)
    })

    socket.on('close', () => {
      this.socket = null
      this.emit('close')
    })
  }

  private processFrames(): void {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0]
      const secondByte = this.buffer[1]
      const opcode = firstByte & 0x0f
      const masked = (secondByte & 0x80) !== 0
      let payloadLen = secondByte & 0x7f
      let offset = 2

      if (payloadLen === 126) {
        if (this.buffer.length < 4) return
        payloadLen = this.buffer.readUInt16BE(2)
        offset = 4
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return
        const hi = this.buffer.readUInt32BE(2)
        const lo = this.buffer.readUInt32BE(6)
        payloadLen = hi * 0x100000000 + lo
        offset = 10
      }

      const maskOffset = offset
      if (masked) offset += 4

      if (this.buffer.length < offset + payloadLen) return

      let payload: Buffer
      if (masked && this.buffer.length >= offset + payloadLen) {
        const mask = [this.buffer[maskOffset], this.buffer[maskOffset + 1], this.buffer[maskOffset + 2], this.buffer[maskOffset + 3]]
        payload = Buffer.alloc(payloadLen)
        for (let i = 0; i < payloadLen; i++) {
          payload[i] = this.buffer[offset + i] ^ mask[i % 4]
        }
      } else {
        payload = this.buffer.subarray(offset, offset + payloadLen)
      }

      this.buffer = this.buffer.subarray(offset + payloadLen)

      switch (opcode) {
        case 0x1:
          this.emit('message', payload.toString('utf-8'))
          break
        case 0x8: {
          const code = payloadLen >= 2 ? payload.readUInt16BE(0) : 1000
          const reason = payloadLen > 2 ? payload.subarray(2).toString('utf-8') : ''
          logger.debug('WatchService', 'WebSocket close frame', { code, reason })
          this.close(1000)
          break
        }
        case 0x9:
          this.sendFrame(0xa, payload, true)
          break
        case 0x2:
          break
      }
    }
  }

  send(text: string): void {
    const payload = Buffer.from(text, 'utf-8')
    this.sendFrame(0x1, payload)
  }

  private sendFrame(opcode: number, payload: Buffer, isPong = false): void {
    if (!this.socket) return
    const fin = isPong ? 0x8a : 0x81
    let frame: Buffer
    if (payload.length < 126) {
      frame = Buffer.alloc(2 + payload.length)
      frame[0] = fin
      frame[1] = payload.length
      payload.copy(frame, 2)
    } else if (payload.length < 65536) {
      frame = Buffer.alloc(4 + payload.length)
      frame[0] = fin
      frame[1] = 126
      frame.writeUInt16BE(payload.length, 2)
      payload.copy(frame, 4)
    } else {
      frame = Buffer.alloc(10 + payload.length)
      frame[0] = fin
      frame[1] = 127
      frame.writeUInt32BE(Math.floor(payload.length / 0x100000000), 2)
      frame.writeUInt32BE(payload.length % 0x100000000, 6)
      payload.copy(frame, 10)
    }
    this.socket.write(frame)
  }

  close(code = 1000): void {
    if (!this.socket) return
    const buf = Buffer.alloc(2)
    buf.writeUInt16BE(code, 0)
    this.sendFrame(0x8, buf)
    this.socket.end()
    this.socket = null
  }
}

export class WatchService {
  private ws: WebSocketConnection | null = null
  private events = new EventEmitter()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private shouldReconnect = false
  private currentStatus: WatchStatus = { active: false }

  constructor(
    private readonly baseUrl: string,
    private readonly repoPath: string,
  ) {}

  async start(): Promise<void> {
    logger.info('WatchService', 'Starting watch')

    // Initiate watch via HTTP API
    const repos = await this.httpGet('/api/watch/repositories')
    let repoId: number | undefined
    if (Array.isArray(repos) && repos.length > 0) {
      repoId = repos[0].id
    }

    if (repoId != null) {
      await this.httpPost(`/api/watch/repositories/${repoId}/represent`)
    }

    this.shouldReconnect = true
    await this.connectWebSocket()
    this.currentStatus = { active: true }
  }

  async stop(): Promise<void> {
    logger.info('WatchService', 'Stopping watch')
    this.shouldReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
    }
    this.currentStatus = { active: false }
  }

  getStatus(): WatchStatus {
    return this.currentStatus
  }

  onEvent(listener: (event: WatchEvent) => void): { dispose: () => void } {
    this.events.on('event', listener)
    return { dispose: () => { this.events.off('event', listener) } }
  }

  async requestStatus(): Promise<WatchStatus> {
    try {
      const status = await this.httpGet('/api/watch/status')
      this.currentStatus = status
      return status
    } catch {
      return this.currentStatus
    }
  }

  async requestDiff(): Promise<any> {
    try {
      const repos = await this.httpGet('/api/watch/repositories')
      if (Array.isArray(repos) && repos.length > 0) {
        const repoId = repos[0].id
        const versions = await this.httpGet(`/api/watch/repositories/${repoId}/versions`)
        if (Array.isArray(versions) && versions.length > 0) {
          const latestVersionId = versions[versions.length - 1].id
          return this.httpGet(`/api/watch/versions/${latestVersionId}/diffs`)
        }
      }
    } catch (e) {
      logger.warn('WatchService', 'requestDiff failed', { error: String(e) })
    }
    return []
  }

  private async connectWebSocket(): Promise<void> {
    const wsUrl = this.baseUrl.replace('http://', 'ws://') + '/api/watch/ws'
    logger.info('WatchService', 'Connecting WebSocket', { url: wsUrl })

    return new Promise((resolve, reject) => {
      const ws = new WebSocketConnection()
      let resolved = false

      ws.on('open', () => {
        logger.info('WatchService', 'WebSocket connected')
        this.ws = ws
        resolved = true
        resolve()
      })

      ws.on('message', (data: string) => {
        try {
          const event: WatchEvent = JSON.parse(data)
          logger.trace('WatchService', 'WS event', { type: event.type })
          this.events.emit('event', event)
        } catch {
          logger.warn('WatchService', 'Failed to parse WS message', { data: data.slice(0, 200) })
        }
      })

      ws.on('error', (err: Error) => {
        logger.warn('WatchService', 'WebSocket error', { error: err.message })
        if (!resolved) {
          resolved = true
          reject(err)
        }
      })

      ws.on('close', () => {
        logger.info('WatchService', 'WebSocket closed')
        this.ws = null
        if (this.shouldReconnect) {
          this.scheduleReconnect()
        }
      })

      ws.connect(wsUrl)
    })
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    logger.info('WatchService', 'Scheduling reconnect', { delay: this.reconnectDelay })
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        await this.connectWebSocket()
        this.reconnectDelay = 1000
      } catch {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
        this.scheduleReconnect()
      }
    }, this.reconnectDelay)
  }

  private httpGet(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${path}`
      http.get(url, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            resolve(data)
          }
        })
      }).on('error', reject)
    })
  }

  private httpPost(path: string, body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}${path}`)
      const postData = body ? JSON.stringify(body) : ''
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
        },
        (res) => {
          let data = ''
          res.on('data', (chunk: Buffer) => { data += chunk.toString() })
          res.on('end', () => {
            try { resolve(JSON.parse(data)) } catch { resolve(data) }
          })
        },
      )
      req.on('error', reject)
      if (postData) req.write(postData)
      req.end()
    })
  }

  dispose(): void {
    this.stop()
  }
}
