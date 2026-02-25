/**
 * server.js
 *
 * ACP client that spawns `copilot --acp --stdio`, then exposes a WebSocket
 * interface so copilot-ui.html can talk to it.
 *
 *   Browser <-- WebSocket --> server.js <-- ACP/stdio --> copilot --acp --stdio
 *
 * Usage:
 *   node server.js
 *   node server.js --session=<id>   # resume an existing session
 *   node server.js --cwd=/path      # set working directory
 *   node server.js --mode=plan      # set initial mode
 */

import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from '@agentclientprotocol/sdk'
import * as acp from '@agentclientprotocol/sdk'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable, Writable } from 'node:stream'
import express, { type Request, type Response } from 'express'
import { type WebSocket, WebSocketServer } from 'ws'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const sessionArg = args.find(a => a.startsWith('--session='))
const cwdArg = args.find(a => a.startsWith('--cwd='))
const modeArg = args.find(a => a.startsWith('--mode='))

const RESUME_SESSION_ID = sessionArg ? sessionArg.split('=')[1] : null
const COPILOT_CWD = cwdArg ? cwdArg.split('=')[1] : process.cwd()
const INITIAL_MODE = modeArg ? modeArg.split('=')[1] : null

console.log('🚀 Starting copilot-ui server...\n')
if (RESUME_SESSION_ID) console.log(`📌 Will resume session: ${RESUME_SESSION_ID}`)
if (INITIAL_MODE) console.log(`🎯 Initial mode: ${INITIAL_MODE}`)
console.log(`📁 Working directory: ${COPILOT_CWD}\n`)

// ── Express ───────────────────────────────────────────────────────────────────
const app = express()
app.use(express.static(join(__dirname, 'public')))
app.get('/', (_req: Request, res: Response) => res.sendFile(join(__dirname, 'copilot-ui.html')))
app.get('/copilot-ui', (_req: Request, res: Response) => res.sendFile(join(__dirname, 'copilot-ui.html')))

const httpServer = createServer(app)

// ── WebSocket ─────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', async (ws: WebSocket) => {
  console.log('[ws] Client connected')

  function send (type: string, payload: Record<string, unknown> = {}) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type, ...payload }))
  }

  try {
    const copilotBin = process.env.COPILOT_PATH || 'copilot'
    const copilotArgs = ['--acp', '--stdio']

    console.log(`[acp] Spawning: ${copilotBin} ${copilotArgs.join(' ')}`)

    const proc = spawn(copilotBin, copilotArgs, {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env },
      cwd: COPILOT_CWD,
    })

    if (!proc.stdin || !proc.stdout) throw new Error('Failed to start copilot ACP process')

    proc.on('error', err => {
      console.error('[copilot] Process error:', err)
      send('error', { message: `Failed to start copilot: ${err.message}` })
    })
    proc.on('exit', code => {
      console.log('[copilot] Exited with code', code)
      send('agent_exit', { code })
    })

    // ACP SDK expects Web Streams — stdin is writable, stdout is readable
    const stream = acp.ndJsonStream(
      Writable.toWeb(proc.stdin),
      Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>
    )

    // ── ACP client callbacks ────────────────────────────────────────────────
    const client = {
      async requestPermission (params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
        console.log('[acp] Permission request:', params)
        send('prompt_request', { request: params })
        return { outcome: { outcome: 'selected', optionId: 'allow_always' } }
      },

      async sessionUpdate (params: SessionNotification): Promise<void> {
        const u = params.update as acp.SessionUpdate
        console.log('[acp] sessionUpdate:', u.sessionUpdate)

        const updateType = u.sessionUpdate as string
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const uu = u as any
        console.log(JSON.stringify(uu))
        switch (updateType) {
          case 'user_message_chunk': {
            // content pode ser objeto { type, text } ou array de blocos
            const content = uu.content
            let text = ''
            if (Array.isArray(content)) {
              text = content
                .filter((c: any) => c?.type === 'text')
                .map((c: any) => c.text ?? '')
                .join('')
            } else if (content?.type === 'text') {
              text = content.text as string
            }
            if (text) send('user_delta', { delta: text })
            break
          }

          case 'agent_message_chunk': {
            const text: string = uu.content?.type === 'text' ? uu.content.text : ''
            if (!text) break
            // Warning/Info/Experimental messages are system notices, not agent replies
            if (/^(Warning:|Info:|🔬|Experimental)/.test(text)) {
              send('status_notice', { text })
            } else {
              send('turn_delta', { delta: text })
            }
            break
          }

          case 'end_turn':
            send('turn_complete', {})
            break

          case 'agent_thought_chunk':
            if (uu.content?.type === 'text')
              send('thought_delta', { delta: uu.content.text as string })
            break

          case 'tool_call':
            send('tool_output', {
              toolCallId: uu.toolCallId,
              kind: uu.kind,
              title: uu.title,
              rawInput: uu.rawInput ?? null,
              locations: uu.locations ?? null,
              status: uu.status ?? 'pending',
            })
            break

          case 'tool_call_update': {
            if (uu.status !== 'completed') break
            const detail = uu.rawOutput?.detailedContent ?? null
            let addedLines: number | null = null
            let deletedLines: number | null = null
            if (detail) {
              // Count diff lines (+/-) excluding the +++ / --- header lines
              addedLines   = (detail.match(/^\+(?!\+\+)/gm)  || []).length || null
              deletedLines = (detail.match(/^-(?!--)/gm)     || []).length || null
            }
            if (uu.rawOutput?.content) {
              send('tool_output_done', {
                toolCallId: uu.toolCallId,
                summary: uu.rawOutput.content,
                detail,
                addedLines,
                deletedLines,
              })
            }
            break
          }

          case 'plan':
            send('plan_update', { plan: uu.entries })
            break

          case 'current_mode_update':
            send('mode_update', { mode: uu.currentModeId })
            break

          case 'session_info_update':
            console.log('[acp] session_info_update:', JSON.stringify(uu, null, 2))
            send('session_info', { data: uu })
            break

          case 'available_commands_update':
          case 'config_option_update':
          case 'usage_update':
            // ignore
            break
        }
      },
    }

    // ── Init connection ─────────────────────────────────────────────────────
    const connection = new acp.ClientSideConnection((_agent) => client, stream)

    send('status', { message: 'Connecting to Copilot…' })

    await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
    })

    // ── Create or resume session ────────────────────────────────────────────
    type AnySession = { sessionId: string; [k: string]: unknown }
    let session: AnySession | undefined
    let loaded = false

    if (RESUME_SESSION_ID) {
      send('status', { message: `Resuming session ${RESUME_SESSION_ID}…` })
      try {
        console.log(`[acp] Trying loadSession: ${RESUME_SESSION_ID}`)
        const raw = await connection.loadSession({
          sessionId: RESUME_SESSION_ID,
          cwd: COPILOT_CWD,
          mcpServers: [],
        }) as AnySession
        if (!raw.sessionId) raw.sessionId = RESUME_SESSION_ID
        session = raw
        loaded = true
        console.log('[acp] loadSession OK:', session.sessionId)
        ws.send(JSON.stringify({ type: 'session_loaded', sessionId: session.sessionId }))
      } catch (e) {
        console.warn('[acp] loadSession failed:', (e as Error).message)
      }
    }

    if (!loaded) {
      const raw = await connection.newSession({ cwd: COPILOT_CWD, mcpServers: [] })
      session = raw as AnySession
      console.log('[acp] New session:', session.sessionId)
    }

    if (!session) throw new Error('Failed to create session')

    // ── Set initial mode ────────────────────────────────────────────────────
    if (INITIAL_MODE) {
      try {
        await connection.setSessionMode({ sessionId: session.sessionId, mode: INITIAL_MODE })
      } catch (e) {
        console.warn('[acp] setSessionMode failed:', (e as Error).message)
      }
    }

    const sid = session.sessionId
    send('ready', {
      sessionId: sid,
      availableModes: (session.availableModes as string[]) ?? [],
      currentMode: INITIAL_MODE ?? (session.currentMode as string) ?? 'code',
      model: (session.model as string) ?? '',
      workingDirectory: COPILOT_CWD,
    })

    // ── Messages from browser ───────────────────────────────────────────────
    ws.on('message', async (raw) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let msg: any
      try { msg = JSON.parse(raw.toString()) } catch { return }

      try {
        switch (msg.type) {
          case 'prompt':
            await connection.prompt({
              sessionId: sid,
              prompt: [{ type: 'text', text: msg.text }],
            })
            break

          case 'prompt_response':
            // respondToPromptRequest is not in the public API; use cancel+re-prompt pattern if needed
            break

          case 'set_mode':
            await connection.setSessionMode({ sessionId: sid, mode: msg.mode })
            send('mode_update', { mode: msg.mode })
            break

          case 'cancel':
            await connection.cancel({ sessionId: sid })
            send('cancelled', {})
            break

          default:
            console.warn('[ws] Unknown message type:', msg.type)
        }
      } catch (err) {
        console.error('[ws] Handler error:', err)
        send('error', { message: (err as Error).message })
      }
    })

    ws.on('close', () => {
      console.log('[ws] Client disconnected')
      proc.stdin.end()
      proc.kill('SIGTERM')
    })

  } catch (err) {
    console.error('[acp] Init error:', err)
    send('error', { message: (err as Error).message })
    ws.close()
  }
})

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n🚀  copilot-ui: http://localhost:${PORT}`)
  if (RESUME_SESSION_ID)
    console.log(`   Resuming session: ${RESUME_SESSION_ID}`)
  console.log()
})
