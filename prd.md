## Overview

Arandu is evolving from a markdown reader and voice-to-text tool toward a session management hub for AI coding agents. As the Agent Client Protocol (ACP) gains adoption across major tools — Zed, JetBrains, Claude Code, Gemini CLI, Codex, and goose — developers need a way to review what their agents did, understand execution plans, and annotate sessions for their own reference.

This POC delivers a functional session browser and plan manager in `apps/web` with a fresh visual identity for Arandu. It focuses on GitHub Copilot sessions as the primary format while keeping the UI agent-agnostic so other ACP-compatible agents can be supported without rework. The existing Tauri app remains the main product; this POC validates the ACP-centric direction before deeper investment.

The core value proposition: developers gain visibility into agent behavior across sessions, can review plans and tasks, and can annotate plans with multi-line comments for their own reference — establishing a read/write workflow that turns opaque agent sessions into reviewable, annotatable artifacts.

## Goals

- **Validate the ACP pivot**: Confirm that session browsing and plan management is the right direction for Arandu's evolution, before committing to deeper product investment
- **Deliver core read/write workflow**: A developer can open a directory, browse all agent sessions, read plans and task lists, and add multi-line annotations — end-to-end in one sitting
- **Establish new visual identity**: Launch a fresh design language for Arandu in the POC that can evolve independently from the existing Tauri app
- **Agent-agnostic foundation**: While Copilot is the primary supported format, the session browsing experience should not hardcode assumptions that prevent supporting other ACP agents later

**Success metrics:**
- A developer can complete the full workflow (open directory → browse sessions → read plan → add comment) without errors or dead ends
- Session list correctly displays modification/creation date, session ID, and session name/summary for all Copilot sessions in a directory
- Annotations can be created by selecting multiple lines in a plan and attaching a comment that encompasses all of them
- POC is usable enough to gather feedback from early testers on whether this direction merits further development

## User Stories

**Primary persona: Developer using AI coding agents**

A developer who regularly uses GitHub Copilot (and potentially other AI coding agents) to assist with code changes. They want to review what the agent planned and did across sessions, track task completion, and leave notes for themselves about agent behavior.

- As a developer, I want to open a project directory and see all agent sessions associated with it, so that I can understand the full history of agent activity in my project
- As a developer, I want to see session date, ID, and summary at a glance in a list, so that I can quickly find the session I'm looking for
- As a developer, I want to open a session and read its execution plan, so that I can understand what the agent intended to do
- As a developer, I want to view the task list within a session, so that I can see what was planned, completed, or still pending
- As a developer, I want to select multiple lines in a plan and add an annotation comment, so that I can record my thoughts, corrections, or observations for future reference
- As a developer, I want my annotations stored separately from the session files, so that my comments don't interfere with the agent's operation
- As a developer, I want the session browser to work with Copilot sessions today and be ready for other agents tomorrow, so that I'm not locked into a single tool

## Core Features

### 1. Directory-Based Session Discovery

Automatically discovers and lists all agent sessions found in a given project directory.

**Why it matters:** Developers work in project directories. The entry point must match their mental model — open a folder, see all agent sessions.

**Functional requirements:**
1. The user can specify or open a project directory as the starting point
2. The system scans for agent session directories (Copilot's `.github/copilot/sessions/` structure as primary)
3. Sessions are presented in a list view sorted by most recent modification/creation date
4. Each session entry displays: modification/creation date, session ID, and session name/summary
5. The session list updates if the user switches directories

### 2. Session Plan Viewer

Displays the execution plan (`plan.md`) for a selected session in a readable, navigable format.

**Why it matters:** The plan is the core artifact developers want to review — it reveals what the agent intended to do and why.

**Functional requirements:**
1. Selecting a session from the list opens its plan in the main content area
2. The plan is rendered as formatted markdown with proper heading hierarchy
3. The plan viewer supports scrolling and navigation for long plans
4. If a session has no plan file, the viewer displays an appropriate empty state

### 3. Task List Display

Shows the tasks associated with a session's plan, with their current status.

**Why it matters:** Tasks are the actionable units within a plan. Developers need to see what was done, what's pending, and what failed.

**Functional requirements:**
1. Tasks are displayed alongside or within the plan view
2. Each task shows its status (completed, pending, in-progress, or other states present in the session data)
3. Task information is read from the session's task data files
4. Tasks are presented in their logical order as defined by the session

### 4. Multi-Line Plan Annotations

Enables developers to select lines in a plan and attach annotation comments for their own reference.

**Why it matters:** This is the "write" half of the core workflow. Developers need to record their observations, corrections, and intentions about agent-generated plans — without affecting the agent's files.

**Functional requirements:**
1. The user can select one or more consecutive lines in the plan viewer
2. After selecting lines, the user can create an annotation comment that covers all selected lines
3. Annotations are stored separately from the original session files (developer-only, agents do not see them)
4. Annotations follow the existing `.comments.json` sidecar format already used in Arandu
5. Existing annotations are visually indicated on their associated lines when viewing a plan
6. The user can view, and re-read previously created annotations

### 5. Agent-Agnostic Session Layout

The UI presents sessions in a format that does not hardcode Copilot-specific labels or structures, enabling future agent support.

**Why it matters:** ACP is being adopted by multiple tools. The POC should validate a universal browsing concept, not just a Copilot viewer.

**Functional requirements:**
1. Session list and detail views use generic labels (e.g., "Session," "Plan," "Tasks") rather than Copilot-specific terminology
2. The session data display adapts gracefully when certain fields are absent (not all agents produce identical session structures)
3. Copilot is the fully supported format; other agent formats may display partial information without errors

## User Experience

### Visual Identity

- **Fresh design language**: The POC introduces a new visual identity for Arandu, distinct from the current Tauri app's dark theme
- **Independent evolution**: The design can evolve independently from the existing Tauri app, serving as a design exploration for Arandu's future direction
- **Professional and minimal**: The interface should prioritize readability and clarity, suitable for developers reviewing detailed plans and code-adjacent content

### Layout and Navigation

- **Sidebar + content pattern**: A sidebar lists sessions; the main content area displays the selected session's plan and tasks
- **Directory as entry point**: The initial interaction is selecting or specifying a project directory
- **Session list as primary navigation**: The sidebar session list shows date, ID, and summary — enabling quick scanning and selection
- **Plan as the focal point**: The main content area is dominated by the plan viewer, with tasks integrated contextually

### Annotation Workflow

- **Multi-line selection**: The user selects one or more lines in the plan, matching the existing Arandu comment pattern
- **Inline annotation creation**: After selecting lines, a comment input appears to create the annotation
- **Visual indicators**: Lines with existing annotations are visually marked so the user knows where comments exist
- **Non-destructive**: All annotations are stored separately — the original session files remain untouched

### Accessibility and Usability

- Keyboard navigation support for session list and plan viewer
- Sufficient color contrast in the new design language
- Responsive layout for different screen sizes
- Clear loading and empty states for sessions, plans, and tasks

## Non-Goals (Out of Scope)

- **Real-time agent control**: This POC does not send commands to agents or control their behavior in real time — it is a review and annotation tool
- **Agent write-back**: Annotations are developer-only; the system does not write comments back into session files for agents to consume
- **Full multi-agent support**: While the UI is agent-agnostic, only Copilot sessions are fully supported in the MVP. Other agent formats may work partially but are not guaranteed
- **Replacing the Tauri app**: The existing Tauri app with markdown viewer and whisper remains the main product. This POC is a separate validation exercise
- **Session creation or editing**: The POC does not create, modify, or delete agent sessions — it is a read-only browser with annotation overlay
- **Events or checkpoint viewing**: The POC focuses on plans and tasks. Detailed event logs (`events.jsonl`), checkpoints, and research artifacts are out of scope for this phase
- **User authentication or multi-user collaboration**: The POC is a single-developer, local tool
- **Mobile or tablet optimization**: The target is desktop developers working in their IDE environment