# Scan/Indexing Migration Plan: Tree-sitter + LSP Integration

## Current State Analysis

### What We Have Now:
1. **Custom AST Parsers** (JavaASTParser, TypeScriptASTParser)
   - Built on `java-parser` and `@babel/parser`
   - Used by IngestionService for scanning
   - Slower, less accurate, limited language support

2. **Tree-sitter WASM** (initialized but not used)
   - Successfully loading and working
   - Grammar files missing but non-critical
   - NOT currently used in scan/indexing

3. **LSP Provider** (newly added)
   - Leverages VS Code's language servers
   - Real-time semantic information
   - NOT currently used in scan/indexing

4. **Knowledge Base Structure**
   - SQL.js database with tables for features, components, data flows
   - BM25 search indexing
   - Term indexing for text search
   - File tracking with hashes and timestamps

## Goals

1. ✅ **Accurate parsing** - Use tree-sitter for reliable AST extraction
2. ✅ **Semantic understanding** - Use LSP for cross-references and relationships
3. ✅ **Fast indexing** - Tree-sitter is faster than custom parsers
4. ✅ **Maintain existing features** - Feature detection, component analysis must still work
5. ✅ **Backward compatibility** - Don't break existing KB schema

## Migration Strategy

### Phase 1: Tree-sitter Integration (Primary Parser)
**Goal:** Replace custom parsers with tree-sitter for AST extraction

#### Changes Required:

**1.1. Create TreeSitterParser Wrapper**
- Location: `src/parsers/TreeSitterParser.ts`
- Purpose: Unified interface that wraps TreeSitterWasmManager
- Returns: ASTNode[] (compatible with existing FeatureAnalyzer)
- Features:
  - Parse Java files using tree-sitter
  - Parse TypeScript/JavaScript files
  - Convert tree-sitter nodes to ASTNode format
  - Handle errors gracefully

**1.2. Update IngestionService**
- Replace `JavaASTParser` with `TreeSitterParser`
- Replace `TypeScriptASTParser` with `TreeSitterParser`
- Keep same flow: scan → parse → analyze → save
- Maintain incremental indexing logic

**1.3. Update FeatureAnalyzer**
- Verify it works with tree-sitter generated ASTNodes
- May need minor adjustments for node structure
- Keep pattern detection logic intact

### Phase 2: LSP Semantic Enhancement (Optional Layer)
**Goal:** Add semantic information from LSP for richer context

#### Changes Required:

**2.1. Create LSPIndexer**
- Location: `src/indexing/LSPIndexer.ts`
- Purpose: Extract semantic information using LSP
- Runs AFTER tree-sitter indexing completes
- Features:
  - Get all workspace symbols via LSP
  - Build symbol reference graph
  - Find implementations/definitions
  - Store in separate LSP-specific tables

**2.2. Extend Database Schema**
- Add new tables (optional, don't break existing):
  ```sql
  CREATE TABLE IF NOT EXISTS lsp_symbols (
      id INTEGER PRIMARY KEY,
      name TEXT,
      kind TEXT,
      file_path TEXT,
      line INTEGER,
      character INTEGER,
      container_name TEXT
  );
  
  CREATE TABLE IF NOT EXISTS lsp_references (
      id INTEGER PRIMARY KEY,
      symbol_id INTEGER,
      file_path TEXT,
      line INTEGER,
      character INTEGER,
      is_definition BOOLEAN
  );
  ```

**2.3. Update KnowledgeBaseManager**
- Add method: `indexWithLSP()` - optional semantic enhancement
- Called after tree-sitter indexing if enabled
- Can be skipped if LSP not available

### Phase 3: Query Layer Updates
**Goal:** Use appropriate source for each query type

#### Query Routing Strategy:

```typescript
// Fast structural queries → Tree-sitter results (already indexed)
async findClasses() {
    return this.queryFromTreeSitterIndex();
}

// Semantic queries → LSP (real-time)
async findReferences(symbol) {
    return this.lspProvider.getReferences();
}

// Hybrid queries → Both sources
async getFeatureContext(featureName) {
    const structure = await this.getFromTreeSitterIndex();
    const semantics = await this.getFromLSP();
    return this.merge(structure, semantics);
}
```

## Implementation Steps

### Step 1: Create TreeSitterParser ✏️
**File:** `src/parsers/TreeSitterParser.ts`
**Estimated Time:** 2-3 hours
**Dependencies:** TreeSitterWasmManager, ASTParser interface
**Testing:** Parse sample Java/TS files, verify ASTNode output

### Step 2: Update IngestionService ✏️
**File:** `src/ingestionService.ts`
**Estimated Time:** 1-2 hours
**Changes:**
- Replace parser initialization
- Update parse calls
- Keep everything else the same
**Testing:** Run scan command, verify features detected

### Step 3: Test & Validate ✅
**Actions:**
- Run `@autoforge /scan` on test-fixtures
- Verify feature detection still works
- Check database is populated correctly
- Compare results with old parser (quality check)

### Step 4: Add LSP Enhancement (Optional) ✏️
**Files:**
- `src/indexing/LSPIndexer.ts` (new)
- `src/knowledgeBase/KnowledgeBaseManager.ts` (update)
**Estimated Time:** 2-3 hours
**Testing:** Verify LSP data enriches results

### Step 5: Update Query Layer 🔄
**Files:**
- HybridKnowledgeBase.ts
- Search handlers
**Estimated Time:** 1-2 hours
**Testing:** Verify queries return accurate results

## Database Migration

### Approach: Additive Only (Safe)
- **DO NOT** drop existing tables
- **DO NOT** change existing schema
- **ADD** new LSP tables if needed
- Existing data remains valid

### Migration Script:
```typescript
async migrateToTreeSitter() {
    // 1. No schema changes needed for Phase 1
    // 2. Existing parsed_files table works as-is
    // 3. Re-index all files with tree-sitter
    await this.clearParsingCache(); // Force re-parse
    await this.scanWorkspace(); // Use new tree-sitter parser
}
```

## Rollback Plan

### If Issues Arise:
1. Keep old parsers in codebase (mark deprecated)
2. Add feature flag: `USE_TREE_SITTER` (default: true)
3. Can switch back with config change
4. No data loss - database schema unchanged

## Testing Strategy

### Unit Tests:
- [ ] TreeSitterParser returns valid ASTNodes
- [ ] Java parsing works correctly
- [ ] TypeScript parsing works correctly
- [ ] Error handling for unsupported files

### Integration Tests:
- [ ] IngestionService completes successfully
- [ ] Features are detected correctly
- [ ] Components are identified
- [ ] Database is populated

### Comparison Tests:
- [ ] Parse same files with old vs new parser
- [ ] Compare feature detection results
- [ ] Verify accuracy improved or maintained

## Success Criteria

✅ **Phase 1 Complete When:**
1. All files parse successfully with tree-sitter
2. Feature detection works (same or better accuracy)
3. Database populated correctly
4. Scan command completes without errors
5. Existing queries return correct results

✅ **Phase 2 Complete When:**
1. LSP semantic data enhances results
2. Reference queries work accurately
3. Call hierarchy available
4. No performance degradation

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tree-sitter grammars missing | Medium | Already handled - base WASM works without grammars |
| ASTNode format incompatible | High | Create adapter layer in TreeSitterParser |
| LSP not available | Low | Make LSP optional, fallback to tree-sitter only |
| Performance regression | Medium | Batch processing, caching, incremental updates |
| Feature detection breaks | High | Extensive testing, keep old parser as fallback |

## Timeline

- **Phase 1 (Critical):** 1-2 days
  - Day 1: Create TreeSitterParser, update IngestionService
  - Day 2: Test, fix issues, validate

- **Phase 2 (Enhancement):** 1 day
  - Add LSP indexing layer
  - Test semantic queries

- **Phase 3 (Optimization):** 1 day
  - Update query routing
  - Performance tuning

**Total Estimated Time:** 3-4 days

## Next Actions

### Immediate (Now):
1. ✅ Create this migration plan
2. ✅ Commit and push current state
3. ⏳ Create TreeSitterParser wrapper
4. ⏳ Update IngestionService to use it
5. ⏳ Test on test-fixtures

### After Phase 1:
6. Add LSP enhancement layer
7. Update query routing
8. Performance optimization
9. Documentation updates

---

## Notes

- **Backward Compatible:** Existing database works as-is
- **Incremental:** Can deploy Phase 1 alone, Phase 2 is optional
- **Safe:** Old parsers remain in codebase as fallback
- **Testable:** Each phase independently testable
- **Reversible:** Can rollback with feature flag

## Questions to Resolve

1. ❓ Should we keep old parsers as backup or delete them?
   - **Recommendation:** Keep marked as deprecated for 1-2 releases

2. ❓ Should LSP indexing be automatic or opt-in?
   - **Recommendation:** Opt-in via configuration flag

3. ❓ Handle files where tree-sitter fails?
   - **Recommendation:** Log warning, skip file, continue indexing

4. ❓ Re-index existing workspaces automatically?
   - **Recommendation:** Yes, but check file hashes to avoid re-parsing unchanged files
