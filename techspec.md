## Executive Summary

This TechSpec defines the implementation plan for the Arandu Session Browser & Plan Manager POC, a React-based web application at `apps/web` that lets developers browse coding agent sessions, review plans and task lists, and add developer annotations. The POC uses **mock data** with a **SessionRepository adapter pattern** (`src/features/sessions/data/`) so the data layer can be swapped for real filesystem access later. **TanStack Query v5** manages session/task data caching while **Zustand** handles UI state (active tab, sidebar selection). The existing VS Code-like layout shell (ActivityBar, Sidebar, TabBar) is **reused and restyled** with a new visual identity. Session detail views use an **accumulating tab model** (max ~5 tabs, VS Code-style). Plan markdown is rendered with the existing `react-markdown` + `remark-gfm` pipeline, and tasks are extracted from `[ ]/[x]` checkboxes **in the repository layer** as structured `Task[]` objects cached by TanStack Query. Developer annotations are **in-memory only** (not persisted), using the existing `ReviewPanel` block-based comment system with line-range selection.

Key risks: mock data fidelity vs. real Copilot session structure, and ensuring the adapter interface is broad enough for future real implementations without over-engineering the POC.

## System Architecture

### Domain Placement

```
apps/web/src/
├── features/
│   └── sessions/                    # NEW — Session browser feature module
│       ├── data/
│       │   ├── session.repository.ts      # SessionRepository interface
│       │   ├── mock-session.repository.ts # MockSessionRepository implementation
│       │   ├── mock-data.ts               # Hardcoded mock session data
│       │   └── plan-parser.ts             # Markdown → Task[] parser
│       ├── hooks/
│       │   ├── use-sessions.ts            # TanStack Query hook: session list
│       │   ├── use-session-detail.ts      # TanStack Query hook: single session + plan + tasks
│       │   └── use-session-comments.ts    # In-memory comment state hook
│       ├── components/
│       │   ├── SessionList.tsx            # Sidebar session list component
│       │   ├── SessionDetail.tsx          # Tab content: plan viewer + task list
│       │   ├── TaskList.tsx               # Extracted task list display
│       │   └── SessionTab.tsx             # Individual tab header component
│       ├── types/
│       │   └── session.types.ts           # Session, Plan, Task, Comment types
│       └── index.ts                       # Public exports
├── components/
│   └── layout/                      # EXISTING — Reuse & restyle
│       ├── ActivityBar.tsx                # Vertical icon bar (restyle)
│       ├── Sidebar.tsx                    # Collapsible panel (extend with SessionList)
│       ├── TabBar.tsx                     # Horizontal tabs (extend with session tabs)
│       └── MainContent.tsx                # NEW — Tab content area orchestrator
│   └── markdown/                    # EXISTING — Reuse as-is
│       └── MarkdownViewer.tsx             # Block-based markdown with line numbers
│   └── review/                      # EXISTING — Reuse as-is
│       └── ReviewPanel.tsx                # Comment system with line-range selection
├── store/
│   └── useAranduStore.ts            # MODIFY — Add session UI state (tabs, active session)
├── lib/
│   └── query-client.ts             # NEW — TanStack Query client setup
└── App.tsx                          # MODIFY — Wire QueryClientProvider + session feature
```

**Boundaries:**
- `features/sessions/` owns all session-specific logic (data, hooks, components, types)
- `components/layout/` is shared infrastructure — extended but not owned by the session feature
- `components/markdown/` and `components/review/` are reused as-is from the existing codebase
- `store/useAranduStore.ts` is extended with session-specific UI slices (tab state, active session)
- `lib/query-client.ts` provides the shared TanStack Query client instance

### Component Overview

| Component | Responsibility | Key Dependencies |
|-----------|---------------|-----------------|
| `SessionRepository` | Abstract interface for session data access | None (pure interface) |
| `MockSessionRepository` | Hardcoded mock implementation with plan.md parsing | `plan-parser.ts`, mock data |
| `plan-parser.ts` | Extracts `Task[]` from markdown checkbox syntax | None (pure function) |
| `use-sessions` | TanStack Query hook for session list | `SessionRepository`, `@tanstack/react-query` |
| `use-session-detail` | TanStack Query hook for session plan + tasks | `SessionRepository`, `@tanstack/react-query` |
| `use-session-comments` | In-memory annotation state per session | React `useState`/`useRef` |
| `SessionList` | Renders session entries in the Sidebar | `use-sessions`, Zustand store |
| `SessionDetail` | Orchestrates plan viewer + task list + review panel | `use-session-detail`, `MarkdownViewer`, `ReviewPanel` |
| `TaskList` | Displays extracted tasks with checkbox status | `Task[]` from parent |
| `TabBar` (extended) | Manages session tab headers with close buttons | Zustand store (tab state) |
| `MainContent` | Routes tab content area to correct SessionDetail | Zustand store (active tab) |

**Data flow:** User clicks session in `SessionList` → Zustand adds tab → `MainContent` renders `SessionDetail` for active tab → `use-session-detail` hook fetches plan+tasks from `SessionRepository` via TanStack Query → `MarkdownViewer` renders plan, `TaskList` renders extracted tasks, `ReviewPanel` enables annotations.

## Implementation Design

### Core Interfaces

```typescript
// apps/web/src/features/sessions/data/session.repository.ts
interface SessionRepository {
  /** List all available sessions, sorted by modification date descending */
  listSessions(): Promise<SessionSummary[]>;

  /** Get full session detail including raw plan markdown and parsed tasks */
  getSessionDetail(sessionId: string): Promise<SessionDetail>;
}

// apps/web/src/features/sessions/data/plan-parser.ts
/** Pure function: extracts Task[] from plan.md markdown content */
function parsePlanTasks(markdown: string): Task[];
```

```typescript
// apps/web/src/features/sessions/data/mock-session.repository.ts
class MockSessionRepository implements SessionRepository {
  async listSessions(): Promise<SessionSummary[]> {
    // Returns hardcoded session summaries with realistic Copilot-like data
  }

  async getSessionDetail(sessionId: string): Promise<SessionDetail> {
    // Returns mock plan markdown + runs parsePlanTasks() to extract Task[]
  }
}
```

```typescript
// apps/web/src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,    // Mock data never goes stale
      gcTime: 1000 * 60 * 30, // 30 min garbage collection
      retry: false,            // No retries for mock data
    },
  },
});
```

### Data Models

```typescript
// apps/web/src/features/sessions/types/session.types.ts

/** Shown in the sidebar session list */
interface SessionSummary {
  id: string;                    // UUID matching Copilot session ID
  name: string;                  // Derived from workspace.yaml or first line of plan
  summary: string;               // Brief description or plan excerpt
  createdAt: string;             // ISO 8601
  modifiedAt: string;            // ISO 8601
  agentType: 'copilot' | 'generic'; // Agent identifier for UI badges
  workspacePath: string;         // Original workspace directory path
  taskStats: {
    total: number;
    completed: number;
  };
}

/** Full session detail for the tab content view */
interface SessionDetail {
  id: string;
  name: string;
  summary: string;
  createdAt: string;
  modifiedAt: string;
  agentType: 'copilot' | 'generic';
  workspacePath: string;
  plan: {
    raw: string;                 // Original plan.md markdown content
    tasks: Task[];               // Extracted from [ ]/[x] checkboxes
  };
}

/** Individual task extracted from plan.md checkboxes */
interface Task {
  id: string;                    // Generated: `task-{lineNumber}`
  title: string;                 // Text content after [ ] or [x]
  completed: boolean;            // true if [x], false if [ ]
  lineNumber: number;            // Source line in plan.md (for comment anchoring)
  indent: number;                // Nesting level (0-based, from leading whitespace)
}

/** Developer annotation on plan content */
interface SessionComment {
  id: string;                    // UUID
  sessionId: string;
  lineRange: {
    start: number;               // Start line in plan.md
    end: number;                 // End line in plan.md
  };
  content: string;               // Comment text (plain text)
  createdAt: string;             // ISO 8601
}

/** Tab state in Zustand store */
interface SessionTab {
  sessionId: string;
  title: string;                 // Session name for tab header
}
```

**Validation rules:**
- `SessionSummary.id` and `SessionDetail.id` must be valid UUIDs
- `Task.lineNumber` must be > 0 and correspond to actual plan.md lines
- `SessionComment.lineRange.start` must be <= `lineRange.end`
- `SessionTab` list max length: 5 (enforced in Zustand action)

### Contract Specifications

#### Data Contracts

**SessionRepository Interface Contract:**

| Method | Input | Output | Error Behavior |
|--------|-------|--------|---------------|
| `listSessions()` | none | `Promise<SessionSummary[]>` | Returns empty array on failure |
| `getSessionDetail(sessionId)` | `string` (UUID) | `Promise<SessionDetail>` | Throws `SessionNotFoundError` if ID unknown |

```typescript
class SessionNotFoundError extends Error {
  constructor(public sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}
```

**TanStack Query Key Conventions:**
- Session list: `['sessions']`
- Session detail: `['sessions', sessionId]`

**Zustand Store Extension (session UI slice):**

```typescript
// Added to existing useAranduStore.ts
interface SessionUIState {
  tabs: SessionTab[];            // Open session tabs (max 5)
  activeTabId: string | null;    // Currently visible session tab
  sidebarSessionsExpanded: boolean;

  // Actions
  openSession: (session: SessionSummary) => void;
  closeTab: (sessionId: string) => void;
  setActiveTab: (sessionId: string) => void;
}
```

**`openSession` behavior:**
1. If session already has a tab → activate that tab (no duplicate)
2. If tabs.length >= 5 → close oldest tab, then add new
3. Otherwise → add new tab at end, activate it

**`closeTab` behavior:**
1. Remove tab from array
2. If closed tab was active → activate the tab to the left (or first tab, or null if empty)

#### Comment Data Contract (In-Memory)

Comments are stored per-session in a `Map<string, SessionComment[]>` managed by the `use-session-comments` hook. No persistence, no API. The hook exposes:

```typescript
interface UseSessionCommentsReturn {
  comments: SessionComment[];
  addComment: (lineRange: { start: number; end: number }, content: string) => void;
  removeComment: (commentId: string) => void;
}
```

### API Endpoints

Not applicable — this POC has no backend API. All data flows through the in-memory `SessionRepository` interface.

## Integration Points

### Existing Component Integration

| Existing Component | Integration Strategy | Modifications Required |
|--------------------|---------------------|----------------------|
| `ActivityBar` | Add "Sessions" icon (e.g., `FolderGit2` from lucide-react) | Add new nav item to icon list |
| `Sidebar` | Render `SessionList` when Sessions activity is selected | Add conditional content rendering |
| `TabBar` | Extend to show `SessionTab` headers with close buttons | Add session tab type, close button handler |
| `MarkdownViewer` | Reuse as-is inside `SessionDetail` for plan.md rendering | No changes — receives markdown string prop |
| `ReviewPanel` | Reuse as-is inside `SessionDetail` for annotations | Wire to `use-session-comments` hook instead of store |

### External Dependencies (Already Installed)

| Dependency | Version | Usage | Status |
|-----------|---------|-------|--------|
| `@tanstack/react-query` | ^5.x | Session data caching | Installed, currently unused — activate |
| `react-markdown` | ^9.x | Plan.md rendering | Already in use by MarkdownViewer |
| `remark-gfm` | ^4.x | GFM support (checkboxes, tables) | Already in use |
| `zustand` | ^5.x | UI state management | Already in use |
| `lucide-react` | ^0.x | Icons | Already in use |
| `shadcn/ui` components | latest | UI primitives (ScrollArea, Badge, Button) | Already configured |

**No new dependencies required.** All needed packages are already installed.

## Sequence and Failure Flows

### Primary Execution Sequence

1. **App Initialization** (`App.tsx`)
   - Wrap app in `QueryClientProvider` with shared `queryClient`
   - Instantiate `MockSessionRepository` and provide via React context or module-level singleton
   - Render existing layout shell (ActivityBar + Sidebar + TabBar + MainContent)

2. **Session List Loading** (on app mount)
   - `SessionList` component mounts inside Sidebar
   - `useSessions()` hook triggers `queryClient.fetchQuery(['sessions'], () => repository.listSessions())`
   - TanStack Query caches `SessionSummary[]` — staleTime: Infinity (mock data)
   - Sidebar renders list sorted by `modifiedAt` descending

3. **Session Selection** (user click in sidebar)
   - User clicks a session entry in `SessionList`
   - `openSession(session)` Zustand action fires → adds/activates tab
   - `TabBar` re-renders with new tab header
   - `MainContent` renders `SessionDetail` for active `sessionId`
   - `useSessionDetail(sessionId)` hook triggers `queryClient.fetchQuery(['sessions', sessionId], () => repository.getSessionDetail(sessionId))`
   - TanStack Query caches `SessionDetail` (includes raw markdown + parsed `Task[]`)

4. **Plan Rendering** (inside SessionDetail)
   - `MarkdownViewer` receives `plan.raw` markdown string
   - Renders with block-based line numbers (existing functionality)
   - `TaskList` receives `plan.tasks` and renders checkbox-style task items

5. **Annotation** (user interaction)
   - User selects line range in `MarkdownViewer` (existing block selection)
   - `ReviewPanel` opens with selected range
   - User types annotation text and submits
   - `addComment()` from `use-session-comments` stores in-memory
   - Comment indicators appear on `MarkdownViewer` gutter (existing functionality)

6. **Tab Switching**
   - User clicks different tab in `TabBar`
   - `setActiveTab(sessionId)` fires in Zustand
   - `MainContent` swaps to corresponding `SessionDetail`
   - TanStack Query serves cached data (no re-fetch)

### Failure Behavior

| Failure Mode | Expected Behavior | User-Visible Outcome |
|-------------|-------------------|---------------------|
| Session list fetch fails | TanStack Query `error` state | Sidebar shows "Failed to load sessions" message with retry button |
| Session detail fetch fails | TanStack Query `error` state | Tab content shows "Session not found" error message |
| Invalid session ID in openSession | `SessionNotFoundError` caught by TanStack Query | Error boundary in tab content area |
| Max tabs exceeded (>5) | Oldest tab auto-closed by `openSession` action | Oldest tab disappears, new tab opens |
| Plan.md parsing yields no tasks | `parsePlanTasks` returns empty `Task[]` | TaskList renders "No tasks found" placeholder |
| Comment on invalid line range | `addComment` validates range, silently ignores invalid | No comment created, no error shown |

Since this is a mock-data POC, most failure modes are edge cases during development rather than production concerns.

## Impact Analysis

| Affected Component | Type of Impact | Description & Risk Level | Required Action |
|---|---|---|---|
| `App.tsx` | Structural Change | Add `QueryClientProvider` wrapper, session repository provider. Low risk — additive only. | Wire providers around existing app tree |
| `useAranduStore.ts` | State Extension | Add session UI slice (tabs, activeTab). Low risk — new slice, no changes to existing state. | Add `SessionUIState` slice using Zustand's slice pattern |
| `ActivityBar` | UI Extension | Add "Sessions" navigation icon. Low risk — one new item in existing icon array. | Add icon entry |
| `Sidebar` | Content Extension | Conditionally render `SessionList` vs. existing content based on active activity. Low risk. | Add conditional rendering branch |
| `TabBar` | Feature Extension | Support session-type tabs with close buttons. Medium risk — existing tab logic may need generalization. | Extend tab model to support closeable session tabs |
| `MarkdownViewer` | No Change | Reused as-is for plan.md rendering. No risk. | None |
| `ReviewPanel` | Integration Change | Wire to `use-session-comments` hook instead of store for session-specific comments. Low risk. | Pass comments/handlers as props instead of reading from store |
| CSS/Theme | Visual Overhaul | Restyle all layout components with new visual identity. Medium risk — broad surface area. | Update CSS variables, component styles in Tailwind config |

## Testing Approach

### Unit Tests

**Test framework:** Vitest (already configured in `vitest.config.ts`)

| Component | Test Focus | Mock Requirements |
|-----------|-----------|-------------------|
| `parsePlanTasks()` | Checkbox extraction accuracy, edge cases (nested, empty, mixed) | None — pure function |
| `MockSessionRepository` | Returns expected data shape, `SessionNotFoundError` for unknown IDs | None |
| `openSession` action | Tab accumulation, duplicate prevention, max-5 eviction, activation | None — Zustand store test |
| `closeTab` action | Tab removal, active tab reassignment | None |
| `use-session-comments` | Add/remove comments, line range validation | None |

**Critical test cases for `parsePlanTasks`:**
```
- [ ] unchecked task       → { completed: false, title: "unchecked task" }
- [x] completed task       → { completed: true, title: "completed task" }
  - [ ] nested task        → { completed: false, indent: 1 }
- [ ] task with **bold**   → { title: "task with **bold**" }
Empty markdown             → []
Markdown with no checkboxes → []
Mixed content with checkboxes → only checkbox items extracted
```

### Integration Tests

| Test Scenario | Components Involved | Validation |
|--------------|-------------------|------------|
| Session list renders on mount | `SessionList` + `useSessions` + `MockSessionRepository` | List shows all mock sessions with correct metadata |
| Click session opens tab | `SessionList` + `TabBar` + `SessionDetail` | New tab appears, detail content loads |
| Plan markdown renders with tasks | `SessionDetail` + `MarkdownViewer` + `TaskList` | Markdown rendered, tasks extracted and shown |
| Annotation workflow | `SessionDetail` + `ReviewPanel` + `use-session-comments` | Select lines → add comment → comment indicator appears |
| Tab switching preserves state | Multiple `SessionDetail` instances | Switch tabs, previous tab retains scroll position |
| Max tabs behavior | 6 sequential session opens | 5th tab opens normally, 6th evicts oldest |

### End-to-End / Contract Verification

| Verification | Method |
|-------------|--------|
| `SessionRepository` contract | TypeScript compiler enforces interface implementation |
| Mock data shape matches real Copilot format | Manual review of mock data against real `~/.copilot/session-state/` structure |
| TanStack Query cache keys | Unit tests verify cache hits on repeated fetches |
| Zustand tab state invariants | Unit tests verify max-5, no duplicates, active-tab consistency |

## Development Sequencing

### Build Order

1. **Types & Interfaces** (`session.types.ts`, `session.repository.ts`) — Foundation with no dependencies. Enables parallel work on all other components.

2. **Plan Parser** (`plan-parser.ts`) — Pure function, independently testable. Unblocks mock repository implementation.

3. **Mock Data & Repository** (`mock-data.ts`, `mock-session.repository.ts`) — Depends on types + parser. Creates realistic session data matching Copilot format. Provides the data layer for all UI work.

4. **TanStack Query Setup** (`query-client.ts`, `use-sessions.ts`, `use-session-detail.ts`) — Depends on repository. Wire TanStack Query hooks with mock repository as query functions.

5. **Zustand Store Extension** (`useAranduStore.ts` session UI slice) — Add tab state management (openSession, closeTab, setActiveTab). Independent of data hooks.

6. **Session List Component** (`SessionList.tsx`) — Depends on `useSessions` hook. First visible UI — renders sessions in sidebar.

7. **Session Detail Components** (`SessionDetail.tsx`, `TaskList.tsx`, `SessionTab.tsx`) — Depends on `useSessionDetail` hook + existing `MarkdownViewer`. Core content view.

8. **Layout Integration** (`ActivityBar`, `Sidebar`, `TabBar`, `MainContent`, `App.tsx`) — Wire session feature into existing layout shell. Add QueryClientProvider.

9. **Comment Integration** (`use-session-comments.ts` + wire to `ReviewPanel`) — In-memory annotation support using existing ReviewPanel.

10. **Visual Restyling** — Update CSS variables, Tailwind config, and component styles for new visual identity across all layout components.

### Technical Dependencies

| Dependency | Status | Blocking? |
|-----------|--------|-----------|
| TanStack Query v5 | Installed, unused | No — just need to import and configure |
| Zustand v5 | Active | No — extend existing store |
| react-markdown + remark-gfm | Active | No — already rendering markdown |
| shadcn/ui components | Configured | No — already available |
| Vitest | Configured | No — test infrastructure ready |

**No blocking external dependencies.** All required libraries are already installed.

## Monitoring & Observability

Since this is a client-side POC with mock data, traditional server-side monitoring does not apply. Instead:

**Development-time observability:**

| Tool | Purpose | Implementation |
|------|---------|---------------|
| React Query DevTools | Inspect cache state, query status, stale/fresh timing | Add `<ReactQueryDevtools>` in `App.tsx` (dev only) |
| Zustand DevTools | Inspect tab state, active session, sidebar state | Already available via `devtools` middleware in existing store |
| Browser Console | Error logging for repository failures, parse errors | `console.error` in TanStack Query `onError` callbacks |
| Vite HMR | Hot reload during development | Already configured |

**Key metrics to log (console):**
- Session list fetch duration (even for mock — validates hook wiring)
- Plan parse time and task count per session
- Tab state transitions (open/close/switch)

### Operational Acceptance

Not applicable for a client-side POC. Acceptance criteria:
- App loads without errors in Chrome/Edge (latest)
- All mock sessions appear in sidebar
- Clicking a session opens a tab with plan content
- Tasks extracted and displayed from plan markdown
- Annotations can be added/removed via ReviewPanel
- Max 5 tabs enforced, oldest evicted

## Rollout and Rollback

### Rollout Plan

This is a greenfield POC in `apps/web` — no production traffic, no existing users to migrate.

1. **Development branch**: All work on feature branch off `main`
2. **Incremental PRs**: Follow build order above — types/data first, UI second, integration last
3. **Local validation**: `npm run dev` serves the POC at `localhost:5173`
4. **No deployment pipeline needed**: POC is local-only for now

### Rollback Plan

- **Git revert**: Since all changes are in `apps/web/src/features/sessions/` and minimal modifications to existing files, revert is straightforward
- **Existing functionality preserved**: Layout shell modifications are additive (new activity item, new tab type) — removing them restores original behavior
- **No data migration**: In-memory mock data, nothing to roll back

## Technical Considerations

### Key Decisions

| Decision | Rationale | Alternative Rejected |
|----------|-----------|---------------------|
| Feature Module Architecture (`src/features/sessions/`) | Clean domain boundary, easy to find/modify session code, follows React community conventions | Flat structure (all in `src/components/`) — harder to navigate as feature grows |
| SessionRepository adapter pattern | Enables future swap to real filesystem access without changing hooks/components | Inline mock data in store — requires refactoring when adding real data |
| TanStack Query for data + Zustand for UI | TanStack Query provides caching, loading/error states, deduplication for free. Zustand handles synchronous UI state (tabs). Clean separation. | Zustand for everything — loses caching/query semantics; TanStack Query for everything — poor fit for synchronous UI state |
| Plan.md parsing in repository layer | Parsed `Task[]` cached by TanStack Query alongside raw markdown. Single fetch returns both. | Parsing in component — mixes data transformation with rendering, re-parses on every render |
| In-memory comments (not persisted) | Simplest implementation, validates the annotation UX without persistence complexity | localStorage — adds serialization complexity for a POC that may pivot |
| No router (Zustand-driven tabs) | Single-screen app with tabs doesn't need URL routing. Simpler architecture. | React Router — adds dependency and complexity for a single-screen POC |
| Max 5 tabs with oldest eviction | Prevents memory bloat, familiar VS Code pattern | Unlimited tabs — memory concerns, cluttered UI |

### Known Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mock data diverges from real Copilot format | Medium | Medium — future adapter may need rework | Base mock data on actual `~/.copilot/session-state/` files examined during discovery |
| SessionRepository interface too narrow | Low | Medium — adding methods later is straightforward | Start minimal (list + detail), extend when real data requirements emerge |
| New visual identity delays POC | Medium | Low — functionality works regardless of styling | Build functionality first, restyle as final step |
| Existing layout components tightly coupled to current store | Low | Medium — may require prop refactoring | Audit each layout component's store dependencies before integration |
| TanStack Query staleTime: Infinity masks reactivity issues | Low | Low — only matters when moving to real data | Document that real implementation must configure appropriate staleTime |

### Assumptions

1. `apps/web` at `/Users/william/Work/Projects/Devitools/arandu/apps/web` is the correct working directory for this POC
2. All existing `apps/web` dependencies (`@tanstack/react-query`, `react-markdown`, `remark-gfm`, `zustand`, `shadcn/ui`) are at compatible versions and working
3. The existing layout components (ActivityBar, Sidebar, TabBar, MarkdownViewer, ReviewPanel) are functional and can be extended without major refactoring
4. Mock data matching Copilot's `workspace.yaml` + `plan.md` format is sufficient to validate the session browser concept
5. In-memory comment storage is acceptable for POC validation — persistence will be added in a future iteration
6. Chrome/Edge (latest) is the target browser — no IE/Safari compatibility needed for POC
7. The `plan-parser.ts` only needs to handle GFM-style `- [ ]` and `- [x]` checkboxes (not arbitrary task formats)

### Open Technical Questions

1. **Visual identity specifics**: The "new visual identity" needs a design reference or style guide. The TechSpec assumes this will be provided during the restyling phase — functionality can proceed without it.
2. **Agent-agnostic session format**: While the UI is designed to be agent-agnostic (via `agentType` field), the specific session format for non-Copilot agents (Claude Code, Gemini CLI) is not yet defined. The mock data can include `agentType: 'generic'` entries for validation.

### Standards Compliance

| Standard | Compliance |
|----------|-----------|
| **TypeScript strict mode** | Yes — all new code uses strict TypeScript with explicit types |
| **React 18 patterns** | Yes — functional components, hooks, no class components |
| **shadcn/ui conventions** | Yes — uses shadcn/ui primitives (ScrollArea, Badge, Button, etc.) |
| **Tailwind CSS** | Yes — all styling via Tailwind utility classes + CSS variables |
| **Vitest testing** | Yes — unit + integration tests using existing Vitest config |
| **ESLint** | Yes — follows existing `eslint.config.js` rules |
| **Feature module pattern** | Yes — self-contained `src/features/sessions/` with clear public API |
| **TanStack Query conventions** | Yes — query keys as arrays, custom hooks wrapping `useQuery` |
| **Zustand patterns** | Yes — slice pattern for store extension, devtools middleware |