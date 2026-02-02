# Hybrid Knowledge Base: Tree-sitter + LSIF

## The Power of Combining Both Tools

### Tree-sitter: Real-time Parsing
**When to use:** File changes, incremental updates, on-the-fly analysis
**What it gives:** AST, syntax structure, immediate parsing

### LSIF: Pre-computed Intelligence
**When to use:** Large codebases, static analysis, IDE-quality data
**What it gives:** Call graphs, definitions, references, hover info, all in JSON

## LSIF Deep Dive: Capturing Language Server Knowledge

### What is LSIF Really?

LSIF is a **dump of everything your Language Server knows**:
- Every definition (classes, methods, variables)
- Every reference (who calls what, who uses what)
- Every hover tooltip (type info, documentation)
- Every implementation (interface → class mappings)
- Type hierarchies (extends, implements)
- Diagnostics (errors, warnings)

**All stored in a JSON file** that you can query instantly!

### LSIF Structure Example

```json
{
  "vertices": [
    {
      "id": "1",
      "type": "vertex",
      "label": "document",
      "uri": "file:///src/PaymentService.java",
      "languageId": "java"
    },
    {
      "id": "2",
      "type": "vertex",
      "label": "range",
      "start": { "line": 10, "character": 4 },
      "end": { "line": 10, "character": 24 }
    },
    {
      "id": "3",
      "type": "vertex",
      "label": "resultSet"
    },
    {
      "id": "4",
      "type": "vertex",
      "label": "definitionResult"
    },
    {
      "id": "5",
      "type": "vertex",
      "label": "hoverResult",
      "result": {
        "contents": {
          "kind": "markdown",
          "value": "```java\npublic PaymentResult processPayment(PaymentRequest request)\n```\nProcesses a payment request and returns the result."
        }
      }
    },
    {
      "id": "6",
      "type": "vertex",
      "label": "referenceResult"
    }
  ],
  "edges": [
    {
      "id": "7",
      "type": "edge",
      "label": "contains",
      "outV": "1",
      "inVs": ["2"]
    },
    {
      "id": "8",
      "type": "edge",
      "label": "next",
      "outV": "2",
      "inV": "3"
    },
    {
      "id": "9",
      "type": "edge",
      "label": "textDocument/definition",
      "outV": "3",
      "inV": "4"
    },
    {
      "id": "10",
      "type": "edge",
      "label": "textDocument/hover",
      "outV": "3",
      "inV": "5"
    },
    {
      "id": "11",
      "type": "edge",
      "label": "textDocument/references",
      "outV": "3",
      "inV": "6"
    },
    {
      "id": "12",
      "type": "edge",
      "label": "item",
      "outV": "6",
      "inVs": ["100", "101", "102"],
      "property": "referenceResults"
    }
  ]
}
```

### What This Gives You

From this LSIF dump, you can instantly:

1. **Find all references** to `processPayment` → vertices 100, 101, 102
2. **Get hover info** → "Processes a payment request..."
3. **Jump to definition** → Line 10, character 4
4. **Find implementations** → Follow "item" edges
5. **Build call graph** → Follow "references" chains

**No parsing needed!** It's all pre-computed by the Language Server.

## Hybrid Architecture: Best of Both Worlds

```
┌─────────────────────────────────────────────────────────┐
│                    Knowledge Base                         │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌───────────────────┐         ┌──────────────────────┐ │
│  │   LSIF Index      │         │   Tree-sitter Cache  │ │
│  │   (JSON file)     │         │   (In-memory AST)    │ │
│  │                   │         │                      │ │
│  │ • Pre-computed    │         │ • Real-time parsing  │ │
│  │ • Call graphs     │         │ • Incremental        │ │
│  │ • References      │         │ • Fast updates       │ │
│  │ • Definitions     │         │ • Syntax-aware       │ │
│  │ • Type info       │         │                      │ │
│  └───────────────────┘         └──────────────────────┘ │
│            ▲                              ▲              │
│            │                              │              │
│            │                              │              │
│  ┌─────────┴──────────────────────────────┴───────────┐ │
│  │         Hybrid Query Engine                        │ │
│  │                                                     │ │
│  │  1. Try LSIF first (instant, complete)            │ │
│  │  2. Fall back to tree-sitter (fast, accurate)     │ │
│  │  3. Cache tree-sitter results                     │ │
│  │  4. Update LSIF periodically                      │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

## Implementation: Hybrid Query Engine

### 1. LSIF Manager

```typescript
/**
 * LSIFManager - Load and query LSIF dumps
 */
import * as fs from 'fs/promises';
import { Database } from 'sql.js';

interface LSIFVertex {
    id: string;
    type: 'vertex';
    label: string;
    [key: string]: any;
}

interface LSIFEdge {
    id: string;
    type: 'edge';
    label: string;
    outV: string;
    inV?: string;
    inVs?: string[];
    [key: string]: any;
}

export class LSIFManager {
    private vertices: Map<string, LSIFVertex> = new Map();
    private edges: LSIFEdge[] = [];
    private verticesByLabel: Map<string, LSIFVertex[]> = new Map();
    private edgesByLabel: Map<string, LSIFEdge[]> = new Map();
    
    /**
     * Load LSIF dump from JSON file
     */
    async loadFromFile(lsifPath: string): Promise<void> {
        console.log('Loading LSIF from:', lsifPath);
        
        // LSIF can be JSON or NDJSON (newline-delimited JSON)
        const content = await fs.readFile(lsifPath, 'utf-8');
        const lines = content.trim().split('\n');
        
        for (const line of lines) {
            const item = JSON.parse(line);
            
            if (item.type === 'vertex') {
                this.vertices.set(item.id, item);
                
                // Index by label for fast queries
                if (!this.verticesByLabel.has(item.label)) {
                    this.verticesByLabel.set(item.label, []);
                }
                this.verticesByLabel.get(item.label)!.push(item);
                
            } else if (item.type === 'edge') {
                this.edges.push(item);
                
                // Index by label
                if (!this.edgesByLabel.has(item.label)) {
                    this.edgesByLabel.set(item.label, []);
                }
                this.edgesByLabel.get(item.label)!.push(item);
            }
        }
        
        console.log(`Loaded ${this.vertices.size} vertices, ${this.edges.length} edges`);
    }
    
    /**
     * Import LSIF data into SQLite knowledge base
     */
    async importIntoKB(db: Database): Promise<void> {
        console.log('Importing LSIF into knowledge base...');
        
        // Import definitions (classes, methods, etc.)
        const definitionResults = this.verticesByLabel.get('definitionResult') || [];
        
        for (const defResult of definitionResults) {
            // Find the range and document for this definition
            const range = await this.getDefinitionRange(defResult.id);
            const doc = await this.getDocument(range?.documentId);
            
            if (range && doc) {
                // Extract entity info
                const entity = await this.extractEntityInfo(defResult, range, doc);
                
                // Store in ast_nodes table
                db.run(`
                    INSERT OR REPLACE INTO ast_nodes (
                        id, node_type, identifier, signature,
                        file_path, start_line, end_line, language
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    entity.id,
                    entity.type,
                    entity.identifier,
                    entity.signature,
                    entity.filePath,
                    entity.startLine,
                    entity.endLine,
                    entity.language
                ]);
            }
        }
        
        // Import references (method calls)
        const referenceResults = this.verticesByLabel.get('referenceResult') || [];
        
        for (const refResult of referenceResults) {
            await this.importReferences(refResult, db);
        }
        
        // Import type hierarchy
        const implementationResults = this.verticesByLabel.get('implementationResult') || [];
        
        for (const implResult of implementationResults) {
            await this.importImplementations(implResult, db);
        }
        
        console.log('LSIF import complete');
    }
    
    /**
     * Find all references to a symbol
     */
    async findReferences(symbolId: string): Promise<Array<{
        filePath: string;
        line: number;
        character: number;
    }>> {
        const references: Array<{filePath: string; line: number; character: number}> = [];
        
        // Find reference edges pointing to this symbol
        const refEdges = this.edgesByLabel.get('textDocument/references') || [];
        
        for (const edge of refEdges) {
            if (edge.outV === symbolId && edge.inV) {
                const refResult = this.vertices.get(edge.inV);
                if (!refResult) continue;
                
                // Get reference items
                const itemEdges = this.edges.filter(e => 
                    e.label === 'item' && e.outV === refResult.id
                );
                
                for (const itemEdge of itemEdges) {
                    const rangeIds = itemEdge.inVs || [];
                    for (const rangeId of rangeIds) {
                        const range = this.vertices.get(rangeId);
                        if (range && range.label === 'range') {
                            const doc = await this.getDocumentForRange(rangeId);
                            if (doc) {
                                references.push({
                                    filePath: doc.uri.replace('file://', ''),
                                    line: range.start.line,
                                    character: range.start.character
                                });
                            }
                        }
                    }
                }
            }
        }
        
        return references;
    }
    
    /**
     * Get hover info for a symbol
     */
    async getHoverInfo(symbolId: string): Promise<string | null> {
        const hoverEdges = this.edgesByLabel.get('textDocument/hover') || [];
        
        for (const edge of hoverEdges) {
            if (edge.outV === symbolId && edge.inV) {
                const hoverResult = this.vertices.get(edge.inV);
                if (hoverResult?.result?.contents) {
                    return hoverResult.result.contents.value;
                }
            }
        }
        
        return null;
    }
    
    /**
     * Find all implementations of an interface
     */
    async findImplementations(interfaceId: string): Promise<string[]> {
        const implementations: string[] = [];
        
        const implEdges = this.edgesByLabel.get('textDocument/implementation') || [];
        
        for (const edge of implEdges) {
            if (edge.outV === interfaceId && edge.inV) {
                const implResult = this.vertices.get(edge.inV);
                if (implResult) {
                    // Get implementation items
                    const itemEdges = this.edges.filter(e =>
                        e.label === 'item' && e.outV === implResult.id
                    );
                    
                    for (const itemEdge of itemEdges) {
                        if (itemEdge.inVs) {
                            implementations.push(...itemEdge.inVs);
                        }
                    }
                }
            }
        }
        
        return implementations;
    }
    
    /**
     * Build call graph from LSIF
     */
    async buildCallGraph(): Promise<Map<string, string[]>> {
        const callGraph = new Map<string, string[]>();
        
        // References represent method calls
        const referenceEdges = this.edgesByLabel.get('textDocument/references') || [];
        
        for (const edge of referenceEdges) {
            const caller = edge.outV;
            const refResult = this.vertices.get(edge.inV!);
            
            if (refResult) {
                const itemEdges = this.edges.filter(e =>
                    e.label === 'item' && e.outV === refResult.id
                );
                
                for (const itemEdge of itemEdges) {
                    const callees = itemEdge.inVs || [];
                    
                    if (!callGraph.has(caller)) {
                        callGraph.set(caller, []);
                    }
                    callGraph.get(caller)!.push(...callees);
                }
            }
        }
        
        return callGraph;
    }
    
    // Helper methods
    private async getDefinitionRange(defResultId: string): Promise<any> {
        const itemEdges = this.edges.filter(e =>
            e.label === 'item' && e.outV === defResultId
        );
        
        if (itemEdges.length > 0 && itemEdges[0].inVs?.[0]) {
            return this.vertices.get(itemEdges[0].inVs[0]);
        }
        return null;
    }
    
    private async getDocument(rangeId: string): Promise<any> {
        const containsEdges = this.edges.filter(e =>
            e.label === 'contains' && e.inVs?.includes(rangeId)
        );
        
        if (containsEdges.length > 0) {
            return this.vertices.get(containsEdges[0].outV);
        }
        return null;
    }
    
    private async getDocumentForRange(rangeId: string): Promise<any> {
        return this.getDocument(rangeId);
    }
    
    private async extractEntityInfo(defResult: any, range: any, doc: any): Promise<any> {
        const hoverInfo = await this.getHoverInfo(defResult.id);
        
        return {
            id: defResult.id,
            type: this.inferTypeFromHover(hoverInfo),
            identifier: this.extractIdentifierFromHover(hoverInfo),
            signature: hoverInfo?.split('\n')[0] || '',
            filePath: doc.uri.replace('file://', ''),
            startLine: range.start.line + 1,
            endLine: range.end.line + 1,
            language: doc.languageId
        };
    }
    
    private inferTypeFromHover(hoverInfo: string | null): string {
        if (!hoverInfo) return 'UNKNOWN';
        if (hoverInfo.includes('class ')) return 'CLASS';
        if (hoverInfo.includes('interface ')) return 'INTERFACE';
        if (hoverInfo.includes('(') && hoverInfo.includes(')')) return 'METHOD';
        return 'VARIABLE';
    }
    
    private extractIdentifierFromHover(hoverInfo: string | null): string {
        if (!hoverInfo) return 'Unknown';
        
        // Extract method/class name from signature
        const match = hoverInfo.match(/(?:class|interface)?\s*(\w+)\s*(?:\(|{)/);
        return match?.[1] || 'Unknown';
    }
    
    private async importReferences(refResult: any, db: Database): Promise<void> {
        // Implementation for importing reference relationships
        // Similar to importIntoKB but specifically for method calls
    }
    
    private async importImplementations(implResult: any, db: Database): Promise<void> {
        // Implementation for importing type hierarchies
    }
}
```

### 2. Tree-sitter Manager

```typescript
/**
 * TreeSitterManager - Real-time parsing with tree-sitter
 */
import Parser from 'tree-sitter';
import Java from 'tree-sitter-java';
import TypeScript from 'tree-sitter-typescript';

export class TreeSitterManager {
    private parsers: Map<string, Parser> = new Map();
    private trees: Map<string, Parser.Tree> = new Map();
    
    constructor() {
        // Initialize parsers for different languages
        const javaParser = new Parser();
        javaParser.setLanguage(Java);
        this.parsers.set('java', javaParser);
        
        const tsParser = new Parser();
        tsParser.setLanguage(TypeScript.typescript);
        this.parsers.set('typescript', tsParser);
    }
    
    /**
     * Parse file and cache tree
     */
    parse(filePath: string, code: string, language: string): Parser.Tree {
        const parser = this.parsers.get(language);
        if (!parser) {
            throw new Error(`No parser for language: ${language}`);
        }
        
        // Try incremental parsing if we have old tree
        const oldTree = this.trees.get(filePath);
        const tree = parser.parse(code, oldTree);
        
        this.trees.set(filePath, tree);
        return tree;
    }
    
    /**
     * Update tree with edits (incremental parsing)
     */
    update(
        filePath: string,
        code: string,
        language: string,
        edit: Parser.Edit
    ): Parser.Tree {
        const oldTree = this.trees.get(filePath);
        if (!oldTree) {
            return this.parse(filePath, code, language);
        }
        
        // Apply edit to old tree
        oldTree.edit(edit);
        
        // Incremental re-parse (very fast!)
        const parser = this.parsers.get(language);
        const newTree = parser!.parse(code, oldTree);
        
        this.trees.set(filePath, newTree);
        return newTree;
    }
    
    /**
     * Extract relationships from tree
     */
    extractRelationships(tree: Parser.Tree, filePath: string): EnhancedParseResult {
        // Use the tree-sitter query system
        return {
            nodes: this.extractNodes(tree, filePath),
            relationships: {
                methodCalls: this.extractMethodCalls(tree, filePath),
                dataFlows: this.extractDataFlows(tree, filePath),
                typeHierarchies: this.extractTypeHierarchies(tree, filePath)
            }
        };
    }
    
    private extractNodes(tree: Parser.Tree, filePath: string): ASTNode[] {
        const nodes: ASTNode[] = [];
        
        // Query for classes
        const classQuery = tree.rootNode.descendantsOfType('class_declaration');
        for (const classNode of classQuery) {
            nodes.push(this.nodeToAST(classNode, 'CLASS', filePath));
        }
        
        // Query for methods
        const methodQuery = tree.rootNode.descendantsOfType('method_declaration');
        for (const methodNode of methodQuery) {
            nodes.push(this.nodeToAST(methodNode, 'METHOD', filePath));
        }
        
        return nodes;
    }
    
    private nodeToAST(node: Parser.SyntaxNode, type: string, filePath: string): ASTNode {
        const nameNode = node.childForFieldName('name');
        
        return {
            id: `${filePath}:${node.startPosition.row}`,
            type: type as any,
            identifier: nameNode?.text || 'Unknown',
            signature: node.text.split('\n')[0],
            filePath,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            language: 'java'
        };
    }
    
    private extractMethodCalls(tree: Parser.Tree, filePath: string): MethodCall[] {
        // Implementation using tree-sitter queries
        return [];
    }
    
    private extractDataFlows(tree: Parser.Tree, filePath: string): DataFlowNode[] {
        // Implementation using tree-sitter queries
        return [];
    }
    
    private extractTypeHierarchies(tree: Parser.Tree, filePath: string): TypeRelationship[] {
        // Implementation using tree-sitter queries
        return [];
    }
}
```

### 3. Hybrid Query Engine

```typescript
/**
 * HybridKnowledgeBase - Combines LSIF and tree-sitter
 */
export class HybridKnowledgeBase {
    private lsifManager: LSIFManager;
    private treeSitterManager: TreeSitterManager;
    private db: Database;
    
    constructor(db: Database) {
        this.db = db;
        this.lsifManager = new LSIFManager();
        this.treeSitterManager = new TreeSitterManager();
    }
    
    /**
     * Initialize: Try to load LSIF, fall back to tree-sitter
     */
    async initialize(workspacePath: string): Promise<void> {
        const lsifPath = path.join(workspacePath, 'dump.lsif');
        
        try {
            // Try LSIF first (instant, complete)
            await this.lsifManager.loadFromFile(lsifPath);
            await this.lsifManager.importIntoKB(this.db);
            console.log('✅ Loaded from LSIF');
            
        } catch (error) {
            // Fall back to tree-sitter parsing
            console.log('⚠️ No LSIF found, using tree-sitter...');
            await this.scanWithTreeSitter(workspacePath);
        }
    }
    
    /**
     * Find references: Try LSIF first, fall back to tree-sitter
     */
    async findReferences(symbol: string): Promise<RelatedEntity[]> {
        // Try LSIF first (instant)
        try {
            const lsifRefs = await this.lsifManager.findReferences(symbol);
            if (lsifRefs.length > 0) {
                return lsifRefs.map(ref => ({
                    id: `${ref.filePath}:${ref.line}`,
                    identifier: symbol,
                    filePath: ref.filePath,
                    lineNumber: ref.line,
                    type: 'REFERENCE',
                    relationshipType: 'CALLS'
                }));
            }
        } catch (error) {
            console.log('LSIF query failed, falling back to tree-sitter');
        }
        
        // Fall back to tree-sitter + database query
        return this.relationshipSearch.findCallers(symbol);
    }
    
    /**
     * Get hover info: LSIF is perfect for this!
     */
    async getHoverInfo(symbol: string): Promise<string | null> {
        return this.lsifManager.getHoverInfo(symbol);
    }
    
    /**
     * Update single file: Use tree-sitter for incremental update
     */
    async updateFile(filePath: string, code: string, edit?: Parser.Edit): Promise<void> {
        const language = this.detectLanguage(filePath);
        
        // Incremental parse with tree-sitter (very fast!)
        const tree = edit 
            ? this.treeSitterManager.update(filePath, code, language, edit)
            : this.treeSitterManager.parse(filePath, code, language);
        
        // Extract relationships
        const result = this.treeSitterManager.extractRelationships(tree, filePath);
        
        // Update database
        await this.indexRelationships(result);
    }
    
    /**
     * Scan entire workspace with tree-sitter
     */
    private async scanWithTreeSitter(workspacePath: string): Promise<void> {
        const files = await this.findSourceFiles(workspacePath);
        
        for (const file of files) {
            const code = await fs.readFile(file, 'utf-8');
            const language = this.detectLanguage(file);
            
            const tree = this.treeSitterManager.parse(file, code, language);
            const result = this.treeSitterManager.extractRelationships(tree, file);
            
            await this.indexRelationships(result);
        }
    }
    
    private detectLanguage(filePath: string): string {
        if (filePath.endsWith('.java')) return 'java';
        if (filePath.endsWith('.ts')) return 'typescript';
        if (filePath.endsWith('.js')) return 'javascript';
        return 'unknown';
    }
    
    private async indexRelationships(result: EnhancedParseResult): Promise<void> {
        // Index into database using RelationshipIndexer
        for (const call of result.relationships.methodCalls) {
            this.relationshipIndexer.indexMethodCall(call);
        }
        // ... etc
    }
    
    private async findSourceFiles(workspacePath: string): Promise<string[]> {
        // Implementation to find all source files
        return [];
    }
}
```

## Workflow: When to Use What

### Scenario 1: Initial Scan
```
1. Check for LSIF dump → Load instantly ✅
2. No LSIF? → Use tree-sitter to parse all files
3. Cache tree-sitter results in database
```

### Scenario 2: File Changed
```
1. User edits file
2. Tree-sitter: Incremental parse (milliseconds) ✅
3. Update database with new relationships
4. Keep LSIF as fallback for unchanged files
```

### Scenario 3: Find References
```
1. Query LSIF first (instant) ✅
2. If not in LSIF → Query database (tree-sitter data)
3. Return combined results
```

### Scenario 4: Periodic Refresh
```
1. Generate fresh LSIF dump (once per day/hour)
2. Import into database
3. Discard old tree-sitter cache for those files
```

## Generating LSIF Dumps

### For Java
```bash
# Install lsif-java
npm install -g lsif-java

# Generate LSIF
cd your-java-project
lsif-java index --output dump.lsif
```

### For TypeScript
```bash
# Install lsif-tsc
npm install -g lsif-tsc

# Generate LSIF
lsif-tsc -p tsconfig.json --output dump.lsif
```

### From VS Code Command
```typescript
// Add command to generate LSIF
vscode.commands.registerCommand('autoforge.generateLSIF', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;
    
    const language = detectProjectLanguage(workspaceFolder.uri.fsPath);
    
    if (language === 'java') {
        await exec('lsif-java index', { cwd: workspaceFolder.uri.fsPath });
    } else if (language === 'typescript') {
        await exec('lsif-tsc -p tsconfig.json', { cwd: workspaceFolder.uri.fsPath });
    }
    
    vscode.window.showInformationMessage('LSIF index generated!');
});
```

## Benefits of Hybrid Approach

### LSIF Benefits
✅ **Instant queries** - No parsing overhead
✅ **Complete data** - Everything Language Server knows
✅ **IDE-quality** - Same data VS Code uses
✅ **Standard format** - Works across tools
✅ **Hover info** - Type info, documentation
✅ **Call graph** - Pre-computed relationships

### Tree-sitter Benefits
✅ **Real-time updates** - Parse on file change
✅ **Incremental** - Only re-parse changed sections
✅ **No generation step** - Works immediately
✅ **Syntax-aware** - Accurate AST
✅ **Multi-language** - Easy to add languages

### Hybrid Benefits
✅ **Fast initial load** - LSIF for bulk data
✅ **Fast updates** - Tree-sitter for changes
✅ **Fallback** - Always works even without LSIF
✅ **Best of both** - Instant queries + real-time updates

## Next Steps

1. **Install dependencies:**
   ```bash
   npm install tree-sitter tree-sitter-java tree-sitter-typescript
   npm install -g lsif-java lsif-tsc
   ```

2. **Implement LSIFManager** (loads and queries LSIF JSON)

3. **Implement TreeSitterManager** (parses with tree-sitter)

4. **Implement HybridKnowledgeBase** (combines both)

5. **Add command to generate LSIF** (`@autoforge /generate-lsif`)

6. **Test with real project!**

This hybrid approach gives you **enterprise-grade code intelligence** with the best of both worlds! 🚀
