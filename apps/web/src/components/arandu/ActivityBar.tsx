import { FileText, MessageSquare, Search, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityView } from '@/types/arandu';

interface ActivityBarProps {
  activeView: ActivityView;
  onViewChange: (view: ActivityView) => void;
  commentCount: number;
  onToggleReview: () => void;
}

const items: { view: ActivityView; icon: typeof FileText; label: string }[] = [
  { view: 'explorer', icon: FileText, label: 'Explorer' },
  { view: 'review', icon: MessageSquare, label: 'Review' },
  { view: 'search', icon: Search, label: 'Search' },
  { view: 'settings', icon: Settings, label: 'Settings' },
];

export function ActivityBar({ activeView, onViewChange, commentCount, onToggleReview }: ActivityBarProps) {
  const handleClick = (view: ActivityView) => {
    if (view === 'review') {
      onToggleReview();
    } else {
      onViewChange(view);
    }
  };

  return (
    <div className="w-12 flex flex-col items-center pt-1 bg-activitybar border-r border-border">
      {items.map(({ view, icon: Icon, label }) => (
        <button
          key={view}
          onClick={() => handleClick(view)}
          title={label}
          className={cn(
            "relative w-12 h-11 flex items-center justify-center transition-colors",
            activeView === view
              ? "text-activitybar-active"
              : "text-activitybar-foreground hover:text-activitybar-active"
          )}
        >
          {activeView === view && (
            <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-activitybar-indicator rounded-r" />
          )}
          <Icon className="w-5 h-5" />
          {view === 'review' && commentCount > 0 && (
            <span className="absolute top-1 right-1.5 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold rounded-full bg-activitybar-indicator text-primary-foreground px-1">
              {commentCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
