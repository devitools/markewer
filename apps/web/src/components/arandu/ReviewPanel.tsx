import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, Trash2, Copy, ChevronDown, ChevronRight, Plus, FileText } from 'lucide-react';
import type { ReviewComment, CommentFilter, MarkdownBlock } from '@/types/arandu';

interface ReviewPanelProps {
  comments: ReviewComment[];
  filter: CommentFilter;
  onFilterChange: (filter: CommentFilter) => void;
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
  selectedBlockIds: string[];
  blocks: MarkdownBlock[];
  onAddComment: (text: string, blockIds: string[], blockLabels: string[], hashes: Record<string, string>) => void;
}

function getBlockLabel(block: MarkdownBlock): string {
  if (block.type === 'heading') return `H${block.level}`;
  if (block.type === 'paragraph') return `P${block.index}`;
  if (block.type === 'list') return `Li${block.index}`;
  if (block.type === 'table') return `Tb${block.index}`;
  if (block.type === 'blockquote') return `Bq${block.index}`;
  if (block.type === 'code') return `Code${block.index}`;
  return `B${block.index}`;
}

export function ReviewPanel({
  comments,
  filter,
  onFilterChange,
  onResolve,
  onDelete,
  selectedBlockIds,
  blocks,
  onAddComment,
}: ReviewPanelProps) {
  const [newCommentText, setNewCommentText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [expandedResolved, setExpandedResolved] = useState<string[]>([]);
  const [showGeneratedReview, setShowGeneratedReview] = useState(false);

  const filteredComments = useMemo(() => {
    if (filter === 'pending') return comments.filter(c => !c.resolved);
    if (filter === 'resolved') return comments.filter(c => c.resolved);
    return comments;
  }, [comments, filter]);

  const pendingCount = comments.filter(c => !c.resolved).length;

  const handleAdd = () => {
    if (!newCommentText.trim() || selectedBlockIds.length === 0) return;
    const selectedBlocks = blocks.filter(b => selectedBlockIds.includes(b.id));
    const labels = selectedBlocks.map(b => getBlockLabel(b));
    const hashes: Record<string, string> = {};
    selectedBlocks.forEach(b => { hashes[b.id] = b.hash!; });
    onAddComment(newCommentText, selectedBlockIds, labels, hashes);
    setNewCommentText('');
    setIsAdding(false);
  };

  const generatedReview = useMemo(() => {
    const pending = comments.filter(c => !c.resolved);
    if (pending.length === 0) return '';
    let md = '# Review Comments\n\n';
    pending.forEach((c, i) => {
      md += `## ${i + 1}. [${c.blockLabels.join(', ')}]\n\n`;
      md += `${c.text}\n\n`;
    });
    return md;
  }, [comments]);

  return (
    <div className="h-full flex flex-col bg-review text-foreground select-none overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Comments ({comments.length})
        </span>
        <div className="flex gap-1">
          {(['all', 'pending', 'resolved'] as CommentFilter[]).map(f => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              className={cn(
                "px-2 py-0.5 text-[11px] rounded transition-colors capitalize",
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Add comment */}
      <div className="px-3 py-2 border-b border-border">
        {selectedBlockIds.length > 0 && !isAdding && (
          <Button size="sm" variant="outline" className="w-full text-xs gap-1" onClick={() => setIsAdding(true)}>
            <Plus className="w-3 h-3" /> Add Comment ({selectedBlockIds.length} blocks)
          </Button>
        )}
        {isAdding && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {selectedBlockIds.map(id => {
                const block = blocks.find(b => b.id === id);
                return block ? (
                  <Badge key={id} variant="secondary" className="text-[10px]">
                    {getBlockLabel(block)}
                  </Badge>
                ) : null;
              })}
            </div>
            <Textarea
              value={newCommentText}
              onChange={e => setNewCommentText(e.target.value)}
              placeholder="Write your comment..."
              className="text-xs min-h-[60px] resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" className="text-xs flex-1" onClick={handleAdd} disabled={!newCommentText.trim()}>
                Add
              </Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setIsAdding(false); setNewCommentText(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {selectedBlockIds.length === 0 && !isAdding && (
          <p className="text-xs text-muted-foreground italic">Select blocks to add comments</p>
        )}
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto">
        {filteredComments.map(comment => {
          const isResolved = comment.resolved;
          const isExpanded = expandedResolved.includes(comment.id);

          if (isResolved && !isExpanded) {
            return (
              <button
                key={comment.id}
                onClick={() => setExpandedResolved(prev => [...prev, comment.id])}
                className="w-full px-3 py-2 border-b border-border text-left flex items-center gap-2 opacity-50 hover:opacity-75 transition-opacity"
              >
                <ChevronRight className="w-3 h-3 flex-shrink-0" />
                <Check className="w-3 h-3 text-primary flex-shrink-0" />
                <span className="text-xs truncate line-through">{comment.text}</span>
              </button>
            );
          }

          return (
            <div
              key={comment.id}
              className={cn(
                "px-3 py-2 border-b border-border group transition-opacity",
                isResolved && "opacity-60"
              )}
            >
              {isResolved && (
                <button onClick={() => setExpandedResolved(prev => prev.filter(id => id !== comment.id))} className="mb-1">
                  <ChevronDown className="w-3 h-3" />
                </button>
              )}
              <div className="flex flex-wrap gap-1 mb-1.5">
                {comment.blockLabels.map((label, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 cursor-pointer hover:bg-muted">
                    {label}
                  </Badge>
                ))}
              </div>
              <p className="text-xs leading-relaxed mb-1.5">{comment.text}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleTimeString()}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onResolve(comment.id)}
                    className="p-1 rounded hover:bg-muted"
                    title={isResolved ? 'Unresolve' : 'Resolve'}
                  >
                    <Check className={cn("w-3.5 h-3.5", isResolved ? "text-primary" : "text-muted-foreground")} />
                  </button>
                  <button
                    onClick={() => onDelete(comment.id)}
                    className="p-1 rounded hover:bg-destructive/10"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {filteredComments.length === 0 && (
          <p className="px-3 py-4 text-xs text-muted-foreground italic text-center">No comments</p>
        )}
      </div>

      {/* Generate Review */}
      {pendingCount > 0 && (
        <div className="border-t border-border p-3">
          {showGeneratedReview ? (
            <div className="space-y-2">
              <pre className="text-[11px] bg-muted rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">
                {generatedReview}
              </pre>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="text-xs flex-1 gap-1"
                  onClick={() => { navigator.clipboard.writeText(generatedReview); }}
                >
                  <Copy className="w-3 h-3" /> Copy
                </Button>
                <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowGeneratedReview(false)}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs gap-1"
              onClick={() => setShowGeneratedReview(true)}
            >
              <FileText className="w-3 h-3" /> Generate Review ({pendingCount})
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
