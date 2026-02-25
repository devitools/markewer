import { Sun, Moon, Monitor, Settings, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThemeMode } from '@/types/arandu';

interface TitleBarProps {
  themeMode: ThemeMode;
  onCycleTheme: () => void;
}

const themeIcons: Record<ThemeMode, typeof Sun> = { light: Sun, dark: Moon, auto: Monitor };
const themeLabels: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', auto: 'Auto' };

export function TitleBar({ themeMode, onCycleTheme }: TitleBarProps) {
  const ThemeIcon = themeIcons[themeMode];

  return (
    <div className={cn(
      "h-9 flex items-center justify-between px-3 select-none",
      "bg-titlebar text-titlebar-foreground border-b border-border"
    )}>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm tracking-tight">Arandu</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onCycleTheme}
          className="p-1.5 rounded hover:bg-muted/50 transition-colors flex items-center gap-1"
          title={`Theme: ${themeLabels[themeMode]}`}
        >
          <ThemeIcon className="w-3.5 h-3.5" />
          <span className="text-[10px] opacity-70">{themeLabels[themeMode]}</span>
        </button>
        <button className="p-1.5 rounded hover:bg-muted/50 transition-colors" title="Reload">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button className="p-1.5 rounded hover:bg-muted/50 transition-colors" title="Settings">
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
