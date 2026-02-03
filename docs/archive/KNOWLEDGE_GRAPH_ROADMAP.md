# Knowledge Graph - Implementation Roadmap

## ✅ Phase 1: Core Infrastructure (COMPLETE)

**What we built:**
- [x] RelationshipIndexer - Index relationships between entities
- [x] RelationshipSearch - Query and traverse relationship graph
- [x] EnhancedJavaParser - Extract relationships from Java code
- [x] Database schema for relationships (4 new tables)
- [x] Design documentation

**Commit:** `c4b4688` - "feat: knowledge graph - relationship-aware code intelligence"

## 🔄 Phase 2: Integration with Existing System (NEXT)

### Step 1: Initialize Relationship Tables
**File:** `src/knowledgeBase/KnowledgeBaseManager.ts`
```typescript
async initialize() {
    // Existing initialization...
    
    // NEW: Initialize relationship indexer
    this.relationshipIndexer = new RelationshipIndexer(this.db);
    this.relationshipIndexer.initializeTables();
    
    // NEW: Initialize relationship search
    this.relationshipSearch = new RelationshipSearch(this.db);
}
```

### Step 2: Update Scan to Index Relationships
**File:** `src/knowledgeBase/KnowledgeBaseManager.ts`
```typescript
async indexFile(filePath: string) {
    // Existing: parse file
    const code = await fs.readFile(filePath, 'utf-8');
    
    // NEW: Use enhanced parser
    if (filePath.endsWith('.java')) {
        const enhancedParser = new EnhancedJavaParser();
        const result = enhancedParser.parse(code, filePath);
        
        // Index entities (existing)
        for (const node of result.nodes) {
            await this.astIndexer.indexNode(node, patternId);
        }
        
        // NEW: Index relationships
        for (const call of result.relationships.methodCalls) {
            this.relationshipIndexer.indexMethodCall(call);
        }
        
        for (const flow of result.relationships.dataFlows) {
            this.relationshipIndexer.indexDataFlow(flow);
        }
        
        for (const hierarchy of result.relationships.typeHierarchies) {
            this.relationshipIndexer.indexTypeHierarchy(hierarchy);
        }
    }
}
```

### Step 3: Add Relationship Queries to KnowledgeBaseManager
**File:** `src/knowledgeBase/KnowledgeBaseManager.ts`
```typescript
/**
 * Find callers of a method
 */
async findCallers(entityId: string): Promise<RelatedEntity[]> {
    return this.relationshipSearch.findCallers(entityId);
}

/**
 * Find callees of a method
 */
async findCallees(entityId: string): Promise<RelatedEntity[]> {
    return this.relationshipSearch.findCallees(entityId);
}

/**
 * Search with full relationship context
 */
async searchWithRelationships(query: string): Promise<SearchWithRelationshipsResult> {
    // Find entities matching query (existing)
    const entities = await this.hybridSearch.search(query);
    const entityIds = entities.map(e => e.id);
    
    // Add relationship context (new)
    const relationships = this.relationshipSearch.searchWithRelationships(entityIds);
    
    return {
        ...relationships,
        directMatches: entities
    };
}

/**
 * Trace data flow for a type
 */
async traceDataFlow(typeName: string): Promise<DataFlowPath[]> {
    return this.relationshipSearch.traceDataFlow(typeName);
}

/**
 * Find implementations of an interface
 */
async findImplementations(interfaceName: string): Promise<RelatedEntity[]> {
    return this.relationshipSearch.findImplementations(interfaceName);
}
```

### Step 4: Update /find Handler to Show Relationships
**File:** `src/chatParticipant/handlers/findHandler.ts`
```typescript
export async function handleFind(request, stream, kbManager, token) {
    const query = request.prompt.trim();
    
    // NEW: Use relationship-aware search
    const results = await kbManager.searchWithRelationships(query);
    
    // Show direct matches
    stream.markdown(`## 🔎 Search Results: "${query}"\n\n`);
    stream.markdown(`### 📦 Direct Matches (${results.directMatches.length})\n`);
    // ... render entities
    
    // NEW: Show relationships
    if (results.callers.length > 0) {
        stream.markdown(`\n### 🔗 Called By (${results.callers.length})\n`);
        for (const caller of results.callers.slice(0, 10)) {
            stream.markdown(`- \`${caller.identifier}\` at [${caller.filePath}:${caller.lineNumber}](${caller.filePath}#L${caller.lineNumber})\n`);
        }
        if (results.callers.length > 10) {
            stream.markdown(`- ...and ${results.callers.length - 10} more\n`);
        }
    }
    
    if (results.callees.length > 0) {
        stream.markdown(`\n### 📞 Calls (${results.callees.length})\n`);
        for (const callee of results.callees.slice(0, 10)) {
            stream.markdown(`- \`${callee.identifier}\` at [${callee.filePath}:${callee.lineNumber}](${callee.filePath}#L${callee.lineNumber})\n`);
        }
    }
    
    if (results.dataFlows.length > 0) {
        stream.markdown(`\n### 🔄 Data Flow\n`);
        for (const flow of results.dataFlows.slice(0, 5)) {
            stream.markdown(`**${flow.variable}** (${flow.type}):\n`);
            for (const step of flow.flow.slice(0, 5)) {
                stream.markdown(`  → ${step.context} at ${step.location}\n`);
            }
        }
    }
    
    if (results.implementations.length > 0) {
        stream.markdown(`\n### 🏗️ Implementations\n`);
        for (const impl of results.implementations) {
            stream.markdown(`- \`${impl.identifier}\` (${impl.relationshipType})\n`);
        }
    }
    
    stream.markdown(`\n💡 **Total related entities:** ${results.totalRelatedCount}\n`);
}
```

### Step 5: Add Relationship Stats to /scan Results
**File:** `src/chatParticipant/handlers/scanHandler.ts`
```typescript
export async function handleScan(stream, kbManager, token, onScanComplete) {
    // ... existing scan logic
    
    // NEW: Show relationship stats
    const relStats = kbManager.relationshipIndexer.getStats();
    
    stream.markdown(`\n**Relationships Indexed:**\n`);
    stream.markdown(`- ${relStats.calls} method calls\n`);
    stream.markdown(`- ${relStats.dataFlows} data flow connections\n`);
    stream.markdown(`- ${relStats.typeHierarchies} type hierarchies\n`);
    stream.markdown(`- ${relStats.relationships} total relationships\n`);
}
```

## 📋 Phase 3: New Commands (Future)

### /callers Command
Show what calls a method:
```
@autoforge /callers PaymentService.processPayment

Results:
- CheckoutController.checkout() [line 123]
- RefundController.refund() [line 45]
- SubscriptionController.charge() [line 89]
```

### /callees Command
Show what a method calls:
```
@autoforge /callees PaymentService.processPayment

Results:
- PaymentGateway.createTransaction() [line 45]
- finalizePayment() [line 52]
- Logger.info() [line 58]
```

### /flow Command
Show data flow:
```
@autoforge /flow Transaction

Results:
PaymentRequest (parameter)
  → PaymentService.processPayment()
  → PaymentGateway.createTransaction()
  → Transaction (return)
  → finalizePayment()
  → PaymentResult (return)
```

### /path Command
Find path between two entities:
```
@autoforge /path CheckoutController.checkout PaymentGateway.createTransaction

Results:
Shortest path (2 hops):
CheckoutController.checkout()
  → PaymentService.processPayment()
  → PaymentGateway.createTransaction()
```

### /implements Command
Find implementations:
```
@autoforge /implements IPaymentService

Results:
- PaymentService
- MockPaymentService
- TestPaymentService
```

## 🚀 Phase 4: Advanced Features (Future)

### Dependency Analysis
```typescript
// Find circular dependencies
const cycles = await kbManager.findCircularDependencies();

// Find unused code
const unused = await kbManager.findUnusedMethods();

// Impact analysis
const impact = await kbManager.analyzeImpact('PaymentGateway');
```

### Visualization
```typescript
// Generate call graph for visualization
const graph = await kbManager.buildCallGraphFor('PaymentService');

// Output:
{
    nodes: [
        {id: 'PaymentService', type: 'class'},
        {id: 'processPayment', type: 'method'},
        {id: 'PaymentGateway', type: 'class'}
    ],
    edges: [
        {from: 'PaymentService', to: 'processPayment', type: 'CONTAINS'},
        {from: 'processPayment', to: 'PaymentGateway', type: 'CALLS'}
    ]
}
```

### Pattern Detection
```typescript
// Detect design patterns
const patterns = await kbManager.detectPatterns();

// Output:
{
    'Singleton': ['PaymentGateway', 'Logger'],
    'Factory': ['PaymentServiceFactory'],
    'Observer': ['EventBus', 'EventListener']
}
```

## 📊 Testing Plan

### Unit Tests
```typescript
describe('RelationshipIndexer', () => {
    it('should index method calls', async () => {
        const call: MethodCall = {
            callerId: 'method1',
            calleeId: 'method2',
            calleeIdentifier: 'processPayment',
            callType: 'direct',
            filePath: 'test.java',
            lineNumber: 45
        };
        
        indexer.indexMethodCall(call);
        const callers = search.findCallers('method2');
        
        expect(callers).toHaveLength(1);
        expect(callers[0].id).toBe('method1');
    });
});
```

### Integration Tests
```typescript
describe('Knowledge Graph Integration', () => {
    it('should find transitive callers', async () => {
        // Given: A → B → C
        // When: search for C's callers
        const callers = await kbManager.findTransitiveCallers('C', 5);
        
        // Then: should find both B and A
        expect(callers.map(c => c.id)).toContain('A');
        expect(callers.map(c => c.id)).toContain('B');
    });
});
```

### Performance Tests
```typescript
describe('Performance', () => {
    it('should index 1000 files in < 5 seconds', async () => {
        const start = Date.now();
        await kbManager.scanWorkspace();
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(5000);
    });
    
    it('should find callers in < 100ms', async () => {
        const start = Date.now();
        await kbManager.findCallers('someMethod');
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(100);
    });
});
```

## 📈 Success Metrics

### Indexing
- [x] Index relationships during scan
- [ ] Incremental re-indexing on file changes
- [ ] Background indexing without blocking UI
- [ ] Progress reporting

### Query Performance
- [ ] Find callers: < 100ms
- [ ] Transitive search (5 hops): < 500ms
- [ ] Full relationship search: < 1s

### Accuracy
- [ ] Method call detection: > 95%
- [ ] Data flow tracking: > 90%
- [ ] Type hierarchy: > 99%

### User Experience
- [ ] Search shows relationships by default
- [ ] One-click navigation to related code
- [ ] Visual indication of relationship strength
- [ ] Relationship filtering by type

## 🎯 Priorities

**Week 1 (Phase 2):**
- [ ] Integrate RelationshipIndexer into scan
- [ ] Update /find to show relationships
- [ ] Test with small project

**Week 2:**
- [ ] Add TypeScript relationship extraction
- [ ] Performance optimization
- [ ] Test with large project (1000+ files)

**Week 3:**
- [ ] New commands (/callers, /callees, /flow)
- [ ] Visualization support
- [ ] Documentation

**Week 4:**
- [ ] Advanced features (pattern detection)
- [ ] User feedback iteration
- [ ] Release v2.0

## 📚 Documentation Needed

- [ ] User guide: Understanding relationships
- [ ] Developer guide: Adding new relationship types
- [ ] Architecture document: Graph algorithms used
- [ ] Performance guide: Optimization tips
- [ ] Migration guide: Updating existing KB

## 🎉 Impact

This knowledge graph will transform AutoForge from:
- **Basic search** → **Intelligent code understanding**
- **Entity listing** → **Relationship exploration**
- **Static context** → **Dynamic navigation**
- **Isolated answers** → **Contextual insights**

All without LLM, without paid tools - pure static analysis! 🚀
