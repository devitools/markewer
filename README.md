# Arandu

Visualizador de Markdown para macOS inspirado no [Typora](https://typora.io) e [Marked 2](https://marked2app.com). Abre arquivos `.md` via linha de comando com renderização bonita, dark mode automático, syntax highlighting e sumário lateral.

![macOS 13+](https://img.shields.io/badge/macOS-13%2B-blue)

## Funcionalidades

- 📄 Renderização completa do GitHub Flavored Markdown (tabelas, checklists, strikethrough)
- 🌙 Dark mode automático (segue o sistema)
- 🎨 Syntax highlighting para blocos de código
- 📑 Sumário lateral com os títulos do documento (clique para navegar)
- 🔄 Live reload: atualiza automaticamente ao salvar o arquivo
- 🪟 Cada arquivo abre em uma janela independente

## Instalação

### Opção 1 — DMG (recomendado)

1. Baixe o arquivo `Arandu.dmg` + `install.sh`
2. Monte o DMG (duplo clique)
3. Execute no terminal:

```bash
cd /Volumes/Arandu
./install.sh
```

> Isso instala o app em `~/Applications/` e o CLI em `/usr/local/bin/arandu`.

### Opção 2 — Script direto

Se você já tem o `Arandu.app`:

```bash
curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash -s -- /path/to/Arandu.app
# ou
./install.sh /path/to/Arandu.app
```

### Opção 3 — Manual

```bash
# 1. Copiar o app
cp -R Arandu.app ~/Applications/

# 2. Remover a flag de quarantine (Gatekeeper)
xattr -d com.apple.quarantine ~/Applications/Arandu.app

# 3. Instalar o CLI
sudo cp scripts/arandu /usr/local/bin/arandu
sudo chmod +x /usr/local/bin/arandu
```

## Uso

```bash
# Abrir um arquivo
arandu README.md

# Abrir múltiplos arquivos (cada um em uma janela)
arandu doc1.md doc2.md

# Abrir todos os .md do diretório atual
arandu *.md

# Sem argumentos — abre seletor de arquivo
arandu
```

## Gatekeeper (nota importante)

O app é distribuído sem assinatura da Apple (não requer Apple Developer Program). No primeiro uso, o macOS pode bloquear. O script `install.sh` já remove a flag automaticamente. Se precisar fazer manualmente:

```bash
xattr -d com.apple.quarantine ~/Applications/Arandu.app
```

Ou: clique com botão direito no app → "Abrir" → confirme.

## Build (para devs)

Pré-requisitos: Xcode, [xcodegen](https://github.com/yonaskolb/XcodeGen)

```bash
# Instalar xcodegen
brew install xcodegen

# Build e instalar
make install

# Criar DMG de distribuição
make dist
# → dist/Arandu.dmg
```

## Estrutura

```
Sources/Arandu/
├── main.swift              # Código principal (AppDelegate, WindowController, renderer)
└── Resources/
    ├── style.css           # CSS estilo Typora
    ├── highlight.min.js    # Syntax highlighting (highlight.js)
    ├── highlight-light.min.css
    └── highlight-dark.min.css
```
