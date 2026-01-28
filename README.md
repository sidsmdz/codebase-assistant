# OpenCat - AI-Powered Code Generation Assistant

> **Version 0.2.0** | VS Code Extension | Fully Air-Gapped

OpenCat is an intelligent code generation assistant that bridges GitHub Copilot with your company's code patterns. It enables context-aware code generation without external API calls, making it suitable for secure, air-gapped environments.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture & Techniques](#architecture--techniques)
3. [OpenCat vs Pure LLM Approach](#opencat-vs-pure-llm-approach)
4. [Features](#features)
5. [Installation & Setup](#installation--setup)
6. [Usage Guide](#usage-guide)
7. [Supported Languages](#supported-languages)
8. [Configuration](#configuration)
9. [Development](#development)

---

## Overview

### The Problem

Modern LLMs like GPT-4 and Claude are powerful but have limitations in enterprise settings:

- **No knowledge of internal patterns** - They don't know your company's coding standards
- **Inconsistent output** - Same prompt can yield different implementations
- **External API dependency** - Security concerns with sending code to external services
- **No learning from feedback** - They don't improve from your corrections

### The Solution

OpenCat creates a **local knowledge base** of your company's proven code patterns and uses them to guide GitHub Copilot's generation. This combines the power of LLMs with institutional knowledge.

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenCat Architecture                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Developer Query ──► Hybrid Search ──► Pattern Matching         │
│         │                   │                  │                 │
│         ▼                   ▼                  ▼                 │
│   "Create AG Grid    AST Search (50%)    Find relevant          │
│    with row styling" BM25 Search (30%)   patterns from KB        │
│                      Fuzzy Match (20%)                           │
│                            │                                     │
│                            ▼                                     │
│                   Context Builder                                │
│                   (Enriches prompt with patterns)                │
│                            │                                     │
│                            ▼                                     │
│                   GitHub Copilot                                 │
│                   (Generates code following patterns)            │
│                            │                                     │
│                            ▼                                     │
│                   Generated Code                                 │
│                   (Consistent with company standards)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture & Techniques

### 1. Hybrid Search Engine

OpenCat uses a **multi-strategy search approach** combining three techniques:

| Strategy | Weight | Description | Best For |
|----------|--------|-------------|----------|
| **AST Search** | 50% | Searches code structure (classes, methods, functions) | Finding specific implementations |
| **BM25 Search** | 30% | Text relevance ranking algorithm | Natural language queries |
| **Fuzzy Match** | 20% | Levenshtein distance matching | Typos, partial names |

**How it works:**

```typescript
// User query: "row styling for grid"
//
// AST Search finds:  getRowClass(), applyRowStyling()
// BM25 Search finds: Patterns mentioning "row", "styling", "grid"
// Fuzzy Match finds: "rowStyle", "gridStyle", "styleRow"
//
// Results are combined with weighted scores
```

### 2. Abstract Syntax Tree (AST) Parsing

Instead of treating code as text, OpenCat **understands code structure**:

| Language | Parser | Extracts |
|----------|--------|----------|
| Java | java-parser | Classes, methods, interfaces, annotations |
| TypeScript/JavaScript | @babel/parser | Functions, classes, React components, hooks |
| Protocol Buffers | Custom regex | Services, RPC methods, messages |

**Benefits:**
- Find "all methods that return UserResponse"
- Search by signature, not just name
- Understand inheritance and interfaces

### 3. BM25 Ranking Algorithm

**BM25 (Best Matching 25)** is an industry-standard ranking algorithm used by search engines:

```
Score(D,Q) = Σ IDF(qi) · (f(qi,D) · (k1 + 1)) / (f(qi,D) + k1 · (1 - b + b · |D|/avgdl))

Where:
- IDF = Inverse Document Frequency (rare terms score higher)
- f(qi,D) = Term frequency in document
- k1 = 1.5, b = 0.75 (tuning parameters)
- |D| = Document length, avgdl = Average document length
```

**Why BM25 over simple text search:**
- Handles document length normalization
- Rare terms get higher weight
- Balances term frequency saturation

### 4. Cross-Language Feature Tracking

For complex architectures (e.g., SDUI with gRPC), OpenCat traces features across the entire stack:

```
┌─────────────────────────────────────────────────────────────┐
│              End-to-End Feature Flow                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. TypeScript Trigger                                       │
│     📄 LayoutManager.tsx                                     │
│     🔧 handleRowSelected()                                   │
│     💡 await client.sendUserEvent(event)                     │
│                         │                                    │
│                         ▼                                    │
│  2. gRPC Definition                                          │
│     📄 layout.proto                                          │
│     🔧 rpc SendUserEvent(UserEvent) returns (LayoutResponse) │
│                         │                                    │
│                         ▼                                    │
│  3. Java Implementation                                      │
│     📄 LayoutController.java                                 │
│     🔧 handleUserEvent()                                     │
│     🏷️ @Service, @Transactional                              │
│                         │                                    │
│                         ▼                                    │
│  4. UI Update                                                │
│     📄 LayoutManager.tsx                                     │
│     🔧 setLayout(response.layout)                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5. Incremental Indexing

OpenCat uses **content hashing** to avoid re-indexing unchanged files:

```typescript
// File tracking in SQLite
{
  filePath: "src/UserService.java",
  contentHash: "sha256:a1b2c3...",
  lastIndexed: "2024-01-15T10:30:00Z",
  nodeCount: 12
}

// On re-index:
// 1. Calculate current hash
// 2. Compare with stored hash
// 3. Skip if unchanged, re-index if different
```

---

## OpenCat vs Pure LLM Approach

### Comparison Matrix

| Aspect | Pure LLM (GPT-4/Claude) | OpenCat + Copilot |
|--------|------------------------|-------------------|
| **Company Pattern Knowledge** | ❌ None - must provide in every prompt | ✅ Learns and stores patterns locally |
| **Consistency** | ⚠️ Variable - different outputs each time | ✅ Consistent - guided by known patterns |
| **Security** | ⚠️ Code sent to external APIs | ✅ Fully local - air-gapped ready |
| **Context Window** | ⚠️ Limited (8K-128K tokens) | ✅ Unlimited - indexed in local DB |
| **Learning** | ❌ No memory between sessions | ✅ Patterns saved and improved over time |
| **Search Precision** | ⚠️ Semantic only | ✅ Structural + Semantic + Fuzzy |
| **Cross-Language Tracing** | ❌ Cannot trace flows | ✅ TypeScript → Proto → Java |
| **Cost** | 💰 Per-token API costs | ✅ One-time Copilot license |
| **Latency** | ⚠️ Network-dependent | ✅ Local search + Copilot |
| **Customization** | ⚠️ Prompt engineering only | ✅ Indexed patterns + prompts |

### When to Use OpenCat

**Best for:**
- ✅ Enterprise codebases with established patterns
- ✅ Air-gapped or high-security environments
- ✅ Teams wanting consistent code generation
- ✅ Complex architectures (microservices, gRPC, SDUI)
- ✅ Onboarding developers to existing patterns

**Consider alternatives when:**
- ⚠️ Greenfield projects with no existing patterns
- ⚠️ One-off code generation tasks
- ⚠️ Exploratory/prototyping work

### Advantages of OpenCat's Approach

#### 1. Pattern Reuse Over Regeneration

```
Pure LLM:
  "Create a Spring controller for users"
  → Generates generic controller (may not match your style)

OpenCat:
  "Create a Spring controller for users"
  → Finds your existing UserController, OrderController patterns
  → Generates controller matching your @Annotations, error handling, logging
```

#### 2. Institutional Memory

```
Day 1: Developer saves "AG Grid with row coloring" pattern
Day 30: New developer asks "How do we style grid rows?"
       → OpenCat finds the pattern instantly
       → Copilot generates matching code
```

#### 3. Deterministic Search

```
LLM Search (Semantic):
  Query: "row styling"
  Results: Unpredictable, may miss exact matches

OpenCat Search (Hybrid):
  Query: "row styling"
  Results:
    1. getRowClass() method [AST: exact match]
    2. "Row Styling Pattern" [BM25: text match]
    3. "rowStyle" function [Fuzzy: partial match]
```

### Limitations & Trade-offs

| OpenCat Limitation | Mitigation |
|-------------------|------------|
| Requires initial pattern indexing | One-time workspace scan (~30s for 1000 files) |
| Only as good as saved patterns | Learning loop improves patterns over time |
| Copilot dependency | Works offline once patterns are indexed |
| Language support limited | Extensible parser architecture (add new parsers) |

---

## Features

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **🔍 Pattern Search** | Hybrid AST + BM25 + Fuzzy search across your codebase |
| **📚 Knowledge Base** | SQLite-powered local storage for patterns |
| **💬 Chat Interface** | Natural language interaction in VS Code |
| **🎨 Pattern Browser** | Visual UI to browse, filter, and manage patterns |
| **📊 Statistics** | Track patterns by language, tags, usage |
| **🔄 Learning Loop** | Save successful generations as new patterns |

### Pattern Browser

```
┌─────────────────────────────────────────────────────────────┐
│  📚 Knowledge Base Patterns                             ✕   │
├─────────────────────────────────────────────────────────────┤
│  🔍 Search patterns by name, tag, language...              │
│  [All Features ▼] [All Languages ▼] [Most Recent ▼]        │
│  ☑ Group by Feature                                         │
├─────────────────────────────────────────────────────────────┤
│  Showing 14 of 14 patterns                                  │
├─────────────────────────────────────────────────────────────┤
│  AG Grid (3)                                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ Row Styling  │ │ Column Defs  │ │ Pagination   │        │
│  │ java         │ │ typescript   │ │ typescript   │        │
│  │ 👁️ 💬 🗑️     │ │ 👁️ 💬 🗑️     │ │ 👁️ 💬 🗑️     │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### Cross-Language Feature Tracking

Track features across your entire stack:

```bash
# Example: Trace "updateLayout" feature

1️⃣ TypeScript Trigger
   📄 File: LayoutManager.tsx:42
   🔧 Function: handleLayoutUpdate
   💡 Call: await layoutClient.updateLayout(request)

2️⃣ gRPC Definition
   📄 File: layout.proto:15
   🔧 Method: UpdateLayout
   📥 Input: LayoutRequest
   📤 Output: LayoutResponse (server streaming)

3️⃣ Java Implementation
   📄 File: LayoutServiceImpl.java:156
   🔧 Class: LayoutServiceImpl
   🏷️ Annotations: @Override, @Transactional

4️⃣ UI Update
   📄 File: LayoutManager.tsx:48
   🔧 Update: setLayout(response.layout)
```

---

## Installation & Setup

### Prerequisites

- VS Code 1.90.0 or higher
- GitHub Copilot extension (licensed)
- Node.js 18+ (for development)

### Installation

1. **Download the VSIX package:**
   ```
   codebase-assistant-0.2.0.vsix
   ```

2. **Install in VS Code:**
   - Open Extensions panel (`Ctrl+Shift+X`)
   - Click `...` → `Install from VSIX...`
   - Select the downloaded file

3. **Reload VS Code**

4. **Verify installation:**
   - Open Command Palette (`Ctrl+Shift+P`)
   - Run `OpenCat: Show KB Stats`

### Initial Setup

1. **Index your workspace:**
   ```
   Command Palette → OpenCat: Index Workspace
   ```
   This scans all Java, TypeScript, and JavaScript files.

2. **Open the chat panel:**
   ```
   Command Palette → OpenCat: Open Chat
   ```

3. **Start asking questions:**
   ```
   "How do we implement row styling in AG Grid?"
   ```

---

## Usage Guide

### Basic Workflow

```
1. INDEX      → Scan workspace to build knowledge base
2. SEARCH     → Ask questions, find patterns
3. GENERATE   → Copilot generates code using patterns
4. SAVE       → Save good generations as new patterns
5. IMPROVE    → Patterns get better over time
```

### Example Queries

| Query | What OpenCat Does |
|-------|-------------------|
| "Create a REST controller for products" | Finds existing controllers, matches annotations and style |
| "AG Grid with custom row styling" | Finds AG Grid patterns, row class implementations |
| "How does the payment flow work?" | Traces across TS → gRPC → Java |
| "WebSocket reconnection logic" | Finds WebSocket patterns with error handling |

### Saving Patterns

After Copilot generates code:

1. Click **💾 Save Pattern** button
2. Fill in:
   - **Name:** Descriptive name (e.g., "AG Grid Row Styling")
   - **Description:** What it does
   - **Tags:** Comma-separated (e.g., "ag-grid, styling, java")
3. Click **Save**

### Browsing Patterns

1. Click **📚 Browse Knowledge Base** on welcome screen
2. Use filters:
   - **Search:** Text search across names, tags
   - **Feature:** Filter by feature category
   - **Language:** Filter by programming language
   - **Sort:** By date, name, or language
3. Actions:
   - **👁️ View:** Display pattern in chat
   - **💬 Use:** Insert into input field
   - **🗑️ Delete:** Remove pattern

---

## Supported Languages

| Language | Parser | Extracts |
|----------|--------|----------|
| **Java** | java-parser | Classes, methods, interfaces, enums, annotations |
| **TypeScript** | @babel/parser | Functions, classes, interfaces, React components |
| **JavaScript** | @babel/parser | Functions, classes, ES6 modules |
| **JSX/TSX** | @babel/parser | React components, hooks, JSX elements |
| **Protocol Buffers** | Custom | Services, RPC methods, messages, fields |

### Framework Detection

OpenCat automatically detects:

- **Java:** Spring Boot, gRPC
- **TypeScript/JavaScript:** React, Angular, Express, NestJS
- **Python:** Flask, Django, FastAPI (detection only)

---

## Configuration

### VS Code Settings

```json
{
  "opencat.framework.language": "java",
  "opencat.framework.types": ["server", "grpc", "api"],
  "opencat.ingestion.include": ["**/*.java", "**/*.ts", "**/*.tsx"]
}
```

### Search Tuning

The hybrid search weights can be adjusted in code:

```typescript
// Current defaults (search/HybridSearchEngine.ts)
const weights = {
  ast: 0.5,      // Structural matching
  bm25: 0.3,    // Text relevance
  fuzzy: 0.2    // Approximate matching
};

// Field boosts
const boosts = {
  identifier: 3.0,  // Method/class names
  description: 1.2, // Pattern descriptions
  code: 1.0,        // Actual code
  tags: 1.5         // Pattern tags
};
```

---

## Development

### Building from Source

```bash
# Clone repository
git clone https://github.com/sidsmdz/codebase-assistant.git
cd codebase-assistant

# Install dependencies
npm install

# Compile
npm run compile

# Run tests
npm test

# Package extension
npm run package
```

### Running Tests

```bash
# All tests
npm test

# Specific test suite
npm test -- knowledge-base.test.ts
npm test -- sdui-feature-tracking.test.ts

# With coverage
npm test -- --coverage
```

### Project Structure

```
src/
├── extension.ts                 # Extension entry point
├── chatViewProvider.ts          # WebView UI (~2,000 lines)
├── ingestionService.ts          # Workspace indexing
├── config.ts                    # Configuration loader
├── knowledgeBase/
│   ├── KnowledgeBaseManager.ts  # SQLite pattern storage
│   └── ContextBuilder.ts        # Prompt enrichment
├── parsers/
│   ├── ASTParser.ts             # Base parser interface
│   ├── JavaASTParser.ts         # Java parser
│   ├── TypeScriptASTParser.ts   # TS/JS parser
│   └── ProtoParser.ts           # Protocol Buffer parser
├── search/
│   ├── HybridSearchEngine.ts    # Combined search
│   ├── ASTSearchEngine.ts       # Structural search
│   ├── BM25.ts                  # Text ranking
│   ├── QueryParser.ts           # Intent recognition
│   └── Tokenizer.ts             # Text processing
├── indexing/
│   ├── ASTIndexer.ts            # Node indexing
│   └── TermIndexer.ts           # BM25 term indexing
├── analysis/
│   └── FeatureTracker.ts        # Cross-language tracing
└── test/
    ├── knowledge-base.test.ts   # KB integration tests
    └── sdui-feature-tracking.test.ts
```

---

## Technical Specifications

### Database Schema (SQLite/sql.js)

| Table | Purpose |
|-------|---------|
| `patterns` | Stored code patterns with metadata |
| `ast_nodes` | Indexed AST nodes (classes, methods, functions) |
| `term_index` | BM25 inverted index |
| `doc_stats` | Document length statistics |
| `collection_stats` | Collection-wide stats |
| `indexed_files` | File tracking with content hashes |

### Performance Characteristics

| Operation | Typical Time |
|-----------|--------------|
| Index 1,000 files | ~30 seconds |
| Search query | <100ms |
| Pattern save | <50ms |
| Full KB stats | <200ms |

### Memory Usage

- SQLite database: ~1MB per 1,000 patterns
- In-memory during search: ~50MB typical
- No persistent background processes

---

## License

Proprietary - Internal Use Only

---

## Support

- **GitHub Issues:** [github.com/sidsmdz/codebase-assistant/issues](https://github.com/sidsmdz/codebase-assistant/issues)
- **Documentation:** See `/docs` folder in repository

---

*Built with TypeScript, sql.js, and VS Code Extension API*
