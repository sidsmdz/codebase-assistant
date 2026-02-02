# Knowledge Graph Design - Relationship-Aware Codebase Intelligence

## Problem Statement

**Current KB:** Stores entities (classes, methods) but lacks relationships
- Search "payment" → finds PaymentService class ✓
- **Missing:** Methods calling payment gateway, transaction flow, data dependencies ✗

**Goal:** Build a relationship graph that understands code structure and data flow
- Search "payment" → finds PaymentService + all callers + transaction objects + data flow ✓

## Design Philosophy

**No LLM, No Paid Tools** - Pure static analysis using:
- AST parsing (already have)
- Call graph analysis
- Data flow analysis
- Type system analysis
- Control flow analysis

## Architecture

### 1. Entity-Relationship Model

```
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│   Entities  │◄─────►│ Relationships │◄─────►│   Entities  │
└─────────────┘       └──────────────┘       └─────────────┘
     │                      │                       │
     │                      │                       │
  Classes             CALLS, USES,              Methods
  Methods          IMPLEMENTS, EXTENDS,         Variables
  Variables         CONTAINS, RETURNS,          Interfaces
  Interfaces         DEPENDS_ON, etc.           Types
```

### 2. Relationship Types

#### A. Code Structure Relationships
```typescript
class PaymentService implements IPaymentService {
    // Relationships captured:
    // 1. PaymentService IMPLEMENTS IPaymentService
    // 2. PaymentService CONTAINS processPayment()
    // 3. processPayment() RETURNS PaymentResult
    
    processPayment(request: PaymentRequest): PaymentResult {
        const gateway = new PaymentGateway();
        // 4. processPayment() CALLS PaymentGateway.constructor()
        
        const transaction = gateway.createTransaction(request);
        // 5. processPayment() CALLS createTransaction()
        // 6. createTransaction() USES PaymentRequest
        // 7. createTransaction() RETURNS Transaction
        
        return this.finalizePayment(transaction);
        // 8. processPayment() CALLS finalizePayment()
        // 9. finalizePayment() USES Transaction
    }
}
```

#### B. Data Flow Relationships
```typescript
// Track how data flows through the system:
PaymentRequest → processPayment() → PaymentGateway → Transaction → finalizePayment() → PaymentResult
```

#### C. Dependency Relationships
```typescript
// Who depends on what:
CheckoutController DEPENDS_ON PaymentService
PaymentService DEPENDS_ON PaymentGateway
PaymentGateway DEPENDS_ON HttpClient
```

### 3. Database Schema Enhancement

#### Current Schema
```sql
-- What we have:
CREATE TABLE ast_nodes (
    id TEXT PRIMARY KEY,
    node_type TEXT,
    identifier TEXT,
    signature TEXT,
    ...
);
```

#### New Schema - Add Relationship Tables
```sql
-- Entity relationships (method calls, class inheritance, etc.)
CREATE TABLE entity_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_entity_id TEXT NOT NULL,      -- e.g., "PaymentService.processPayment"
    target_entity_id TEXT NOT NULL,      -- e.g., "PaymentGateway.createTransaction"
    relationship_type TEXT NOT NULL,     -- CALLS, USES, IMPLEMENTS, EXTENDS, etc.
    context TEXT,                         -- Additional context (e.g., parameter position)
    file_path TEXT,
    line_number INTEGER,
    FOREIGN KEY (source_entity_id) REFERENCES ast_nodes(id),
    FOREIGN KEY (target_entity_id) REFERENCES ast_nodes(id)
);

CREATE INDEX idx_relationships_source ON entity_relationships(source_entity_id);
CREATE INDEX idx_relationships_target ON entity_relationships(target_entity_id);
CREATE INDEX idx_relationships_type ON entity_relationships(relationship_type);

-- Data flow graph (how data moves through code)
CREATE TABLE data_flow (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variable_name TEXT NOT NULL,         -- e.g., "transaction"
    variable_type TEXT,                   -- e.g., "Transaction"
    source_location TEXT NOT NULL,        -- Where variable is defined
    usage_location TEXT NOT NULL,         -- Where variable is used
    flow_type TEXT NOT NULL,              -- PARAMETER, RETURN, ASSIGNMENT, FIELD_ACCESS
    method_id TEXT,                       -- Method containing this flow
    line_number INTEGER,
    FOREIGN KEY (method_id) REFERENCES ast_nodes(id)
);

CREATE INDEX idx_data_flow_variable ON data_flow(variable_name);
CREATE INDEX idx_data_flow_type ON data_flow(variable_type);
CREATE INDEX idx_data_flow_method ON data_flow(method_id);

-- Type hierarchy (class inheritance, interface implementation)
CREATE TABLE type_hierarchy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_type TEXT NOT NULL,             -- e.g., "PaymentService"
    parent_type TEXT NOT NULL,            -- e.g., "IPaymentService"
    hierarchy_type TEXT NOT NULL,         -- EXTENDS, IMPLEMENTS
    file_path TEXT,
    FOREIGN KEY (child_type) REFERENCES ast_nodes(id),
    FOREIGN KEY (parent_type) REFERENCES ast_nodes(id)
);

CREATE INDEX idx_type_hierarchy_child ON type_hierarchy(child_type);
CREATE INDEX idx_type_hierarchy_parent ON type_hierarchy(parent_type);

-- Call graph (optimized for traversal)
CREATE TABLE call_graph (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caller_id TEXT NOT NULL,              -- Method making the call
    callee_id TEXT NOT NULL,              -- Method being called
    call_type TEXT NOT NULL,              -- DIRECT, VIRTUAL, INTERFACE, CONSTRUCTOR
    file_path TEXT,
    line_number INTEGER,
    FOREIGN KEY (caller_id) REFERENCES ast_nodes(id),
    FOREIGN KEY (callee_id) REFERENCES ast_nodes(id)
);

CREATE INDEX idx_call_graph_caller ON call_graph(caller_id);
CREATE INDEX idx_call_graph_callee ON call_graph(callee_id);
```

### 4. Enhanced AST Parser

#### What to Extract

```typescript
interface EnhancedASTNode extends ASTNode {
    // Current fields: id, type, identifier, signature, etc.
    
    // NEW: Relationship extraction
    calls: MethodCall[];              // Methods this calls
    uses: TypeUsage[];                // Types this uses
    implements: string[];             // Interfaces implemented
    extends: string;                  // Parent class
    returns: TypeInfo;                // Return type info
    parameters: EnhancedParameter[]; // Parameter with type info
    fields: FieldInfo[];              // Class fields
    annotations: Annotation[];        // Java annotations / TS decorators
}

interface MethodCall {
    targetMethod: string;      // Method name
    targetClass?: string;      // Class name (if known)
    lineNumber: number;
    callType: 'direct' | 'virtual' | 'interface' | 'constructor';
}

interface TypeUsage {
    typeName: string;
    usageType: 'parameter' | 'return' | 'field' | 'local_variable';
    context: string;           // Where it's used
}

interface DataFlowNode {
    variableName: string;
    variableType: string;
    definedAt: number;         // Line number
    usedAt: number[];          // Line numbers where used
    flowType: 'parameter' | 'return' | 'assignment' | 'field_access';
}
```

#### Implementation Strategy

**Phase 1: Call Graph Extraction**
```typescript
// For Java:
parseMethodBody(methodNode) {
    // Find method invocations
    methodNode.body.statements.forEach(stmt => {
        if (stmt.type === 'MethodInvocation') {
            recordMethodCall({
                caller: currentMethod,
                callee: stmt.methodName,
                targetClass: stmt.expression?.type,
                lineNumber: stmt.location.line
            });
        }
    });
}

// For TypeScript:
ts.forEachChild(node, (child) => {
    if (ts.isCallExpression(child)) {
        recordMethodCall({
            caller: currentMethod,
            callee: child.expression.getText(),
            lineNumber: ts.getLineAndCharacterOfPosition(sourceFile, child.pos).line
        });
    }
});
```

**Phase 2: Data Flow Analysis**
```typescript
trackDataFlow(methodNode) {
    const variables = new Map<string, DataFlowInfo>();
    
    // Track variable definitions
    methodNode.parameters.forEach(param => {
        variables.set(param.name, {
            type: param.type,
            definedAt: param.location.line,
            usages: []
        });
    });
    
    // Track variable usages
    methodNode.body.walk((node) => {
        if (node.type === 'Identifier') {
            const varInfo = variables.get(node.name);
            if (varInfo) {
                varInfo.usages.push({
                    line: node.location.line,
                    context: node.parent.type // assignment, call, return, etc.
                });
            }
        }
    });
    
    // Store in database
    variables.forEach((info, name) => {
        storeDataFlow({
            variable: name,
            type: info.type,
            definition: info.definedAt,
            usages: info.usages,
            method: currentMethod
        });
    });
}
```

**Phase 3: Type Hierarchy**
```typescript
extractTypeHierarchy(classNode) {
    // Java
    if (classNode.superclass) {
        recordTypeRelationship({
            child: classNode.name,
            parent: classNode.superclass,
            type: 'EXTENDS'
        });
    }
    
    classNode.interfaces?.forEach(iface => {
        recordTypeRelationship({
            child: classNode.name,
            parent: iface,
            type: 'IMPLEMENTS'
        });
    });
    
    // TypeScript
    if (ts.isClassDeclaration(node)) {
        node.heritageClauses?.forEach(clause => {
            clause.types.forEach(type => {
                recordTypeRelationship({
                    child: node.name.text,
                    parent: type.expression.getText(),
                    type: clause.token === ts.SyntaxKind.ExtendsKeyword ? 'EXTENDS' : 'IMPLEMENTS'
                });
            });
        });
    }
}
```

### 5. Graph Search & Traversal

#### Smart Search Algorithm

```typescript
class RelationshipSearch {
    /**
     * Search for "payment" - return everything related
     */
    async searchWithRelationships(query: string): Promise<SearchResult> {
        // Step 1: Find direct matches (existing)
        const directMatches = await this.searchEntities(query);
        
        // Step 2: Find related entities via relationships
        const relatedEntities = new Set<Entity>();
        
        for (const entity of directMatches) {
            // Find what this entity calls
            const callees = await this.findCallees(entity.id);
            relatedEntities.add(...callees);
            
            // Find what calls this entity
            const callers = await this.findCallers(entity.id);
            relatedEntities.add(...callers);
            
            // Find types this entity uses
            const usedTypes = await this.findUsedTypes(entity.id);
            relatedEntities.add(...usedTypes);
            
            // Find data flow through this entity
            const dataFlow = await this.findDataFlow(entity.id);
            relatedEntities.add(...dataFlow);
        }
        
        return {
            directMatches,
            relatedEntities: Array.from(relatedEntities),
            relationships: await this.buildRelationshipGraph(directMatches, relatedEntities)
        };
    }
    
    /**
     * Find all methods that call payment gateway
     */
    async findCallees(entityId: string): Promise<Entity[]> {
        const result = this.db.exec(`
            SELECT target_entity_id, relationship_type, line_number
            FROM entity_relationships
            WHERE source_entity_id = ? AND relationship_type = 'CALLS'
        `, [entityId]);
        
        return this.hydrateEntities(result);
    }
    
    /**
     * Find all methods that call THIS method (reverse call graph)
     */
    async findCallers(entityId: string): Promise<Entity[]> {
        const result = this.db.exec(`
            SELECT source_entity_id, relationship_type, line_number
            FROM entity_relationships
            WHERE target_entity_id = ? AND relationship_type = 'CALLS'
        `, [entityId]);
        
        return this.hydrateEntities(result);
    }
    
    /**
     * Track data flow: find where "Transaction" object flows
     */
    async findDataFlow(entityId: string): Promise<DataFlowPath[]> {
        // Find variable definitions in this entity
        const variables = this.db.exec(`
            SELECT variable_name, variable_type, source_location, usage_location
            FROM data_flow
            WHERE method_id = ?
        `, [entityId]);
        
        // For each variable, trace where it goes
        const paths = [];
        for (const variable of variables) {
            const usages = await this.traceVariableUsage(variable.variable_name, variable.variable_type);
            paths.push({
                variable: variable.variable_name,
                type: variable.variable_type,
                flow: usages
            });
        }
        
        return paths;
    }
}
```

#### Graph Traversal Algorithms

```typescript
/**
 * Find all paths from A to B
 * Example: "How does CheckoutController reach PaymentGateway?"
 */
async findPathsBetween(sourceId: string, targetId: string): Promise<Path[]> {
    const visited = new Set<string>();
    const paths: Path[] = [];
    
    const dfs = (currentId: string, path: string[]) => {
        if (currentId === targetId) {
            paths.push([...path, currentId]);
            return;
        }
        
        if (visited.has(currentId)) return;
        visited.add(currentId);
        
        // Find all entities this one calls
        const neighbors = this.findCallees(currentId);
        for (const neighbor of neighbors) {
            dfs(neighbor.id, [...path, currentId]);
        }
    };
    
    dfs(sourceId, []);
    return paths;
}

/**
 * Find all methods that eventually call payment gateway (transitive closure)
 */
async findTransitiveCallers(targetId: string, maxDepth: number = 5): Promise<Entity[]> {
    const allCallers = new Set<string>();
    const queue: Array<{id: string, depth: number}> = [{id: targetId, depth: 0}];
    const visited = new Set<string>();
    
    while (queue.length > 0) {
        const {id, depth} = queue.shift()!;
        if (depth >= maxDepth || visited.has(id)) continue;
        visited.add(id);
        
        const callers = await this.findCallers(id);
        for (const caller of callers) {
            allCallers.add(caller.id);
            queue.push({id: caller.id, depth: depth + 1});
        }
    }
    
    return this.hydrateEntities(Array.from(allCallers));
}
```

### 6. Example Search Results

#### Before (Current KB):
```
Query: "payment"

Results:
- PaymentService.java
- PaymentController.java
- Payment.proto
```

#### After (Relationship-Aware KB):
```
Query: "payment"

Results:

📦 Direct Matches (3):
  - PaymentService.java
  - PaymentController.java  
  - Payment.proto

🔗 Related Entities (12):
  Methods calling PaymentGateway:
    - PaymentService.processPayment() [line 45]
    - PaymentService.refundPayment() [line 89]
    - SubscriptionService.chargeSubscription() [line 123]
    
  Transaction Object Flow:
    PaymentRequest → processPayment() → PaymentGateway.createTransaction()
                  → Transaction → finalizePayment() → PaymentResult
    
  Dependencies:
    CheckoutController DEPENDS_ON PaymentService
    PaymentService DEPENDS_ON PaymentGateway
    PaymentGateway DEPENDS_ON HttpClient
    
  Type Hierarchy:
    PaymentService IMPLEMENTS IPaymentService
    PaymentGateway EXTENDS AbstractGateway

💡 Context:
  - 3 classes use PaymentService
  - PaymentGateway is called from 4 different methods
  - Transaction object flows through 6 methods
  - Payment feature spans 8 files
```

### 7. Implementation Plan

#### Phase 1: Schema & Core Infrastructure (Week 1)
- [ ] Add relationship tables to schema
- [ ] Create RelationshipIndexer class
- [ ] Update KnowledgeBaseManager to use relationships

#### Phase 2: Call Graph Analysis (Week 2)
- [ ] Enhance Java parser to extract method calls
- [ ] Enhance TypeScript parser to extract method calls
- [ ] Store call relationships in database
- [ ] Implement findCallers() and findCallees()

#### Phase 3: Data Flow Analysis (Week 3)
- [ ] Track variable definitions and usages
- [ ] Build data flow graph
- [ ] Implement flow tracing algorithms

#### Phase 4: Type System Analysis (Week 4)
- [ ] Extract class hierarchies
- [ ] Extract interface implementations
- [ ] Store type relationships

#### Phase 5: Smart Search Integration (Week 5)
- [ ] Implement relationship-aware search
- [ ] Add graph traversal to search results
- [ ] Update UI to show relationships

#### Phase 6: Advanced Queries (Week 6)
- [ ] "Find all paths from X to Y"
- [ ] "What calls this method?"
- [ ] "Where is this data used?"
- [ ] "Show me the transaction flow"

### 8. Performance Optimizations

#### Indexing Strategy
```sql
-- Optimize for common queries
CREATE INDEX idx_calls_by_source ON call_graph(caller_id, callee_id);
CREATE INDEX idx_calls_by_target ON call_graph(callee_id, caller_id);

-- Optimize relationship queries
CREATE INDEX idx_rel_source_type ON entity_relationships(source_entity_id, relationship_type);
CREATE INDEX idx_rel_target_type ON entity_relationships(target_entity_id, relationship_type);

-- Optimize data flow queries
CREATE INDEX idx_flow_type_method ON data_flow(variable_type, method_id);
```

#### Caching Strategy
```typescript
class RelationshipCache {
    private callGraphCache = new Map<string, Set<string>>();
    private reverseCallGraphCache = new Map<string, Set<string>>();
    
    async getCallers(entityId: string): Promise<string[]> {
        if (!this.reverseCallGraphCache.has(entityId)) {
            const callers = await this.db.query(/* ... */);
            this.reverseCallGraphCache.set(entityId, new Set(callers));
        }
        return Array.from(this.reverseCallGraphCache.get(entityId)!);
    }
}
```

### 9. Query DSL (Domain Specific Language)

```typescript
// Natural language-like queries
kb.query()
  .find('payment')
  .withRelationships(['CALLS', 'USES'])
  .depth(3)
  .execute();

// Find all methods that eventually call PaymentGateway
kb.query()
  .findTransitiveCallers('PaymentGateway')
  .maxDepth(5)
  .execute();

// Find data flow
kb.query()
  .traceDataFlow('Transaction')
  .from('processPayment')
  .to('saveToDatabase')
  .execute();

// Find all implementations
kb.query()
  .findImplementations('IPaymentService')
  .includeSubclasses()
  .execute();
```

### 10. Visualization

```typescript
// Generate relationship graph for visualization
const graph = await kb.buildRelationshipGraph('payment');

// Output:
{
    nodes: [
        {id: 'PaymentService', type: 'class', label: 'PaymentService'},
        {id: 'PaymentGateway', type: 'class', label: 'PaymentGateway'},
        {id: 'processPayment', type: 'method', label: 'processPayment()'}
    ],
    edges: [
        {from: 'PaymentService', to: 'processPayment', type: 'CONTAINS'},
        {from: 'processPayment', to: 'PaymentGateway', type: 'CALLS'}
    ]
}
```

## Benefits

### 1. Smarter Search
- Find not just entities, but their context
- Understand how code connects
- Discover hidden dependencies

### 2. Impact Analysis
- "What will break if I change this?"
- Find all transitive dependencies
- Trace data flow

### 3. Feature Understanding
- See complete feature implementation
- Understand data flow through features
- Find all related code

### 4. Code Navigation
- Jump to callers/callees
- Follow data flow
- Explore type hierarchies

### 5. Documentation Generation
- Auto-generate call graphs
- Auto-generate data flow diagrams
- Auto-generate dependency graphs

## Conclusion

This design transforms AutoForge from a simple entity store to a **relationship-aware knowledge graph** that understands:
- **Structure:** What calls what
- **Data:** How data flows
- **Types:** Class hierarchies and implementations
- **Dependencies:** What depends on what

All using **static analysis** - no LLM, no paid tools, pure AST parsing and graph algorithms!

## Next Steps

1. Start with Phase 1: Schema & Core Infrastructure
2. Implement call graph extraction first (most valuable)
3. Add data flow analysis second
4. Iterate based on user feedback
