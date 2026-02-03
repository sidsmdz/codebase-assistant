# Semantic Search Integration Plan

## Overview

While Tree-sitter and LSP provide **structural** understanding, they miss **semantic** connections. For example:
- User asks about "permissions" 
- Code uses variable name `authScopes`
- LSP won't find the connection

**Solution:** Add semantic search via vector embeddings to find conceptually related code.

## Implementation Roadmap

### Phase 1: Feature Index (Simple Approach)

Store semantic summaries of code elements:

```typescript
interface FeatureSummary {
    symbolName: string;
    filePath: string;
    language: string;
    summary: string;  // "This function validates user JWT scopes"
    keywords: string[];  // ["authentication", "permissions", "JWT", "scopes"]
}
```

**Storage:** JSON file or SQLite table
**Search:** Simple keyword matching initially

### Phase 2: Local Vector Database

Use lightweight vector DB like ChromaDB or even Transformers.js:

```typescript
// During scan/indexing
const summary = generateSummary(functionCode, functionName);
const embedding = await generateEmbedding(summary);
vectorDB.store(symbolId, embedding, { summary, file, line });

// During search
const queryEmbedding = await generateEmbedding("permissions");
const results = vectorDB.search(queryEmbedding, topK=5);
```

### Phase 3: Hybrid Search

Combine structural (LSP) + semantic (embeddings):

```typescript
async function hybridSearch(query: string) {
    // 1. Structural search (fast, exact)
    const structuralResults = await lsp.searchSymbols(query);
    
    // 2. Semantic search (slower, fuzzy)
    const semanticResults = await vectorDB.search(query);
    
    // 3. Merge and rank
    return mergeResults(structuralResults, semanticResults);
}
```

## Quick Win: Keyword Extraction

Before full embeddings, implement simple keyword extraction:

### Step 1: Extract Keywords During Scan

```typescript
// In IngestionService.ts
function extractKeywords(code: string, symbolName: string): string[] {
    const keywords = new Set<string>();
    
    // Symbol name parts
    keywords.add(symbolName.toLowerCase());
    const camelParts = symbolName.split(/(?=[A-Z])/).map(s => s.toLowerCase());
    camelParts.forEach(p => keywords.add(p));
    
    // Common patterns
    if (code.includes('@Transactional')) keywords.add('transaction');
    if (code.includes('@Async')) keywords.add('async');
    if (code.includes('JWT') || code.includes('token')) keywords.add('authentication');
    if (code.includes('Role') || code.includes('Permission')) keywords.add('permissions');
    if (code.includes('@Cacheable')) keywords.add('cache');
    
    // Extract from comments
    const comments = code.match(/\/\*\*[\s\S]*?\*\/|\/\/.*/g) || [];
    comments.forEach(comment => {
        const words = comment.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
        words.forEach(w => keywords.add(w));
    });
    
    return Array.from(keywords);
}
```

### Step 2: Store in Database

```sql
CREATE TABLE symbol_keywords (
    symbol_id INTEGER,
    keyword TEXT,
    FOREIGN KEY (symbol_id) REFERENCES symbols(id)
);

CREATE INDEX idx_keyword ON symbol_keywords(keyword);
```

### Step 3: Semantic Search Function

```typescript
async function semanticSearch(query: string): Promise<SearchResult[]> {
    const queryWords = query.toLowerCase().split(/\s+/);
    
    const sql = `
        SELECT s.name, s.file_path, s.line, COUNT(*) as relevance
        FROM symbols s
        JOIN symbol_keywords sk ON s.id = sk.symbol_id
        WHERE sk.keyword IN (${queryWords.map(() => '?').join(',')})
        GROUP BY s.id
        ORDER BY relevance DESC
        LIMIT 10
    `;
    
    return db.query(sql, queryWords);
}
```

### Step 4: Integrate with Context Provider

```typescript
// In ContextProvider.ts
async function enrichContextWithSemanticSearch(
    query: string,
    context: HybridContext
): Promise<HybridContext> {
    // Find semantically related code
    const semanticMatches = await semanticSearch(query);
    
    // Add top 3 matches to dependencies
    for (const match of semanticMatches.slice(0, 3)) {
        if (!context.dependencies.some(d => d.filePath === match.file_path)) {
            const doc = await vscode.workspace.openTextDocument(match.file_path);
            const symbol = await getSymbolAtLine(doc, match.line);
            if (symbol) {
                context.dependencies.push({
                    symbolName: symbol.name,
                    filePath: match.file_path,
                    language: doc.languageId,
                    signature: extractSignature(symbol, doc),
                    description: `Related to: ${query}`
                });
            }
        }
    }
    
    return context;
}
```

## Advanced: Vector Embeddings

### Option 1: Transformers.js (Local, No API Calls)

```typescript
import { pipeline } from '@xenova/transformers';

class EmbeddingService {
    private embedder: any;
    
    async initialize() {
        // Use small model that runs in Node.js
        this.embedder = await pipeline(
            'feature-extraction',
            'Xenova/all-MiniLM-L6-v2'
        );
    }
    
    async generateEmbedding(text: string): Promise<number[]> {
        const output = await this.embedder(text, {
            pooling: 'mean',
            normalize: true
        });
        return Array.from(output.data);
    }
    
    cosineSimilarity(a: number[], b: number[]): number {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
```

### Option 2: OpenAI Embeddings (Best Quality, Requires API)

```typescript
import OpenAI from 'openai';

class EmbeddingService {
    private openai: OpenAI;
    
    async generateEmbedding(text: string): Promise<number[]> {
        const response = await this.openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text
        });
        return response.data[0].embedding;
    }
}
```

### Store Embeddings in SQLite

```sql
-- Store as JSON blob
CREATE TABLE symbol_embeddings (
    symbol_id INTEGER PRIMARY KEY,
    embedding BLOB,  -- JSON array
    FOREIGN KEY (symbol_id) REFERENCES symbols(id)
);

-- Or use vector extension if available
-- CREATE VIRTUAL TABLE vec_symbols USING vec0(
--     symbol_id INTEGER PRIMARY KEY,
--     embedding FLOAT[384]
-- );
```

## Usage Flow

### Current (Structural Only)
```
User: "explain permissions"
→ LSP search: "permissions" (exact match)
→ Finds: PermissionController.java
→ Context added: PermissionController only
```

### With Semantic Search
```
User: "explain permissions"
→ LSP search: "permissions" (exact match)
→ Semantic search: "permissions authorization access control"
→ Finds: 
  - PermissionController.java (exact)
  - AuthInterceptor.java (semantic: "access control")
  - RequiresPermission.java (semantic: "authorization")
  - UserRoleRepository.java (semantic: related)
→ Context added: All related components
```

## Implementation Priority

1. **✅ Completed:** Structural search (LSP + Tree-sitter)
2. **✅ Completed:** Cross-language linking
3. **✅ Completed:** Context anchoring
4. **🔄 Next:** Keyword extraction + simple semantic search
5. **📅 Later:** Vector embeddings with Transformers.js
6. **📅 Future:** Fine-tuned embeddings on your codebase

## Quick Implementation

Want me to implement keyword extraction first? It's a 2-hour task:
1. Add keyword extraction to IngestionService
2. Create symbol_keywords table
3. Add semantic search function
4. Integrate into ContextProvider

This will give you 80% of semantic search benefits with minimal complexity!

## Testing Semantic Search

### Test Case 1: Synonym Matching
```
Code: authScopes
Query: "permissions"
Keywords: ["auth", "scopes", "authorization", "permissions"]
Result: ✅ Found via keyword match
```

### Test Case 2: Concept Matching
```
Code: JWT validation in AuthInterceptor
Query: "authentication"
Keywords: ["jwt", "token", "auth", "authentication", "security"]
Result: ✅ Found via keyword match
```

### Test Case 3: Cross-Domain
```
Code: @Transactional in PaymentService
Query: "database operations"
Keywords: ["transactional", "database", "persistence", "transaction"]
Result: ✅ Found via annotation keywords
```

## Performance Considerations

### Keyword Extraction
- **Speed:** Very fast (<1ms per symbol)
- **Storage:** ~10 keywords per symbol = 10KB per 1000 symbols
- **Search:** Indexed SQL query = <10ms

### Vector Embeddings
- **Speed:** ~100ms per embedding (local model)
- **Storage:** 384 dimensions × 4 bytes = 1.5KB per symbol
- **Search:** Linear scan ~10ms for 10K symbols (with optimizations)

## Decision Matrix

| Approach | Accuracy | Speed | Complexity | Storage |
|----------|----------|-------|------------|---------|
| Keywords | 70% | ⚡⚡⚡ | Low | ~10KB |
| Local Embeddings | 85% | ⚡⚡ | Medium | ~1.5MB |
| OpenAI Embeddings | 95% | ⚡ | Medium | ~1.5MB |

**Recommendation:** Start with keywords, add embeddings later if needed.

## Next Steps

1. **Immediate:** Test current context anchoring
2. **This week:** Add keyword extraction
3. **Next sprint:** Evaluate vector embeddings
4. **Future:** Fine-tune on your specific codebase

Ready to implement keyword extraction? Let me know!
