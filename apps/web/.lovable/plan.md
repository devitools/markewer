

# Correções e Melhorias da Interface Arandu

## Problemas Identificados e Soluções

### 1. Activity Bar escura no tema claro
A Activity Bar usa `--activitybar-bg: 220 17% 20%` (escuro) mesmo no tema light. Vamos ajustar para um tom claro harmonizado com a sidebar no tema light, mantendo escuro no dark.

### 2. Modo de tema automatico (System)
Adicionar terceira opcao de tema: Light / Dark / Auto (segue `prefers-color-scheme` do OS). O toggle no TitleBar vai ciclar entre os 3 modos com icones distintos (Sol, Lua, Monitor).

### 3. Botao de fechar abas nao visivel
O botao de fechar (X) existe mas so aparece no hover e pode estar sendo ocultado pelo dot de modificacao. Vamos tornar o X sempre visivel na aba ativa e melhorar o contraste/tamanho para ficar claro.

### 4. Fluxo de adicionar comentarios confuso
O usuario seleciona blocos mas nao encontra como adicionar comentarios porque o painel de review precisa estar aberto. Solucao:
- Ao selecionar blocos, abrir automaticamente o review panel se estiver fechado
- Mostrar um botao flutuante "Add Comment" proximo aos blocos selecionados no editor (inline, como GitHub PR)
- Tornar o fluxo mais obvio e direto

### 5. Botoes da Activity Bar sem efeito
Clicar em "Review", "Search" e "Settings" na Activity Bar nao faz nada visivel. Vamos:
- **Review**: ao clicar, abre/fecha o painel de review lateral direito
- **Search**: mostrar um placeholder mockado na sidebar com campo de busca
- **Settings**: mostrar um placeholder mockado com opcoes basicas

### 6. Remover Status Bar
A barra azul inferior (Status Bar) sera removida conforme feedback. As informacoes de contagem de comentarios serao exibidas no header do review panel.

---

## Alteracoes Tecnicas

### Arquivos modificados:

1. **`src/index.css`** -- Ajustar `--activitybar-bg` e `--activitybar-fg` no tema light para tons claros (ex: `220 14% 96%` bg, `220 9% 46%` fg)

2. **`src/types/arandu.ts`** -- Adicionar tipo `ThemeMode = 'light' | 'dark' | 'auto'`

3. **`src/store/useAranduStore.ts`** -- Substituir `isDark: boolean` por `themeMode: ThemeMode` com logica de auto-detection via `matchMedia('prefers-color-scheme: dark')`; ao clicar em Review na Activity Bar, toggle do review panel

4. **`src/components/arandu/TitleBar.tsx`** -- Ciclar entre 3 modos (Sun/Moon/Monitor icons)

5. **`src/components/arandu/ActivityBar.tsx`** -- Conectar clique em "Review" para abrir/fechar o painel de review; "Search" e "Settings" mostram conteudo mockado na sidebar

6. **`src/components/arandu/TabBar.tsx`** -- Tornar o botao X sempre visivel na aba ativa; melhorar tamanho e contraste do botao fechar

7. **`src/components/arandu/AranduLayout.tsx`** -- Remover StatusBar; conectar Activity Bar review ao toggle do painel; mostrar conteudo de Search/Settings mockado na sidebar; abrir review panel automaticamente ao selecionar blocos

8. **`src/components/arandu/StatusBar.tsx`** -- Remover (ou manter arquivo mas nao usar)

9. **`src/components/arandu/MarkdownViewer.tsx`** -- Adicionar botao flutuante "Add Comment" que aparece quando ha blocos selecionados, abrindo o fluxo de comentario diretamente

10. **`src/components/arandu/PrimarySidebar.tsx`** -- Adicionar views mockadas para Search (campo de busca + placeholder) e Settings (opcoes basicas mockadas)

