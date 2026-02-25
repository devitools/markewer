import { cn } from '@/lib/utils';
import { ChevronRight, Search } from 'lucide-react';
import type { OutlineItem, AranduFile, ActivityView } from '@/types/arandu';

interface PrimarySidebarProps {
  activeFile: AranduFile | undefined;
  outlineItems: OutlineItem[];
  activeHeadingId: string | null;
  onHeadingClick: (item: OutlineItem) => void;
  files: AranduFile[];
  onFileClick: (fileId: string) => void;
  activeFileId: string;
  activityView: ActivityView;
}

function ExplorerView({
  outlineItems, activeHeadingId, onHeadingClick, files, onFileClick, activeFileId,
}: Omit<PrimarySidebarProps, 'activeFile' | 'activityView'>) {
  return (
    <>
      <div className="px-4 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-label">Outline</span>
      </div>
      <div className="flex-1 overflow-y-auto px-1">
        {outlineItems.map(item => (
          <button
            key={item.id}
            onClick={() => onHeadingClick(item)}
            className={cn(
              "w-full text-left px-2 py-1 rounded text-[13px] truncate transition-colors",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              activeHeadingId === item.id && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            )}
            style={{ paddingLeft: `${8 + (item.level - 1) * 14}px` }}
            title={item.text}
          >
            <ChevronRight className="w-3 h-3 inline-block mr-1 opacity-50" />
            <span className="truncate">{item.text}</span>
          </button>
        ))}
        {outlineItems.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground italic">No headings found</p>
        )}
      </div>
      <div className="border-t border-sidebar-border">
        <div className="px-4 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-label">Files</span>
        </div>
        <div className="px-1 pb-2">
          {files.map(file => (
            <button
              key={file.id}
              onClick={() => onFileClick(file.id)}
              className={cn(
                "w-full text-left px-3 py-1 rounded text-[13px] truncate transition-colors flex items-center gap-2",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                activeFileId === file.id && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              )}
            >
              <span className="truncate">{file.name}</span>
              {file.modified && <span className="w-2 h-2 rounded-full bg-tab-modified flex-shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function SearchView() {
  return (
    <>
      <div className="px-4 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-label">Search</span>
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-border bg-background text-sm">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search in document..."
            className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="px-3 py-4 text-center">
        <p className="text-xs text-muted-foreground italic">Type to search across documents</p>
      </div>
    </>
  );
}

function SettingsView() {
  return (
    <>
      <div className="px-4 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-label">Settings</span>
      </div>
      <div className="px-3 py-2 space-y-3">
        <div className="text-[13px]">
          <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase">Editor</p>
          <label className="flex items-center justify-between py-1 cursor-pointer">
            <span>Word wrap</span>
            <input type="checkbox" className="accent-primary" defaultChecked />
          </label>
          <label className="flex items-center justify-between py-1 cursor-pointer">
            <span>Show line numbers</span>
            <input type="checkbox" className="accent-primary" />
          </label>
        </div>
        <div className="text-[13px]">
          <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase">Review</p>
          <label className="flex items-center justify-between py-1 cursor-pointer">
            <span>Auto-open panel</span>
            <input type="checkbox" className="accent-primary" defaultChecked />
          </label>
        </div>
      </div>
    </>
  );
}

export function PrimarySidebar({
  outlineItems, activeHeadingId, onHeadingClick, files, onFileClick, activeFileId, activityView,
}: PrimarySidebarProps) {
  return (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground select-none overflow-hidden">
      {activityView === 'explorer' && (
        <ExplorerView
          outlineItems={outlineItems}
          activeHeadingId={activeHeadingId}
          onHeadingClick={onHeadingClick}
          files={files}
          onFileClick={onFileClick}
          activeFileId={activeFileId}
        />
      )}
      {activityView === 'search' && <SearchView />}
      {activityView === 'settings' && <SettingsView />}
    </div>
  );
}
