# Hybrid Context Architecture

## Overview

AutoForge uses a **three-layer hybrid context approach** combining Tree-sitter (structural parsing) and LSP (semantic analysis) to provide token-efficient, highly relevant context to AI assistants.

## The Three Layers

### 1. 🎯 Focal Point (Tree-sitter)
**Purpose:** The exact code block currently being edited

**What it contains:**
- Full source of the current function, method, or class
- The "hot zone" where the AI will do most work
- Exact line range and symbol name

**Source:** Tree-sitter parses the file and identifies the enclosing symbol at the cursor position

**Example:**
```typescript
async function filterUsers(criteria: any) {
  const users = await this.fetchActiveUsers();
  // [USER CURSOR HERE]
  return users.filter(u => u.isActive);
}
```

### 2. 🗺️ Skeleton Map (Tree-sitter + LSP)
**Purpose:** Low-resolution view of current file and immediate neighbors

**What it contains:**
- **Signatures only** - no implementation details
- Class declarations with method signatures
- Interface definitions
- Return types and parameter types (from LSP)

**Source:**
- Tree-sitter extracts structure
- LSP validates types across files
- Combines to create accurate signatures

**Example:**
```typescript
- File: `UserService.ts`
  - class UserService {
    - method getUserById(id: string): Promise<User>;
    - method deleteUser(id: string): Promise<void>;
    - method fetchActiveUsers(): Promise<User[]>;
  }
- File: `User.java` (External Dependency)
  - class User {
    - String id;
    - String name;
    - Boolean isActive;
  }
```

**Why signatures only?**
- Saves 80-90% of tokens
- AI doesn't need implementation details to understand API surface
- Focuses attention on what's available, not how it works internally

### 3. 🔗 Dependency Inject (LSP)
**Purpose:** "Missing pieces" from other files

**What it contains:**
- Imported classes/interfaces from other modules
- Type definitions used in current code
- Only the interfaces, not full implementations

**Source:**
- LSP `executeDefinitionProvider` finds where symbols are defined
- Extracts only the public interface of external dependencies
- Resolves transitive dependencies automatically

**Example:**
```typescript
- `PaymentProcessor` from `billing/PaymentProcessor.java`
  interface PaymentProcessor {
    processPayment(amount: number, currency: string): PaymentResult;
  }
  
- `AuthContext` from `auth/context.ts`
  interface AuthContext {
    currentUser: User;
    hasPermission(permission: string): boolean;
  }
```

**Why this matters:**
- AI often fails when it doesn't know the properties of imported objects
- LSP provides **real-time, accurate** type information
- No manual maintenance of dependency graphs

## Token Efficiency Comparison

### ❌ Traditional Approach (Dump Everything)
```
Full UserService.ts: 500 lines = ~2000 tokens
Full User.java: 300 lines = ~1200 tokens
Full PaymentProcessor.java: 450 lines = ~1800 tokens
----
Total: ~5000 tokens for minimal context
```

### ✅ Hybrid Context Approach
```
Focal Point: 20 lines = ~80 tokens
Skeleton Map: 30 signatures = ~200 tokens
Dependencies: 5 interfaces = ~150 tokens
----
Total: ~430 tokens for rich, structured context
```

**Result:** 91% token reduction with better quality context!

## Implementation Architecture

```
┌─────────────────────────────────────────────────┐
│         User Interaction                        │
│   (Cursor position in VS Code)                  │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│         ContextProvider                         │
│  - buildContext(document, position)             │
│  - formatAsPrompt(context)                      │
└──────┬─────────────┬────────────────┬───────────┘
       │             │                │
       │             │                │
   ┌───▼──┐      ┌───▼───┐      ┌────▼─────┐
   │TS    │      │ LSP   │      │  LSP     │
   │Parser│      │Symbols│      │Definition│
   └───┬──┘      └───┬───┘      └────┬─────┘
       │             │                │
       ▼             ▼                ▼
   ┌─────────────────────────────────────┐
   │   Structured Context Object         │
   │   {                                 │
   │     activeCode: {...},              │
   │     skeletonMap: [...],             │
   │     dependencies: [...]             │
   │   }                                 │
   └──────────────┬──────────────────────┘
                  │
                  ▼
   ┌──────────────────────────────────┐
   │   Formatted Prompt               │
   │   ### SYSTEM CONTEXT             │
   │   ### WORKSPACE SKELETON         │
   │   ### DEPENDENCIES               │
   │   ### ACTIVE CODE                │
   └──────────────┬───────────────────┘
                  │
                  ▼
   ┌──────────────────────────────────┐
   │   AI Assistant (Copilot)         │
   │   Receives structured,           │
   │   token-efficient context        │
   └──────────────────────────────────┘
```

## Data Flow

### Step 1: User Invokes Command
```typescript
// User types: @autoforge /context
// Or: Automatically triggered on chat interaction
```

### Step 2: Extract Focal Point
```typescript
const tree = treeSitter.parse(document);
const enclosingNode = findEnclosingSymbol(tree, cursorPosition);
// → Returns function/method currently being edited
```

### Step 3: Build Skeleton Map
```typescript
const symbols = await lsp.getDocumentSymbols(document.uri);
const skeleton = symbols.map(s => extractSignature(s));
// → Returns only method signatures, no implementations
```

### Step 4: Resolve Dependencies
```typescript
const imports = findImports(document);
for (const imp of imports) {
  const definition = await lsp.getDefinition(imp.position);
  const interface = extractInterface(definition);
  dependencies.push(interface);
}
// → Returns external type definitions
```

### Step 5: Format as Prompt
```typescript
const prompt = `
### SYSTEM CONTEXT
...

### CURRENT WORKSPACE SKELETON
${skeletonMap}

### EXTERNAL DEPENDENCIES
${dependencies}

### ACTIVE CODE
${focalPoint}
`;
```

## Usage Patterns

### Pattern 1: On-Demand Context
User explicitly requests context analysis:
```
@autoforge /context
```
→ Shows full structured context for current position

### Pattern 2: Auto-Context Decoration
Automatically inject context when user asks questions:
```
User: "How do I implement authentication here?"
AutoForge: [Detects question, builds context, decorates prompt]
Copilot: [Receives user question + structured context]
```

### Pattern 3: Session Context
Save context snapshots in sessions for restoration:
```typescript
const context = await contextProvider.buildContext(...);
sessionManager.saveContext(sessionId, context);
// Later...
const restored = sessionManager.getContext(sessionId);
```

## Key Benefits

### 🚀 Token Efficiency
- 90%+ reduction in context tokens
- More room for conversation history
- Faster response times

### 🎯 Relevance
- Only includes what's actually needed
- Focuses on API surface, not implementation
- Real-time type information from LSP

### 🔄 Accuracy
- LSP ensures type correctness
- Tree-sitter provides exact structure
- No stale or outdated information

### 📊 Structured
- Organized into logical layers
- Easy for AI to parse and understand
- Clear separation of concerns

### 🔌 Extensible
- Easy to add more context sources
- Pluggable architecture
- Works with any language supported by LSP + Tree-sitter

## Integration with Chat Participant

### Option A: New Command
Add `/context` command to show structured context:
```typescript
case 'context':
  await handleContextCommand(request, stream, contextProvider, token);
  return { metadata: { command: 'context' } };
```

### Option B: Automatic Decoration
Transparently enhance all interactions:
```typescript
const decorator = new AutoContextDecorator(contextProvider);
const enhancedPrompt = await decorator.decoratePrompt(request.prompt);
// Forward enhancedPrompt to @workspace or Copilot API
```

### Option C: Reference in Variables
Expose as chat variables:
```typescript
// User types: @autoforge #context
// → Injects structured context into conversation
```

## Future Enhancements

### Phase 1 (Current)
- ✅ Three-layer context (Focal, Skeleton, Dependencies)
- ✅ Tree-sitter + LSP integration
- ✅ Token-efficient formatting

### Phase 2 (Planned)
- 🔄 Usage ranking (most-used methods first)
- 🔄 Scoping (filter by relevance to user query)
- 🔄 Call graph analysis (show callers/callees)

### Phase 3 (Future)
- 🔮 Semantic search within context
- 🔮 Cross-language dependency resolution
- 🔮 Historical context (similar edits in the past)
- 🔮 Team context (what others worked on here)

## Performance Considerations

### Caching Strategy
```typescript
// Cache document symbols (LSP)
lspProvider.getDocumentSymbols(uri); // Cached 1 minute

// Cache tree-sitter trees
treeSitter.parse(file); // Incremental parsing

// Cache dependency resolutions
dependencyCache.get(symbolName); // Per-session cache
```

### Lazy Loading
```typescript
// Only build skeleton map if includeNeighbors=true
await contextProvider.buildContext(doc, pos, false);

// Only resolve dependencies if user asks
if (needsDependencies) {
  context.dependencies = await resolveDependencies(...);
}
```

### Batch Operations
```typescript
// Resolve all dependencies in parallel
await Promise.all(imports.map(i => lsp.getDefinition(i)));

// Build skeletons for multiple files concurrently
await Promise.all(files.map(f => extractSkeleton(f)));
```

## Testing Strategy

### Unit Tests
- ✅ Test focal point extraction
- ✅ Test skeleton generation
- ✅ Test dependency resolution
- ✅ Test prompt formatting

### Integration Tests
- ✅ Test with real Java files
- ✅ Test with real TypeScript files
- ✅ Test mixed-language projects

### Performance Tests
- ✅ Measure token usage reduction
- ✅ Measure context build time
- ✅ Measure cache hit rates

## Conclusion

The Hybrid Context Architecture represents a significant evolution in how AI coding assistants receive context. By combining the structural precision of Tree-sitter with the semantic accuracy of LSP, and organizing information into three focused layers, we achieve:

1. **Dramatic token reduction** (90%+)
2. **Improved relevance** (only what's needed)
3. **Real-time accuracy** (LSP ensures correctness)
4. **Better AI responses** (structured, focused context)

This architecture positions AutoForge as a true "context provider" that enhances Copilot rather than competing with it.
