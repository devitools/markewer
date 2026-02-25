import { useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';
import type { MarkdownBlock, OutlineItem } from '@/types/arandu';
import { MessageSquare, Plus } from 'lucide-react';

interface MarkdownViewerProps {
  content: string;
  selectedBlockIds: string[];
  onBlockClick: (blockId: string, shiftKey: boolean) => void;
  commentedBlockIds: string[];
  isDark: boolean;
  onOutlineReady: (items: OutlineItem[]) => void;
  onBlocksReady: (blocks: MarkdownBlock[]) => void;
  onRequestAddComment: () => void;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function parseBlocks(content: string): MarkdownBlock[] {
  const lines = content.split('\n');
  const blocks: MarkdownBlock[] = [];
  let currentBlock: string[] = [];
  let blockType: MarkdownBlock['type'] = 'paragraph';
  let headingLevel = 0;
  let inCodeBlock = false;
  let inTable = false;

  const flush = () => {
    const text = currentBlock.join('\n').trim();
    if (text) {
      blocks.push({
        id: `block-${blocks.length}`,
        index: blocks.length,
        type: blockType,
        content: text,
        level: blockType === 'heading' ? headingLevel : undefined,
        hash: hashString(text),
      });
    }
    currentBlock = [];
    blockType = 'paragraph';
    headingLevel = 0;
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        currentBlock.push(line);
        blockType = 'code';
        flush();
        inCodeBlock = false;
        continue;
      }
      flush();
      inCodeBlock = true;
      currentBlock.push(line);
      continue;
    }

    if (inCodeBlock) {
      currentBlock.push(line);
      continue;
    }

    if (line.startsWith('|') && line.includes('|')) {
      if (!inTable) { flush(); inTable = true; }
      currentBlock.push(line);
      blockType = 'table';
      continue;
    } else if (inTable) {
      flush();
      inTable = false;
    }

    if (line.match(/^#{1,6}\s/)) {
      flush();
      headingLevel = (line.match(/^#+/)![0]).length;
      blockType = 'heading';
      currentBlock.push(line);
      flush();
      continue;
    }

    if (line.startsWith('>')) {
      if (blockType !== 'blockquote') flush();
      blockType = 'blockquote';
      currentBlock.push(line);
      continue;
    }

    if (line.match(/^[-*+]\s/) || line.match(/^\d+\.\s/) || line.match(/^- \[[ x]\]/)) {
      if (blockType !== 'list') flush();
      blockType = 'list';
      currentBlock.push(line);
      continue;
    }

    if (line === '---' || line === '***') {
      flush();
      blockType = 'hr';
      currentBlock.push(line);
      flush();
      continue;
    }

    if (line.trim() === '') {
      if (currentBlock.length > 0) flush();
      continue;
    }

    if (blockType !== 'paragraph') flush();
    blockType = 'paragraph';
    currentBlock.push(line);
  }
  if (currentBlock.length > 0) flush();
  return blocks;
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

export function MarkdownViewer({
  content,
  selectedBlockIds,
  onBlockClick,
  commentedBlockIds,
  isDark,
  onOutlineReady,
  onBlocksReady,
  onRequestAddComment,
}: MarkdownViewerProps) {
  const blocksRef = useRef<MarkdownBlock[]>([]);

  const blocks = useMemo(() => {
    const parsed = parseBlocks(content);
    blocksRef.current = parsed;

    const outline: OutlineItem[] = parsed
      .filter(b => b.type === 'heading')
      .map(b => ({
        id: b.id,
        level: b.level!,
        text: b.content.replace(/^#+\s/, ''),
        blockIndex: b.index,
      }));

    setTimeout(() => {
      onOutlineReady(outline);
      onBlocksReady(parsed);
    }, 0);

    return parsed;
  }, [content]);

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 bg-editor text-editor-foreground">
      <div className="max-w-3xl mx-auto">
        {blocks.map((block) => {
          const isSelected = selectedBlockIds.includes(block.id);
          const hasComment = commentedBlockIds.includes(block.id);

          return (
            <div key={block.id} className="relative">
              <div
                id={block.id}
                onClick={e => onBlockClick(block.id, e.shiftKey || e.ctrlKey || e.metaKey)}
                className={cn(
                  "relative group cursor-pointer rounded px-3 py-1 -mx-3 transition-all duration-150 border-l-2 border-transparent",
                  "hover:bg-block-hover",
                  isSelected && "bg-block-selected border-l-block-selected-border",
                )}
              >
                {/* Gutter */}
                <div className="absolute -left-10 top-1 text-[11px] text-gutter-foreground opacity-0 group-hover:opacity-100 select-none w-6 text-right">
                  {getBlockLabel(block)}
                </div>

                {/* Comment indicator */}
                {hasComment && (
                  <div className="absolute -left-5 top-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-primary fill-primary/20" />
                  </div>
                )}

                {/* Rendered markdown block */}
                <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-table:text-[13px] prose-td:px-3 prose-td:py-1.5 prose-th:px-3 prose-th:py-1.5 prose-th:font-semibold prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const inline = !match && !String(children).includes('\n');
                        if (inline) {
                          return (
                            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono" {...props}>
                              {children}
                            </code>
                          );
                        }
                        return (
                          <SyntaxHighlighter
                            style={isDark ? oneDark : oneLight}
                            language={match?.[1] || 'text'}
                            PreTag="div"
                            customStyle={{ borderRadius: '4px', fontSize: '13px', margin: 0 }}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        );
                      },
                    }}
                  >
                    {block.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { parseBlocks, getBlockLabel, hashString };
