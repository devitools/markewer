import { useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AranduFile } from '@/types/arandu';
import { ChevronRight } from 'lucide-react';

interface TabBarProps {
  openFiles: AranduFile[];
  activeFileId: string;
  onSelectTab: (fileId: string) => void;
  onCloseTab: (fileId: string) => void;
  onReorderTabs: (fromIndex: number, toIndex: number) => void;
}

export function TabBar({ openFiles, activeFileId, onSelectTab, onCloseTab, onReorderTabs }: TabBarProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== toIndex) {
      onReorderTabs(dragIndex, toIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const activeFile = openFiles.find(f => f.id === activeFileId);

  return (
    <div className="flex flex-col border-b border-border bg-tab-inactive-bg">
      {/* Tabs */}
      <div className="flex overflow-x-auto scrollbar-thin">
        {openFiles.map((file, index) => {
          const isActive = file.id === activeFileId;
          return (
            <div
              key={file.id}
              draggable
              onDragStart={e => handleDragStart(e, index)}
              onDragOver={e => handleDragOver(e, index)}
              onDrop={e => handleDrop(e, index)}
              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
              onClick={() => onSelectTab(file.id)}
              className={cn(
                "group relative flex items-center gap-1.5 px-3 h-9 text-[13px] cursor-pointer border-r border-tab-border select-none min-w-0 max-w-[160px] transition-colors",
                isActive
                  ? "bg-tab-active-bg text-tab-active-fg"
                  : "bg-tab-inactive-bg text-tab-inactive-fg hover:bg-tab-active-bg/50",
                dragOverIndex === index && "border-l-2 border-l-primary",
                isActive && "border-t-2 border-t-primary -mt-[1px]"
              )}
            >
              <span className="truncate">{file.name}</span>
              {file.modified && (
                <span className="block w-2 h-2 rounded-full bg-tab-modified flex-shrink-0" />
              )}
              <button
                onClick={e => { e.stopPropagation(); onCloseTab(file.id); }}
                className={cn(
                  "flex-shrink-0 p-0.5 rounded transition-all hover:bg-muted",
                  isActive ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover:opacity-70 group-hover:hover:opacity-100"
                )}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Breadcrumb */}
      {activeFile && (
        <div className="flex items-center gap-1 px-3 h-6 text-[12px] text-breadcrumb-foreground bg-tab-active-bg">
          {activeFile.path.split('/').map((segment, i, arr) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 opacity-50" />}
              <span className={cn(i === arr.length - 1 && "text-foreground")}>{segment}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
