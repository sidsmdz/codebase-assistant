# AutoForge V2 Architecture - Context Provider + Smart Sessions

## 🎯 Design Philosophy

**AutoForge enriches GitHub Copilot, doesn't replace it.**

- **Simple:** 5 commands max
- **Automatic:** Context injection via VS Code API
- **Smart:** Rich session management for context restoration
- **Integrated:** Piggyback on Copilot infrastructure

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────┐
│         User Types in Copilot           │
│    @workspace implement authentication  │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│   VS Code Chat Context Provider API     │
│        (AutoForge registers here)       │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│      AutoForge Context Provider         │
│  1. Get current session context         │
│  2. Search KB for relevant features     │
│  3. Merge session + KB context          │
│  4. Return enriched context to Copilot  │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         Copilot with Rich Context       │
│  Generates code with architecture       │
│  awareness + session continuity         │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│      AutoForge Session Tracker          │
│  Records interaction in session         │
│  - What was asked                       │
│  - What KB context was used             │
│  - What was generated                   │
│  - Files modified                       │
└─────────────────────────────────────────┘
```

---

## 📦 Component Structure

### **1. Core Components (Reuse from V1)**
- ✅ `KnowledgeBaseManager` - SQLite + AST + BM25 search
- ✅ `FeatureAnalyzer` - Detect features and components
- ✅ `HybridSearchEngine` - Search features and components
- ✅ `ASTParser` - Parse Java/TypeScript/JavaScript
- ✅ Tree providers - KB and Session visualization

### **2. New Components**

#### **ContextProvider** (NEW)
```typescript
// src/contextProvider/ContextProvider.ts
export class ContextProvider {
    async provideChatContext(
        query: string,
        token: CancellationToken
    ): Promise<ChatContext> {
        // 1. Get active session
        const session = await this.sessionManager.getCurrentSession();
        
        // 2. Search KB
        const kbResults = await this.searchKB(query, session);
        
        // 3. Build enriched context
        return this.buildContext(session, kbResults);
    }
}
```

#### **SessionManager V2** (ENHANCED)
```typescript
// src/session/SessionManager.ts
export interface Session {
    id: string;
    name: string;
    createdAt: Date;
    lastAccessedAt: Date;
    
    // Rich context
    context: {
        features: string[];
        components: string[];
        files: string[];
        patterns: string[];
    };
    
    // Step-by-step timeline
    timeline: TimelineEntry[];
    
    // Enhanced message history
    messages: EnrichedMessage[];
}

export class SessionManager {
    async switchSession(id: string): Promise<void>;
    async createSession(name: string): Promise<Session>;
    async captureInteraction(entry: TimelineEntry): Promise<void>;
    async getSessionContext(id: string): Promise<string>;
}
```

#### **SessionStore** (NEW)
```typescript
// src/session/SessionStore.ts
export class SessionStore {
    constructor(config: {
        localPath: string;
        serverUrl?: string;
        syncMode: 'local' | 'server' | 'hybrid';
    });
    
    async save(session: Session): Promise<void>;
    async load(id: string): Promise<Session>;
    async list(workspace: string): Promise<Session[]>;
    async delete(id: string): Promise<void>;
}
```

---

## 🎮 User Commands (Minimal)

### **Essential Commands (5 only)**

1. **`@autoforge /scan`**
   - Index codebase
   - Build knowledge base
   - Auto-detect features

2. **`@autoforge /find <query>`**
   - Search features and components
   - Show architecture details
   - Insert as context

3. **`@autoforge /map <feature>`**
   - Visualize feature flow
   - Show component relationships
   - Display in chat

4. **`@autoforge /session [name]`**
   - Switch to session (if exists)
   - Create new session (if not exists)
   - Load session context automatically

5. **`@autoforge /sessions`**
   - List all sessions
   - Show session details
   - Quick switch

### **Removed Commands**
- ❌ `/generate` - Use @workspace directly
- ❌ `/implement` - Use @workspace directly
- ❌ `/ask` - Use @workspace directly
- ❌ `/explain` - Use @workspace directly
- ❌ `/analyze` - Use /find instead
- ❌ `/trace` - Use /map instead
- ❌ `/impact` - Use /map instead
- ❌ `/features` - Use /find instead
- ❌ `/stats` - Not essential
- ❌ `/reset` - Rarely used
- ❌ `/modules` - Use /find instead

---

## 🔄 User Workflows

### **Workflow 1: Starting Fresh**
```
1. User: @autoforge /scan
   → AutoForge indexes codebase

2. User: @workspace add authentication with JWT
   → AutoForge automatically:
     - Searches KB for auth-related features
     - Finds: existing security patterns, similar implementations
     - Injects context into Copilot
   → Copilot generates with architecture awareness
   → AutoForge tracks:
     - Created: AuthController, AuthService, JWTValidator
     - Session: "authentication-implementation"

3. User: @workspace add refresh token support
   → AutoForge:
     - Includes previous session context (AuthController, etc.)
     - Searches KB for token management patterns
   → Copilot continues coherently
```

### **Workflow 2: Resuming Work**
```
1. User opens VS Code next day

2. User: @autoforge /sessions
   → Shows: "authentication-implementation" (yesterday, 12 interactions)

3. User: @autoforge /session authentication-implementation
   → AutoForge loads:
     - 5 components (AuthController, AuthService...)
     - 3 features (Authentication, JWT, Security)
     - Timeline of 12 interactions
   → Displays context summary in chat

4. User: @workspace continue with role-based access
   → Copilot gets FULL context from session
   → Generates with knowledge of existing auth setup
```

### **Workflow 3: Exploring Codebase**
```
1. User: @autoforge /find OrderService
   → Shows: OrderService details, feature, relationships

2. User clicks "Insert as context"
   → Context added to next @workspace query

3. User: @workspace refactor OrderService to use repository pattern
   → Copilot gets OrderService context + KB patterns
```

---

## 🗄️ Data Storage

### **Local Storage**
```
.autoforge/
├── kb.db                 # SQLite knowledge base (reuse)
└── sessions/
    ├── auth-impl.json
    ├── payment-feature.json
    └── index.json        # Session metadata
```

### **Session Format**
```json
{
  "id": "auth-impl-2026-02-02",
  "name": "authentication-implementation",
  "createdAt": "2026-02-02T10:00:00Z",
  "lastAccessedAt": "2026-02-02T15:30:00Z",
  "context": {
    "features": ["Authentication", "JWT", "Security"],
    "components": ["AuthController", "AuthService", "JWTValidator"],
    "files": ["src/auth/AuthController.java", "src/auth/AuthService.java"],
    "patterns": ["Repository Pattern", "Dependency Injection"]
  },
  "timeline": [
    {
      "timestamp": "2026-02-02T10:15:00Z",
      "type": "query",
      "content": "add authentication with JWT",
      "kbContext": {
        "features": ["Security"],
        "components": ["SecurityConfig"]
      },
      "result": "Generated AuthController and AuthService"
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "add authentication with JWT",
      "timestamp": "2026-02-02T10:15:00Z",
      "kbReferences": {
        "features": ["Security"],
        "components": ["SecurityConfig"]
      }
    }
  ]
}
```

### **Optional: Server Storage (Phase 2)**
```typescript
// REST API for team collaboration
interface SessionAPI {
    POST   /sessions                 // Create session
    GET    /sessions/:id             // Load session
    PUT    /sessions/:id             // Update session
    DELETE /sessions/:id             // Delete session
    GET    /workspace/:id/sessions   // List workspace sessions
    POST   /sessions/:id/share       // Share with team
}
```

---

## 🔌 MCP Integration (Model Context Protocol)

### **Why MCP?**
- Standardized protocol for LLM context providers
- Makes AutoForge KB accessible to ANY tool
- Enables multi-tool workflows
- Future-proof architecture

### **MCP Implementation**

```typescript
// src/mcp/MCPServer.ts
export class MCPServer {
    // Expose KB via MCP protocol
    async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
        switch (request.tool) {
            case 'search_kb':
                return await this.searchKB(request.params.query);
            
            case 'get_feature':
                return await this.getFeature(request.params.featureId);
            
            case 'get_session':
                return await this.getSession(request.params.sessionId);
            
            case 'trace_component':
                return await this.traceComponent(request.params.component);
        }
    }
}
```

### **MCP Benefits**
1. **Copilot can call AutoForge** via standard protocol
2. **Other tools can access KB** (Claude Desktop, ChatGPT, custom tools)
3. **Team collaboration** - shared KB access
4. **Extensibility** - easy to add new tools

### **When to Implement MCP?**
- **Phase 1-2:** Build core context provider first
- **Phase 3:** Add MCP server for standardization
- **Phase 4:** Team features via MCP

---

## 🚀 Implementation Phases

### **Phase 1: Context Provider (Week 1)** 🎯
- [ ] Implement `ContextProvider` class
- [ ] Register with `vscode.chat.registerChatContextProvider`
- [ ] Auto-enrich @workspace queries
- [ ] Remove complex commands (generate, implement, ask)
- [ ] Keep: scan, find, map, session, sessions

### **Phase 2: Enhanced Sessions (Week 2)**
- [ ] Redesign session schema with rich context
- [ ] Implement timeline tracking
- [ ] Session switching with auto-context-load
- [ ] Local storage in .autoforge/sessions/

### **Phase 3: Search Enhancement (Week 3)**
- [ ] Add component-level search (not just features)
- [ ] Unified search: features + components
- [ ] /find command implementation
- [ ] /map command for visualization

### **Phase 4: UI/UX Polish (Week 4)**
- [ ] Enhanced sidebar with sessions
- [ ] Click-to-switch sessions
- [ ] Timeline visualization
- [ ] Context preview

### **Phase 5: MCP Integration (Optional)**
- [ ] MCP server implementation
- [ ] Expose KB via MCP
- [ ] Team collaboration features
- [ ] Multi-tool integration

---

## ✅ Success Criteria

### **Simplicity**
- Max 5 commands (vs current 14)
- No command memorization for code generation
- Single conversation thread

### **Effectiveness**
- Context automatically enriches Copilot
- Sessions restore full context
- Users can switch sessions instantly

### **Reusability**
- Standard Copilot interface
- No custom workflows
- Works with free and Pro tiers

### **Power**
- Rich session context
- Step-by-step timeline
- Architecture awareness

---

## 🔄 Migration from V1

### **Keep (Core Value)**
- Knowledge base (SQLite + AST)
- Feature detection
- Component analysis
- Hybrid search
- Tree providers

### **Transform**
- Chat participant → Minimal (5 commands)
- Session management → Enhanced (rich context)
- Commands → Context provider

### **Remove**
- Generate/implement/ask commands
- Custom LLM calls
- Token manager (Copilot handles it)
- Complex command routing

---

## 📝 Notes

- **Context Provider API:** Uses VS Code's native chat context API
- **Session Storage:** Start local, add server sync later
- **MCP:** Future-proof for multi-tool integration
- **Copilot Focus:** Let Copilot do what it does best
