export interface AranduFile {
  id: string;
  name: string;
  path: string;
  content: string;
  modified: boolean;
}

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
  blockIndex: number;
}

export interface MarkdownBlock {
  id: string;
  index: number;
  type: 'heading' | 'paragraph' | 'list' | 'table' | 'blockquote' | 'code' | 'hr';
  content: string;
  level?: number; // for headings
  hash?: string;  // content hash for outdated detection
}

export interface ReviewComment {
  id: string;
  blockIds: string[];
  blockLabels: string[];
  text: string;
  resolved: boolean;
  createdAt: number;
  contentHashAtCreation: Record<string, string>; // blockId -> hash
}

export type ActivityView = 'explorer' | 'review' | 'search' | 'settings';
export type CommentFilter = 'all' | 'pending' | 'resolved';
export type ThemeMode = 'light' | 'dark' | 'auto';
