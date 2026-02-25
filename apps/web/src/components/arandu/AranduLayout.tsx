import { useState, useCallback, useEffect, useMemo } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { TitleBar } from '@/components/arandu/TitleBar';
import { ActivityBar } from '@/components/arandu/ActivityBar';
import { PrimarySidebar } from '@/components/arandu/PrimarySidebar';
import { TabBar } from '@/components/arandu/TabBar';
import { MarkdownViewer } from '@/components/arandu/MarkdownViewer';
import { ReviewPanel } from '@/components/arandu/ReviewPanel';
import { useAranduStore } from '@/store/useAranduStore';
import type { OutlineItem, MarkdownBlock } from '@/types/arandu';

export default function AranduLayout() {
  const store = useAranduStore();
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [blocks, setBlocks] = useState<MarkdownBlock[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

  const commentedBlockIds = useMemo(() => {
    const ids = new Set<string>();
    store.comments.forEach(c => c.blockIds.forEach(id => ids.add(id)));
    return Array.from(ids);
  }, [store.comments]);

  const handleHeadingClick = useCallback((item: OutlineItem) => {
    setActiveHeadingId(item.id);
    document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const handleRequestAddComment = useCallback(() => {
    store.setReviewPanelOpen(true);
  }, [store]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b' && !e.shiftKey) {
          e.preventDefault();
          store.toggleSidebar();
        }
        if (e.key === 'b' && e.shiftKey) {
          e.preventDefault();
          store.toggleReviewPanel();
        }
        if (e.key === 'w') {
          e.preventDefault();
          if (store.activeFileId) store.closeFile(store.activeFileId);
        }
      }
      if (e.key === 'Escape') {
        store.clearSelection();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [store]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <TitleBar themeMode={store.themeMode} onCycleTheme={store.cycleTheme} />

      <div className="flex-1 flex overflow-hidden">
        <ActivityBar
          activeView={store.activityView}
          onViewChange={v => { store.setActivityView(v); if (!store.sidebarOpen) store.setSidebarOpen(true); }}
          commentCount={store.comments.filter(c => !c.resolved).length}
          onToggleReview={store.toggleReviewPanel}
        />

        <ResizablePanelGroup direction="horizontal" className="flex-1">
          {/* Primary Sidebar */}
          {store.sidebarOpen && (
            <>
              <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
                <PrimarySidebar
                  activeFile={store.activeFile}
                  outlineItems={outlineItems}
                  activeHeadingId={activeHeadingId}
                  onHeadingClick={handleHeadingClick}
                  files={store.files}
                  onFileClick={store.openFile}
                  activeFileId={store.activeFileId}
                  activityView={store.activityView}
                />
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}

          {/* Editor Area */}
          <ResizablePanel defaultSize={store.reviewPanelOpen ? 55 : 80} minSize={30}>
            <div className="h-full flex flex-col overflow-hidden">
              <TabBar
                openFiles={store.openFiles}
                activeFileId={store.activeFileId}
                onSelectTab={store.setActiveFileId}
                onCloseTab={store.closeFile}
                onReorderTabs={store.reorderTabs}
              />
              {store.activeFile ? (
                <MarkdownViewer
                  content={store.activeFile.content}
                  selectedBlockIds={store.selectedBlockIds}
                  onBlockClick={store.selectBlock}
                  commentedBlockIds={commentedBlockIds}
                  isDark={store.isDark}
                  onOutlineReady={setOutlineItems}
                  onBlocksReady={setBlocks}
                  onRequestAddComment={handleRequestAddComment}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center bg-editor text-muted-foreground">
                  <p className="text-sm">No file open</p>
                </div>
              )}
            </div>
          </ResizablePanel>

          {/* Review Panel */}
          {store.reviewPanelOpen && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={25} minSize={18} maxSize={40}>
                <ReviewPanel
                  comments={store.comments}
                  filter={store.commentFilter}
                  onFilterChange={store.setCommentFilter}
                  onResolve={store.resolveComment}
                  onDelete={store.deleteComment}
                  selectedBlockIds={store.selectedBlockIds}
                  blocks={blocks}
                  onAddComment={store.addComment}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
