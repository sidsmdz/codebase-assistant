# AutoForge V2 Implementation Plan

## Phase 1: Foundation & Context Provider (Current Sprint)

### Goal
Create minimal chat participant with enhanced session management and automatic context enrichment.

### Tasks

#### 1.1 Enhanced Session Management ✅ **START HERE**
**Files to Create:**
- `src/session/SessionV2.ts` - New session interface with rich context
- `src/session/SessionStore.ts` - Local storage implementation
- `src/session/SessionTracker.ts` - Automatic interaction tracking
- `src/session/SessionContextBuilder.ts` - Build context from session

**Reuse from V1:**
- `src/SessionManager.ts` - Adapt to new interface

**Implementation:**
```typescript
// Enhanced session schema
interface SessionV2 {
    id: string;
    name: string;
    workspace: string;
    
    // Rich context tracking
    context: {
        features: Set<string>;
        components: Set<string>;
        files: Set<string>;
        patterns: Set<string>;
    };
    
    // Timeline of interactions
    timeline: Array<{
        timestamp: Date;
        type: 'scan' | 'query' | 'find' | 'map';
        query: string;
        kbContext: { features: string[]; components: string[] };
        result?: string;
    }>;
    
    // Message history with KB references
    messages: Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp: Date;
        kbReferences?: { features: Feature[]; components: Component[] };
    }>;
}
```

#### 1.2 Unified Search (Features + Components)
**Files to Create:**
- `src/search/UnifiedSearch.ts` - Search both features AND components

**Enhance:**
- `src/knowledgeBase/KnowledgeBaseManager.ts` - Add `searchComponents()` method

**Implementation:**
```typescript
// New method in KnowledgeBaseManager
async searchComponents(query: string, limit: number): Promise<Component[]> {
    // Search by component name, type, file path
    // Use hybrid search (AST + BM25)
}

// Unified search
async search(query: string): Promise<{
    features: Feature[];
    components: Component[];
}> {
    const [features, components] = await Promise.all([
        this.searchFeatures(query, 5),
        this.searchComponents(query, 10)
    ]);
    return { features, components };
}
```

#### 1.3 Minimal Chat Participant (5 Commands Only)
**Files to Refactor:**
- `src/chatParticipant/index.ts` - Simplify to 5 commands
- Delete complex handlers: `generateHandler.ts`, `implementHandler.ts`, `askHandler.ts`

**Keep & Enhance:**
- `scanHandler.ts` - Reuse as-is
- `findHandler.ts` - NEW: Unified search (features + components)
- `mapHandler.ts` - NEW: Visualize feature/component relationships
- `sessionHandler.ts` - ENHANCE: Rich session switching
- `sessionsHandler.ts` - ENHANCE: Show timeline

**Commands:**
1. `/scan` - Index codebase
2. `/find <query>` - Search features AND components
3. `/map <name>` - Visualize architecture
4. `/session [name]` - Switch/create session with context load
5. `/sessions` - List sessions with preview

#### 1.4 Context Injection via Chat Variables
**Files to Create:**
- `src/contextProvider/ChatVariables.ts` - Register chat variables

**Implementation:**
```typescript
// Users can type: @workspace implement auth using #kb:authentication
// #kb:authentication resolves to AutoForge KB context

vscode.chat.registerChatVariableResolver('kb', async (name, token) => {
    // name = "authentication" or "OrderService"
    const results = await kbManager.search(name);
    
    return [{
        level: vscode.ChatVariableLevel.Full,
        value: buildContextString(results),
        description: `KB context for ${name}`
    }];
});
```

#### 1.5 Session Auto-Tracking
**Files to Create:**
- `src/session/InteractionTracker.ts` - Track all KB interactions

**Hook into:**
- Every `/find` call
- Every `/map` call
- Every chat variable resolution

```typescript
// Automatically track interactions
class InteractionTracker {
    async trackInteraction(entry: {
        type: 'scan' | 'find' | 'map' | 'variable';
        query: string;
        kbContext: { features: string[]; components: string[] };
    }) {
        const session = await sessionManager.getCurrentSession();
        session.timeline.push({
            timestamp: new Date(),
            ...entry
        });
        await sessionStore.save(session);
    }
}
```

---

## Phase 2: Enhanced Search & Visualization (Next Sprint)

### 2.1 Component-Level Search Results
- Show component details in `/find`
- File path, type, methods, relationships
- "Insert as context" button

### 2.2 Architecture Map Visualization
- `/map <feature>` - ASCII art flow diagram
- Component relationships
- Data flow visualization

### 2.3 Session Timeline UI
- Show step-by-step progression
- "Jump to point" functionality
- Context preview

---

## Phase 3: MCP Integration (Future)

### 3.1 MCP Server
- Expose KB via Model Context Protocol
- Tools: search_kb, get_feature, trace_component
- Enable multi-tool access

### 3.2 Server Storage (Optional)
- REST API for session storage
- Team collaboration
- Cross-machine sync

---

## Migration Strategy

### What to Keep
✅ Core KB infrastructure
- `KnowledgeBaseManager.ts`
- `FeatureAnalyzer.ts`
- `HybridSearchEngine.ts`
- `ASTParser.ts`, `ASTIndexer.ts`, `TermIndexer.ts`
- Tree providers

### What to Refactor
🔄 Session management → Enhanced with rich context
🔄 Chat participant → Minimal (5 commands)
🔄 Search → Add component-level search

### What to Delete
❌ `generateHandler.ts` - Not needed
❌ `implementHandler.ts` - Not needed
❌ `askHandler.ts` - Not needed
❌ `explainHandler.ts` - Not needed
❌ `analyzeHandler.ts` - Use `/find` instead
❌ `traceHandler.ts` - Use `/map` instead
❌ `impactHandler.ts` - Use `/map` instead
❌ `featuresHandler.ts` - Use `/find` instead
❌ `statsHandler.ts` - Not essential
❌ `resetHandler.ts` - Rarely used
❌ `modulesHandler.ts` - Use `/find` instead
❌ `tokenManager.ts` - Copilot handles tokens
❌ `disambiguator.ts` - Simplify
❌ `continueHandler.ts` - Not needed

---

## File Structure (V2)

```
src/
├── extension.ts                    # Entry point (minimal changes)
├── chatParticipant/
│   ├── index.ts                    # Minimal participant (5 commands)
│   ├── handlers/
│   │   ├── scanHandler.ts          # Keep as-is
│   │   ├── findHandler.ts          # NEW: Unified search
│   │   ├── mapHandler.ts           # NEW: Visualization
│   │   ├── sessionHandler.ts       # ENHANCE: Context loading
│   │   └── sessionsHandler.ts      # ENHANCE: Timeline view
│   └── utilities/
│       └── helpers.ts              # Keep selectModel, getCodeSelection
│
├── session/                        # NEW: Enhanced sessions
│   ├── SessionV2.ts                # Interface
│   ├── SessionStore.ts             # Local storage
│   ├── SessionTracker.ts           # Auto-tracking
│   └── SessionContextBuilder.ts    # Context restoration
│
├── contextProvider/                # NEW: Context injection
│   ├── ChatVariables.ts            # #kb:name variable
│   └── InteractionTracker.ts      # Track all interactions
│
├── search/                         # ENHANCE
│   ├── UnifiedSearch.ts            # NEW: Features + Components
│   ├── HybridSearchEngine.ts       # Keep
│   ├── BM25.ts                     # Keep
│   └── QueryParser.ts              # Keep
│
├── knowledgeBase/                  # ENHANCE
│   ├── KnowledgeBaseManager.ts     # Add searchComponents()
│   └── ContextBuilder.ts           # Keep
│
├── analysis/                       # Keep as-is
│   ├── FeatureAnalyzer.ts
│   ├── ModuleDetector.ts
│   └── SelectionAnalyzer.ts
│
├── indexing/                       # Keep as-is
│   ├── ASTIndexer.ts
│   └── TermIndexer.ts
│
├── parsers/                        # Keep as-is
│   ├── ASTParser.ts
│   ├── JavaASTParser.ts
│   ├── TypeScriptASTParser.ts
│   └── ProtoParser.ts
│
└── mcp/                            # Future
    └── MCPServer.ts
```

---

## Success Metrics

### Simplicity
- [ ] Max 5 commands (currently 14)
- [ ] No manual context management
- [ ] Single conversation flow

### Effectiveness  
- [ ] Sessions restore full context
- [ ] Component-level search works
- [ ] Chat variables inject context easily

### Reusability
- [ ] Standard @workspace workflow
- [ ] Works with free/pro Copilot
- [ ] Session switching is instant

---

## Next Steps

1. ✅ Create `SessionV2.ts` interface
2. ✅ Implement `SessionStore.ts` (local storage)
3. ✅ Add `searchComponents()` to KnowledgeBaseManager
4. ✅ Create `UnifiedSearch.ts`
5. ✅ Implement `findHandler.ts` (unified search)
6. ✅ Implement `mapHandler.ts` (visualization)
7. ✅ Enhance `sessionHandler.ts` (context loading)
8. ✅ Implement `ChatVariables.ts` (#kb:name)
9. ✅ Remove old complex handlers
10. ✅ Test end-to-end workflow

Let's start with Step 1!
