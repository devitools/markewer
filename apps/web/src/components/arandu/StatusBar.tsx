import { cn } from '@/lib/utils';

interface StatusBarProps {
  activeFileName?: string;
  blockCount: number;
  selectedCount: number;
  commentCount: number;
}

export function StatusBar({ activeFileName, blockCount, selectedCount, commentCount }: StatusBarProps) {
  return (
    <div className="h-6 flex items-center justify-between px-3 text-[11px] bg-statusbar text-statusbar-foreground select-none">
      <div className="flex items-center gap-3">
        {activeFileName && <span>{activeFileName}</span>}
        <span>{blockCount} blocks</span>
        {selectedCount > 0 && <span>{selectedCount} selected</span>}
      </div>
      <div className="flex items-center gap-3">
        <span>{commentCount} comments</span>
        <span>Markdown</span>
        <span>UTF-8</span>
      </div>
    </div>
  );
}
