import { useState, useCallback, useEffect } from 'react';
import type { AranduFile, ReviewComment, ActivityView, CommentFilter, ThemeMode } from '@/types/arandu';

// Sample markdown content
const SAMPLE_MD = `# Plano Estratégico: Migração para Arquitetura Cloud-Native

> **Status:** Em andamento | **Última atualização:** 2025-01-15

## 1. Contexto e Motivação

A empresa enfrenta desafios significativos com a infraestrutura atual, baseada em servidores on-premise que apresentam limitações de escalabilidade e custos crescentes de manutenção.

Os principais motivadores desta migração são:

- **Escalabilidade**: Necessidade de suportar picos de 10x no tráfego durante campanhas
- **Redução de custos**: Otimizar gastos com infraestrutura em ~40%
- **Agilidade**: Acelerar deploys de semanas para minutos
- ~~Manter sistemas legados~~ Modernizar toda a stack

## 2. Métricas Atuais vs. Esperadas

| Métrica | Atual | Esperado | Melhoria |
|---------|-------|----------|----------|
| Tempo de deploy | 2 semanas | 15 minutos | 99.3% |
| Uptime | 99.5% | 99.99% | +0.49% |
| Custo mensal | R$ 180.000 | R$ 108.000 | -40% |
| Time to market | 3 meses | 2 semanas | 83% |

## 3. Fases da Migração

### 3.1 Fase 1 — Preparação (Q1 2025)

Atividades planejadas para a primeira fase:

1. Audit completo da infraestrutura atual
2. Definição de arquitetura-alvo em cloud
3. Capacitação do time em Kubernetes e IaC
4. Setup do ambiente de staging

### 3.2 Fase 2 — Migração Core (Q2 2025)

- [ ] Containerização dos serviços principais
- [ ] Setup do cluster Kubernetes
- [ ] Migração do banco de dados
- [x] Definição de políticas de segurança

### 3.3 Fase 3 — Otimização (Q3 2025)

Foco em performance e custos após a migração inicial.

## 4. Riscos e Mitigações

> **⚠️ Atenção:** Os riscos abaixo foram classificados por impacto e probabilidade. Itens em vermelho exigem ação imediata.

- **Alto risco**: Downtime durante migração do banco → Mitigação: blue-green deployment
- **Médio risco**: Curva de aprendizado do time → Mitigação: treinamento prévio + pair programming
- **Baixo risco**: Aumento temporário de custos → Mitigação: budget buffer de 20%

## 5. Próximos Passos

1. Aprovar budget com diretoria (deadline: 30/01)
2. Contratar consultoria especializada em cloud
3. Iniciar POC com serviço menos crítico
4. Agendar workshops de capacitação

---

*Documento gerado pelo time de Arquitetura — Versão 2.3*
`;

const SAMPLE_FILES: AranduFile[] = [
  {
    id: 'file-1',
    name: 'plano-estrategico.md',
    path: 'docs/plano-estrategico.md',
    content: SAMPLE_MD,
    modified: false,
  },
  {
    id: 'file-2',
    name: 'README.md',
    path: 'README.md',
    content: '# Projeto Arandu\n\nFerramenta de review de documentos Markdown.',
    modified: true,
  },
  {
    id: 'file-3',
    name: 'roadmap.md',
    path: 'docs/roadmap.md',
    content: '# Roadmap\n\n## Q1 2025\n- Feature A\n- Feature B\n\n## Q2 2025\n- Feature C',
    modified: false,
  },
];

function getResolvedTheme(mode: ThemeMode): boolean {
  if (mode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return mode === 'dark';
}

export function useAranduStore() {
  const [files] = useState<AranduFile[]>(SAMPLE_FILES);
  const [openFileIds, setOpenFileIds] = useState<string[]>(['file-1', 'file-2']);
  const [activeFileId, setActiveFileId] = useState<string>('file-1');
  const [activityView, setActivityView] = useState<ActivityView>('explorer');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [commentFilter, setCommentFilter] = useState<CommentFilter>('all');
  const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
  const [isDark, setIsDark] = useState(() => getResolvedTheme('auto'));

  // Listen for OS theme changes when in auto mode
  useEffect(() => {
    const resolved = getResolvedTheme(themeMode);
    setIsDark(resolved);
    document.documentElement.classList.toggle('dark', resolved);

    if (themeMode === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        setIsDark(e.matches);
        document.documentElement.classList.toggle('dark', e.matches);
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [themeMode]);

  const activeFile = files.find(f => f.id === activeFileId);
  const openFiles = files.filter(f => openFileIds.includes(f.id));

  const openFile = useCallback((fileId: string) => {
    if (!openFileIds.includes(fileId)) {
      setOpenFileIds(prev => [...prev, fileId]);
    }
    setActiveFileId(fileId);
  }, [openFileIds]);

  const closeFile = useCallback((fileId: string) => {
    setOpenFileIds(prev => {
      const next = prev.filter(id => id !== fileId);
      if (activeFileId === fileId && next.length > 0) {
        setActiveFileId(next[next.length - 1]);
      }
      return next;
    });
  }, [activeFileId]);

  const cycleTheme = useCallback(() => {
    setThemeMode(prev => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'auto';
      return 'light';
    });
  }, []);

  const toggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), []);
  const toggleReviewPanel = useCallback(() => setReviewPanelOpen(prev => !prev), []);

  const selectBlock = useCallback((blockId: string, shiftKey: boolean) => {
    setSelectedBlockIds(prev => {
      if (shiftKey) {
        return prev.includes(blockId) ? prev.filter(id => id !== blockId) : [...prev, blockId];
      }
      return prev.includes(blockId) && prev.length === 1 ? [] : [blockId];
    });
    // Auto-open review panel when selecting blocks
    setReviewPanelOpen(true);
  }, []);

  const clearSelection = useCallback(() => setSelectedBlockIds([]), []);

  const addComment = useCallback((text: string, blockIds: string[], blockLabels: string[], contentHashes: Record<string, string>) => {
    const comment: ReviewComment = {
      id: `comment-${Date.now()}`,
      blockIds,
      blockLabels,
      text,
      resolved: false,
      createdAt: Date.now(),
      contentHashAtCreation: contentHashes,
    };
    setComments(prev => [...prev, comment]);
    setSelectedBlockIds([]);
  }, []);

  const resolveComment = useCallback((commentId: string) => {
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved: !c.resolved } : c));
  }, []);

  const deleteComment = useCallback((commentId: string) => {
    setComments(prev => prev.filter(c => c.id !== commentId));
  }, []);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setOpenFileIds(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  return {
    files, openFiles, activeFile, activeFileId, openFileIds,
    activityView, setActivityView,
    sidebarOpen, toggleSidebar, setSidebarOpen,
    reviewPanelOpen, toggleReviewPanel, setReviewPanelOpen,
    selectedBlockIds, selectBlock, clearSelection,
    comments, commentFilter, setCommentFilter,
    addComment, resolveComment, deleteComment,
    isDark, themeMode, cycleTheme,
    openFile, closeFile, setActiveFileId, reorderTabs,
  };
}
