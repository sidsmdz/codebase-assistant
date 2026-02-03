# AutoForge - AI Code Assistant with Codebase Knowledge Base

**v0.2.0** | VS Code Extension | GitHub Copilot Integration

AutoForge is a VS Code extension that scans your workspace, builds a knowledge base of features and components, then uses this context to power intelligent AI conversations through GitHub Copilot.

## What It Does

1. **Scans your codebase** - Parses Java, TypeScript, and JavaScript files into ASTs
2. **Discovers features** - Traces dependencies from controllers through services to repositories, grouping components into end-to-end features
3. **Tracks data flows** - Maps calls, imports, injections, and events between components

## Why AutoForge? What Plain Copilot Can't Do

GitHub Copilot is powerful, but it works file-by-file. It sees your current editor tab and maybe a few open files. It doesn't understand your architecture. AutoForge fixes that by building a **persistent knowledge base** of your entire codebase and feeding Copilot the right context automatically.

| Capability | Plain Copilot (@workspace) | AutoForge + Copilot |
|---|---|---|
| **Context scope** | Current file + open tabs | Full knowledge base: all features, components, data flows across every file |
| **Feature awareness** | None - treats files individually | Auto-discovers end-to-end features (Controller → Service → Repository) |
| **Dependency tracing** | Implicit from imports in visible files | Explicit dependency graph across all files, modules, and languages |
| **Data flow visibility** | None | Maps calls, injections, events, imports between components with flow diagrams |
| **Prompt quality** | Your raw question + file snippets | Enriched prompt with architecture layers, flow diagrams, entry points, annotations |
| **Search** | Keyword/filename matching | Hybrid search: AST structure + BM25 relevance ranking + fuzzy matching |
| **Architecture knowledge** | Infers from code patterns | Knows component types, frameworks, design patterns, entry points explicitly |
| **Conversation context** | Per-message, no memory | Stateful history with feature context carried across follow-ups |

### How It Works Under the Hood

When you ask a question, AutoForge doesn't just forward it to Copilot.

1. **Searches the knowledge base** using hybrid search (AST + BM25 + fuzzy) to find relevant features
2. **Builds a rich prompt** with the matching feature's full context:
   - Data flow diagram showing how components connect
   - All component code, sorted by architectural layer (entry point → service → data access)
   - Dependency and reverse-dependency lists
   - Framework annotations and entry point markers
3. **Sends the enriched prompt** to Copilot, so it generates code that follows your project's actual patterns

The result: Copilot responses that understand your architecture, follow your conventions, and reference your actual components - not generic examples.

> For a visual walkthrough, open `demo/autoforge-demo.html` in a browser.

## Quick Start

```bash
# Install dependencies
npm install

# Build the extension

# Run in VS Code
# Press F5 to launch Extension Development Host
```

### First Use

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **AutoForge: Index Workspace** to scan your codebase
3. Open the AutoForge sidebar panel to start chatting
4. Click **Browse Features** to explore what was discovered

## Commands

| Command | Description |
|---------|-------------|
| `AutoForge: Open Chat` | Open the AI chat sidebar |
| `AutoForge: Show KB Stats` | Display features, components, data flows, languages, frameworks |
| `AutoForge: List Saved Patterns` | Browse features with quick pick - view components, data flow, details |
| `AutoForge: Reset Knowledge Base` | Clear all indexed data |

## Features

### Workspace Scanning & Feature Discovery
- Parses `.java`, `.ts`, `.tsx`, `.js`, `.jsx` files
- Identifies 18 component types: controller, service, repository, model, component, hook, api-client, event-handler, middleware, config, util, builder, factory, strategy, observer, singleton, adapter
- Tracks 5 dependency types: import, inject, call, extend, implement
- Incremental indexing with SHA-256 change detection
- Protocol Buffer parser for cross-language gRPC tracking

### Feature Browser
- Visual modal with search, filter by language, sort by name/language/recency
- Group by feature toggle
- Per-feature action buttons: **View**, **Explain**, **Fix**, **Recreate**, **Ask**
- Each action sends the full feature context (code, data flow, dependencies) to Copilot

### AI Chat
- Context-aware conversations powered by GitHub Copilot
- Conversation history for follow-up questions
- Syntax-highlighted code blocks with language labels and copy buttons
- Quick follow-up actions: Explain, Find Bugs, Refactor, Write Tests, Recreate Steps, Enhance, Document
- Rich prompt includes: data flow diagram, component layers sorted by architecture, entry points, dependencies, reverse dependencies, annotations

### Knowledge Base Stats
- Features, components, data flow connections
- Breakdown by language, component type, framework
- Top tags and indexed file count
- Header bar showing live counts

## Project Structure

```
src/
  extension.ts                 # Extension activation, command registration
  chatViewProvider.ts          # Chat webview UI, message handling, Copilot integration
  ingestionService.ts          # Workspace scanning orchestration
  config.ts                    # VS Code settings configuration

  analysis/
    FeatureAnalyzer.ts         # Component detection, dependency graphing, feature grouping

  knowledgeBase/
    KnowledgeBaseManager.ts    # SQLite DB (sql.js), CRUD, stats, search
    ContextBuilder.ts          # Builds rich prompts from features for Copilot

  parsers/
    ASTParser.ts               # Base parser interface
    JavaASTParser.ts            # Java AST parsing (java-parser)
    TypeScriptASTParser.ts      # TS/JS AST parsing (@babel/parser)
    ProtoParser.ts              # Protocol Buffer parsing

  search/
    BM25.ts                    # BM25 ranking algorithm
    Tokenizer.ts               # Text tokenization
    QueryParser.ts             # Query parsing and analysis
    ASTSearchEngine.ts         # AST-based code search
    HybridSearchEngine.ts      # Combined search (AST + BM25 + fuzzy)

  indexing/
    ASTIndexer.ts              # AST node indexing
    TermIndexer.ts             # BM25 term indexing

demo/
  autoforge-demo.html           # Auto-playing presentation with UI mockups
```

## Tech Stack

| Technology | Purpose |
|------------|---------|
| TypeScript | Core language |
| VS Code Extension API | Extension host, webview, language model API |
| SQL.js (SQLite) | In-memory knowledge base (11 tables) |
| @babel/parser | TypeScript/JavaScript AST parsing |
| java-parser | Java AST parsing |
| BM25 | Full-text search ranking |
| vscode.lm API | GitHub Copilot model integration with fallback |
| esbuild | Fast bundling |

## Database Schema

The knowledge base uses 11 SQLite tables:

- **features** - Discovered features with entry points, languages, frameworks, data flow
- **feature_components** - Individual components with code, dependencies, annotations
- **feature_component_map** - Feature-to-component relationships
- **patterns** - User-saved code patterns
- **ast_nodes** - Parsed syntax tree nodes
- **term_index** - BM25 full-text search index
- **doc_stats / collection_stats** - Search ranking statistics
- **indexed_files** - File tracking for incremental indexing

## Roadmap

### Agentic Mode (Planned)

AutoForge currently sends one-shot enriched prompts to Copilot. Agentic Mode will enable autonomous multi-step task execution where the AI reasons, acts, observes results, and iterates.

**Capabilities:**
- **Tool-use loop** - The agent iterates: reason → pick tool → execute → observe → reason again, until the task is complete
- **Available tools** - File read/write, terminal commands, Copilot queries, knowledge base search, test runner, git operations
- **Multi-step tasks** - "Refactor this feature" becomes: analyze current code → plan changes → edit files → run tests → fix failures → commit
- **Decision making** - The agent inspects intermediate results (test output, lint errors, build logs) and adapts its plan
- **Feature-aware refactoring** - Uses the knowledge base to understand which components are affected, traces the full dependency chain before making changes
- **Safety guards** - Requires user confirmation before destructive operations (file writes, git push, deletions)

**Planned architecture:**
- `AgentLoop` - Manages the reason-act-observe cycle with configurable step limit
- `ToolRegistry` - Registers available tools (FileReadTool, FileWriteTool, TerminalTool, CopilotTool, KBSearchTool)
- `PlanExecutor` - Breaks high-level user requests into discrete steps using KB context
- `SafetyGuard` - Confirmation prompts before destructive operations

### Enhanced Feature Tracking (Planned)

- **Design pattern recognition** - Detect Builder, Factory, Strategy, Observer, Singleton, Adapter patterns by structure, not just naming
- **Feature merging** - Automatically group related entry points (e.g., `OrderController` + `OrderWebSocket` → "Order Management")
- **Cross-language feature tracing** - Features spanning Java backends + TypeScript frontends via shared API contracts and Proto definitions
- **Shared component awareness** - Services used by multiple features are tracked across all of them, not just the first

## Requirements

- VS Code 1.90+
- [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) extension installed and active

## Development

```bash
npm install          # Install dependencies
npm run compile      # Build (type-check + lint + esbuild)
npm run watch        # Watch mode for development
```

Press `F5` in VS Code to launch the Extension Development Host for testing.
