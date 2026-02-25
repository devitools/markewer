# Arandu Copilot Server

WebSocket server that bridges Arandu to GitHub Copilot CLI via Agent Client Protocol (ACP).

## Features

- **WebSocket API** on `ws://localhost:8765`
- **ACP Integration** with GitHub Copilot CLI
- **Session Management** - List, load, and resume sessions
- **Mode Switching** - Ask, Plan, Autopilot modes
- **Auto-permissions** - All Copilot actions auto-approved
- **Streaming responses** - Real-time chunk delivery

## Requirements

- Node.js >= 18
- GitHub Copilot CLI installed and authenticated
- Access to Copilot session directory (`~/.copilot/`)

## Installation

```bash
cd apps/copilot-server
npm install
```

## Usage

### Basic

```bash
npm start
```

### With custom working directory

```bash
npm start -- --cwd=/path/to/project
```

### Resume existing session

```bash
npm start -- --session=<session-id> --cwd=/path/to/project
```

## WebSocket Protocol

### Client → Server

#### Send prompt
```json
{
  "type": "prompt",
  "text": "Your question here"
}
```

#### List sessions
```json
{
  "type": "list_sessions"
}
```

#### Load session
```json
{
  "type": "load_session",
  "sessionId": "b4d17320-c576-473f-ba42-06f307967f59"
}
```

#### Set mode
```json
{
  "type": "set_mode",
  "mode": "ask" | "plan" | "autopilot"
}
```

### Server → Client

#### Connection established
```json
{
  "type": "connected",
  "sessionId": "b4d17320-c576-473f-ba42-06f307967f59"
}
```

#### Text chunk
```json
{
  "type": "chunk",
  "text": "Response text...",
  "chunkType": "agent_message_chunk" | "agent_thought_chunk"
}
```

#### Message complete
```json
{
  "type": "done"
}
```

#### Sessions list
```json
{
  "type": "sessions_list",
  "sessions": [
    {
      "sessionId": "...",
      "title": "Session title",
      "cwd": "/path",
      "updatedAt": "2024-02-25T00:32:00Z"
    }
  ]
}
```

#### Session loaded
```json
{
  "type": "session_loaded",
  "sessionId": "..."
}
```

#### Error
```json
{
  "type": "error",
  "message": "Error description"
}
```

## Architecture

```
┌──────────────┐     WebSocket      ┌─────────────────┐
│    Arandu    │ ←─────────────────→ │ Copilot Server  │
│  (Tauri App) │  ws://localhost:8765│   (Node.js)     │
└──────────────┘                     └─────────────────┘
                                              │
                                              │ ACP (stdio)
                                              ↓
                                     ┌─────────────────┐
                                     │  Copilot CLI    │
                                     │  (--acp --stdio)│
                                     └─────────────────┘
```

## Development

### Debug mode

Enable verbose logging:

```javascript
// In server.js, uncomment debug logs
console.log('[DEBUG] sessionUpdate:', update.sessionUpdate);
```

### Testing without Arandu

Use `wscat` for testing:

```bash
npm install -g wscat
wscat -c ws://localhost:8765

# Send test message
> {"type":"prompt","text":"Hello"}
```

## Notes

- Server auto-approves all Copilot permission requests
- Sessions persist in `~/.copilot/session-state/`
- Plans stored as `plan.md` within each session directory
- Supports `unstable_listSessions` and `loadSession` ACP methods

## License

MIT
