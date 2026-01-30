# OpenCat - AI Code Assistant with Codebase Knowledge Base

**v0.2.0** | VS Code Extension | GitHub Copilot Integration

OpenCat is a VS Code extension that scans your workspace, builds a knowledge base of features, components, and data flows, then uses this context to power intelligent AI conversations through GitHub Copilot.

## What It Does

1. **Scans your codebase** - Parses Java, TypeScript, and JavaScript files into ASTs
2. **Discovers features** - Traces dependencies from controllers through services to repositories, grouping components into end-to-end features
3. **Tracks data flows** - Maps calls, imports, injections, and events between components
4. **Powers AI chat** - Sends rich feature context (code, data flows, dependencies, entry points) to GitHub Copilot for context-aware responses

## Quick Start

```bash
# Install dependencies
npm install

# Build the extension
npm run compile

# Run in VS Code
# Press F5 to launch Extension Development Host
```

### First Use

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **OpenCat: Index Workspace** to scan your codebase
3. Open the OpenCat sidebar panel to start chatting
4. Click **Browse Features** to explore what was discovered

## Commands

| Command | Description |
|---------|-------------|
| `OpenCat: Index Workspace` | Scan all source files, build AST, discover features and data flows |
| `OpenCat: Open Chat` | Open the AI chat sidebar |
| `OpenCat: Show KB Stats` | Display features, components, data flows, languages, frameworks |
| `OpenCat: List Saved Patterns` | Browse features with quick pick - view components, data flow, details |
| `OpenCat: Reset Knowledge Base` | Clear all indexed data |

## Features

### Workspace Scanning & Feature Discovery
- Parses `.java`, `.ts`, `.tsx`, `.js`, `.jsx` files
- Identifies 12 component types: controller, service, repository, model, component, hook, api-client, event-handler, middleware, config, util
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
  opencat-demo.html           # Auto-playing presentation with UI mockups
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
