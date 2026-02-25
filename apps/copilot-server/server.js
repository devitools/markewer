import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { Writable, Readable } from "node:stream";
import { WebSocketServer } from 'ws';

const WS_PORT = 8765;

const RESUME_SESSION_ID = process.argv.find(arg => arg.startsWith('--session='))?.split('=')[1];
const COPILOT_CWD = process.argv.find(arg => arg.startsWith('--cwd='))?.split('=')[1] || process.cwd();

let copilotConnection = null;
let copilotSessionId = null;

async function initializeCopilot() {
  console.log('⚙️  Initializing Copilot ACP connection...');

  const copilotArgs = ['--acp', '--stdio'];
  const copilotProcess = spawn('copilot', copilotArgs, {
    stdio: ['pipe', 'pipe', 'inherit'],
    cwd: COPILOT_CWD,
  });

  copilotProcess.on('error', (err) => {
    console.error('❌ Failed to start Copilot process:', err);
    process.exit(1);
  });

  const output = Writable.toWeb(copilotProcess.stdin);
  const input = Readable.toWeb(copilotProcess.stdout);
  const stream = acp.ndJsonStream(output, input);

  const client = {
    async requestPermission(params) {
      console.log('🔐 Permission requested (full params):', JSON.stringify(params, null, 2));

      // Auto-approve ALL permissions
      const response = { outcome: { optionId: "allow_always" } };
      console.log('✅ Auto-approving with:', response);

      return response;
    },
    async sessionUpdate(params) {
      const update = params.update;

      console.log('[DEBUG] sessionUpdate:', update.sessionUpdate);

      if ((update.sessionUpdate === "agent_message_chunk" || update.sessionUpdate === "agent_thought_chunk")
          && update.content?.type === "text") {
        console.log(`📨 Chunk: ${update.content.text.substring(0, 50)}...`);
        broadcastToClients({
          type: 'chunk',
          text: update.content.text,
          chunkType: update.sessionUpdate  // 'agent_message_chunk' ou 'agent_thought_chunk'
        });
      }

      // Check for various completion events
      if (update.sessionUpdate === "agent_message_end" ||
          update.sessionUpdate === "agent_message_complete" ||
          update.sessionUpdate === "message_end" ||
          update.sessionUpdate === "complete") {
        console.log('✅ Message complete - sending done to clients');
        broadcastToClients({ type: 'done' });
      }

      // Log unknown events
      if (!["agent_message_chunk", "agent_thought_chunk", "agent_message_end",
            "agent_message_complete", "message_end", "complete"].includes(update.sessionUpdate)) {
        console.log('[UNKNOWN EVENT]:', update.sessionUpdate, JSON.stringify(update, null, 2));
      }
    },
  };

  const connection = new acp.ClientSideConnection((_agent) => client, stream);
  await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {},
  });

  let sessionResult;

  if (RESUME_SESSION_ID) {
    let loaded = false;

    // Try loadSession first (stable API - replays conversation history)
    try {
      console.log(`📂 Trying to load session: ${RESUME_SESSION_ID}`);
      sessionResult = await connection.loadSession({
        sessionId: RESUME_SESSION_ID,
        cwd: COPILOT_CWD,
        mcpServers: [],
      });
      if (!sessionResult.sessionId) {
        sessionResult.sessionId = RESUME_SESSION_ID;
      }
      console.log(`✓ Successfully loaded session via loadSession`);
      loaded = true;
    } catch (loadErr) {
      console.log(`⚠️  loadSession failed: ${loadErr.message}`);
    }

    // Try unstable_resumeSession (experimental - no history replay)
    if (!loaded) {
      try {
        console.log(`🔄 Trying unstable_resumeSession: ${RESUME_SESSION_ID}`);
        sessionResult = await connection.unstable_resumeSession({
          sessionId: RESUME_SESSION_ID,
          cwd: COPILOT_CWD,
          mcpServers: [],
        });
        if (!sessionResult.sessionId) {
          sessionResult.sessionId = RESUME_SESSION_ID;
        }
        console.log(`✓ Successfully resumed session via unstable_resumeSession`);
        loaded = true;
      } catch (resumeErr) {
        console.log(`⚠️  unstable_resumeSession failed: ${resumeErr.message}`);
      }
    }

    // Fallback: create new session
    if (!loaded) {
      console.log(`🆕 All resume methods failed, creating new session`);
      sessionResult = await connection.newSession({
        cwd: COPILOT_CWD,
        mcpServers: [],
      });
    }
  } else {
    console.log(`✨ Creating new session`);
    sessionResult = await connection.newSession({
      cwd: COPILOT_CWD,
      mcpServers: [],
    });
  }

  copilotConnection = connection;
  copilotSessionId = sessionResult.sessionId;

  console.log(`✓ Copilot ACP initialized (session: ${sessionResult.sessionId})`);
  console.log(`📁 Working directory: ${COPILOT_CWD}`);
}

const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('🔌 Client connected');
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', sessionId: copilotSessionId }));

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'prompt' && copilotConnection) {
        console.log('💬 Received prompt:', msg.text.substring(0, 50) + '...');
        await copilotConnection.prompt({
          sessionId: copilotSessionId,
          prompt: [{ type: "text", text: msg.text }],
        });
      }

      if (msg.type === 'list_sessions' && copilotConnection) {
        console.log('📋 Listing sessions...');
        try {
          const result = await copilotConnection.unstable_listSessions({ cwd: COPILOT_CWD });
          ws.send(JSON.stringify({ type: 'sessions_list', sessions: result.sessions }));
        } catch (err) {
          console.error('❌ Failed to list sessions:', err.message);
          ws.send(JSON.stringify({ type: 'sessions_list', sessions: [], error: err.message }));
        }
      }

      if (msg.type === 'load_session' && copilotConnection && msg.sessionId) {
        // Skip reload if this session is already active
        if (msg.sessionId === copilotSessionId) {
          console.log(`✓ Session already active: ${copilotSessionId}`);
          broadcastToClients({ type: 'session_loaded', sessionId: copilotSessionId });
          return;
        }

        console.log(`📂 Loading session: ${msg.sessionId}`);
        try {
          const result = await copilotConnection.loadSession({
            sessionId: msg.sessionId,
            cwd: COPILOT_CWD,
            mcpServers: [],
          });
          copilotSessionId = result.sessionId || msg.sessionId;
          console.log(`✓ Session loaded: ${copilotSessionId}`);
          broadcastToClients({ type: 'session_loaded', sessionId: copilotSessionId });
        } catch (err) {
          // If the session is already loaded, treat it as success
          if (err.message && err.message.includes('already loaded')) {
            copilotSessionId = msg.sessionId;
            console.log(`✓ Session already loaded (treating as success): ${copilotSessionId}`);
            broadcastToClients({ type: 'session_loaded', sessionId: copilotSessionId });
          } else {
            console.error('❌ Failed to load session:', err.message);
            ws.send(JSON.stringify({ type: 'error', message: `Failed to load session: ${err.message}` }));
          }
        }
      }

      if (msg.type === 'set_mode' && copilotConnection) {
        console.log(`🎯 Changing mode to: ${msg.mode}`);

        // Map friendly names to ACP mode URLs
        const modeMap = {
          'ask': 'https://agentclientprotocol.com/protocol/session-modes#agent',
          'plan': 'https://agentclientprotocol.com/protocol/session-modes#plan',
          'autopilot': 'https://agentclientprotocol.com/protocol/session-modes#autopilot',
        };

        const modeId = modeMap[msg.mode] || modeMap['ask'];
        console.log(`   Mapped to: ${modeId}`);

        try {
          await copilotConnection.setSessionMode({
            sessionId: copilotSessionId,
            modeId: modeId,
          });
          console.log(`✓ Mode changed to: ${msg.mode}`);
          broadcastToClients({ type: 'mode_changed', mode: msg.mode });
        } catch (err) {
          console.error(`❌ Failed to set mode:`, err);
          console.error(`   Full error:`, JSON.stringify(err, null, 2));
        }
      }
    } catch (err) {
      console.error('Error processing message:', err);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => {
    console.log('🔌 Client disconnected');
    clients.delete(ws);
  });
});

function broadcastToClients(message) {
  const json = JSON.stringify(message);
  clients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(json);
    }
  });
}

console.log('🚀 Copilot Server starting...');
initializeCopilot().catch((err) => {
  console.error('❌ Failed to initialize Copilot:', err);
  process.exit(1);
});

console.log(`🌐 WebSocket server listening on ws://localhost:${WS_PORT}`);
