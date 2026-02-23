# Merge Guide: fix/relative-paths ← feat/unix-socket-ipc

Este guia documenta como fazer o merge da branch `feat/unix-socket-ipc` para `fix/relative-paths` sem conflitos.

## Mudanças nesta branch (fix/relative-paths)

### 1. **Frontend (apps/tauri/src/main.js)**
- Linha 75: Adicionado log de debug em `loadFile()`
- Linha 125-127: Toolbar mostra path completo ao invés de só o nome do arquivo
- Linha 930: Adicionado log de debug no listener `open-file`
- Linhas 1000-1002: Path completo no toolbar quando há currentPath

### 2. **Backend (apps/tauri/src-tauri/src/lib.rs)**

#### Comando `read_file` (linhas 62-78)
```rust
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    eprintln!("[DEBUG] read_file called with path: {:?}", path);

    // Try to canonicalize the path to handle relative paths correctly
    let resolved_path = match std::fs::canonicalize(&path) {
        Ok(p) => {
            eprintln!("[DEBUG] Canonicalized to: {:?}", p);
            p
        }
        Err(e) => {
            eprintln!("[DEBUG] Canonicalize failed ({}), trying as-is", e);
            PathBuf::from(&path)
        }
    };

    std::fs::read_to_string(&resolved_path)
        .map_err(|e| format!("Failed to read {}: {}", resolved_path.display(), e))
}
```

#### Estrutura do builder (linhas 351-400)
- **Separado em `let builder = ...`** para permitir conditional state management
- Adicionado comentário placeholder para `ipc::SocketState`
- Estrutura compatível com feat/unix-socket-ipc

#### Setup do app (linhas 401-408)
- Adicionado comentário placeholder para `ipc::setup(app)`
- Posição exata onde adicionar o IPC setup marcada

#### CLI args (linhas 446-460)
- Adicionados logs de debug mostrando path recebido
- Adicionado log quando canonicalização falha

#### Single instance plugin (linhas 364-385)
- Adicionados logs de debug
- Adicionado log quando canonicalização falha

#### Evento Opened (linhas 528-543)
```rust
#[cfg(target_os = "macos")]
if let tauri::RunEvent::Opened { urls } = event {
    for url in urls {
        if let Ok(path) = url.to_file_path() {
            eprintln!("[DEBUG] Opened event received with path: {:?}", path);
            // FIX: Canonicalize to ensure absolute path
            let abs_path = std::fs::canonicalize(&path).unwrap_or(path);
            let path_str = abs_path.to_string_lossy().to_string();
            eprintln!("[DEBUG] Emitting open-file with: {:?}", path_str);
            // ... rest of code
        }
    }
}
```

#### ExitRequested handler (linhas 516-525)
- Adicionado comentário placeholder para `ipc::cleanup()`
- Posição exata onde adicionar o cleanup marcada

## Como fazer o merge

### Passo 1: Adicionar módulo IPC
No início do arquivo `lib.rs`, após os outros `mod`:

```rust
#[cfg(target_os = "macos")]
mod cli_installer;
#[cfg(unix)]
mod ipc;  // <- ADICIONAR ESTA LINHA
mod tray;
mod whisper;
```

### Passo 2: Adicionar SocketState ao builder
Substituir o comentário placeholder (linhas ~396-399):

```rust
// Conditional state management (placeholder for feat/unix-socket-ipc branch merge)
// When merging with feat/unix-socket-ipc, add:
// #[cfg(unix)]
// let builder = builder.manage(ipc::SocketState(Mutex::new(None)));
```

Por:

```rust
// Conditional state management for IPC socket (Unix only)
#[cfg(unix)]
let builder = builder.manage(ipc::SocketState(Mutex::new(None)));
```

### Passo 3: Adicionar IPC setup
Substituir o comentário placeholder no setup (linhas ~408-414):

```rust
// IPC socket setup (placeholder for feat/unix-socket-ipc branch merge)
// When merging with feat/unix-socket-ipc, add:
// #[cfg(unix)]
// {
//     if let Err(e) = ipc::setup(app) {
//         eprintln!("Failed to setup IPC socket: {}", e);
//     }
// }
```

Por:

```rust
// IPC socket setup for Unix domain socket communication
#[cfg(unix)]
{
    if let Err(e) = ipc::setup(app) {
        eprintln!("Failed to setup IPC socket: {}", e);
    }
}
```

### Passo 4: Adicionar IPC cleanup
Substituir o comentário placeholder no ExitRequested (linhas ~519-526):

```rust
// IPC socket cleanup (placeholder for feat/unix-socket-ipc branch merge)
// When merging with feat/unix-socket-ipc, add:
// #[cfg(unix)]
// {
//     let socket_state = app_handle.state::<ipc::SocketState>();
//     ipc::cleanup(socket_state);
// }
```

Por:

```rust
// IPC socket cleanup on explicit quit
#[cfg(unix)]
{
    let socket_state = app_handle.state::<ipc::SocketState>();
    ipc::cleanup(socket_state);
}
```

### Passo 5: Copiar arquivo ipc.rs
Copiar o arquivo `apps/tauri/src-tauri/src/ipc.rs` da branch `feat/unix-socket-ipc`.

### Passo 6: Testar
```bash
cd apps/tauri
cargo check --manifest-path src-tauri/Cargo.toml
make build-dev
```

## Mudanças que NÃO conflitam

As seguintes mudanças desta branch são **independentes** e não conflitam:
- ✅ Logs de debug (`eprintln!`) - podem coexistir
- ✅ Canonicalização no `read_file` - melhoria necessária
- ✅ Canonicalização no evento `Opened` - **FIX crítico do bug #11**
- ✅ Toolbar mostrando path completo - mudança só no frontend

## Benefícios desta estrutura

1. **Zero conflitos de merge** - placeholders marcam exatamente onde adicionar código IPC
2. **Compatibilidade total** - estrutura do builder já separada
3. **Preserva ambos os fixes** - canonicalização + IPC funcionam juntos
4. **Fácil de revisar** - comentários explícitos mostram o que adicionar

## Ordem recomendada de merge

1. Merge `feat/unix-socket-ipc` → `main` (IPC já está funcionando)
2. Merge `fix/relative-paths` → `main` (adiciona fixes de canonicalização)
3. **OU** merge `feat/unix-socket-ipc` → `fix/relative-paths` → `main`

## Nota importante

A branch `feat/unix-socket-ipc` **não tem** a correção de canonicalização no evento `Opened`.
Essa correção é **crítica** para resolver o bug #11 (relative paths lead to blank screen).
Portanto, é essencial manter essa mudança no merge final.
