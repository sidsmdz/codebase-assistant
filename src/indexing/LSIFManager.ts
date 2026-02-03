import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface LSIFVertex {
    id: string | number;
    type: string;
    label: string;
    [key: string]: any;
}

interface LSIFEdge {
    id: string | number;
    type: 'edge';
    label: string;
    outV: string | number;
    inV: string | number | Array<string | number>;
    [key: string]: any;
}

interface LSIFDocument {
    uri: string;
    languageId: string;
    contents?: string;
}

interface LSIFRange {
    start: { line: number; character: number };
    end: { line: number; character: number };
}

interface LSIFDefinition {
    uri: string;
    range: LSIFRange;
    symbol: string;
}

interface LSIFReference {
    uri: string;
    range: LSIFRange;
}

interface LSIFHoverInfo {
    contents: string[];
    range: LSIFRange;
}

interface LSIFCallGraphEntry {
    caller: string;
    callee: string;
    uri: string;
    line: number;
}

export class LSIFManager {
    private vertices: Map<string | number, LSIFVertex> = new Map();
    private edges: Map<string | number, LSIFEdge> = new Map();
    private documents: Map<string, LSIFDocument> = new Map();
    private ranges: Map<string | number, any> = new Map();
    
    // Indexes for fast lookups
    private definitionIndex: Map<string, LSIFDefinition[]> = new Map();
    private referenceIndex: Map<string, LSIFReference[]> = new Map();
    private hoverIndex: Map<string, LSIFHoverInfo> = new Map();
    private callGraphIndex: Map<string, LSIFCallGraphEntry[]> = new Map();

    /**
     * Load LSIF data from a JSON or NDJSON file
     */
    async loadFromFile(filePath: string): Promise<void> {
        console.log(`Loading LSIF from: ${filePath}`);
        
        const ext = path.extname(filePath).toLowerCase();
        
        if (ext === '.json') {
            await this.loadJSON(filePath);
        } else if (ext === '.ndjson' || ext === '.lsif') {
            await this.loadNDJSON(filePath);
        } else {
            throw new Error(`Unsupported LSIF file format: ${ext}`);
        }

        // Build indexes after loading
        this.buildIndexes();
    }

    /**
     * Load from standard JSON file
     */
    private async loadJSON(filePath: string): Promise<void> {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        if (Array.isArray(data)) {
            for (const item of data) {
                this.processItem(item);
            }
        } else {
            throw new Error('LSIF JSON file must contain an array of items');
        }
    }

    /**
     * Load from NDJSON (newline-delimited JSON) file
     */
    private async loadNDJSON(filePath: string): Promise<void> {
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            if (line.trim()) {
                try {
                    const item = JSON.parse(line);
                    this.processItem(item);
                } catch (error) {
                    console.error('Failed to parse LSIF line:', error);
                }
            }
        }
    }

    /**
     * Process a single LSIF item (vertex or edge)
     */
    private processItem(item: any): void {
        if (item.type === 'vertex') {
            this.vertices.set(item.id, item as LSIFVertex);
            
            // Store specific types
            if (item.label === 'document') {
                this.documents.set(item.uri, item as LSIFDocument);
            } else if (item.label === 'range') {
                this.ranges.set(item.id, item);
            }
        } else if (item.type === 'edge') {
            this.edges.set(item.id, item as LSIFEdge);
        }
    }

    /**
     * Build indexes for fast queries
     */
    private buildIndexes(): void {
        console.log('Building LSIF indexes...');
        
        // Process edges to build indexes
        for (const edge of this.edges.values()) {
            switch (edge.label) {
                case 'textDocument/definition':
                    this.indexDefinition(edge);
                    break;
                case 'textDocument/references':
                    this.indexReferences(edge);
                    break;
                case 'textDocument/hover':
                    this.indexHover(edge);
                    break;
                case 'callHierarchy/outgoingCalls':
                    this.indexCallGraph(edge);
                    break;
            }
        }

        console.log(`Indexed ${this.definitionIndex.size} definitions, ${this.referenceIndex.size} reference sets, ${this.hoverIndex.size} hover infos`);
    }

    /**
     * Index definition edges
     */
    private indexDefinition(edge: LSIFEdge): void {
        const sourceRange = this.ranges.get(edge.outV);
        if (!sourceRange) {
            return;
        }

        const targetRanges = Array.isArray(edge.inV) ? edge.inV : [edge.inV];
        
        for (const targetId of targetRanges) {
            const targetRange = this.ranges.get(targetId);
            if (targetRange) {
                const doc = this.findDocumentForRange(targetRange);
                if (doc) {
                    const symbol = this.extractSymbolName(sourceRange);
                    const key = `${doc.uri}:${symbol}`;
                    
                    if (!this.definitionIndex.has(key)) {
                        this.definitionIndex.set(key, []);
                    }
                    
                    this.definitionIndex.get(key)!.push({
                        uri: doc.uri,
                        range: targetRange,
                        symbol
                    });
                }
            }
        }
    }

    /**
     * Index reference edges
     */
    private indexReferences(edge: LSIFEdge): void {
        const resultSet = this.vertices.get(edge.inV as string | number);
        if (!resultSet) {
            return;
        }

        // Find all ranges that reference this result set
        for (const refEdge of this.edges.values()) {
            if (refEdge.label === 'item' && refEdge.outV === resultSet.id) {
                const ranges = Array.isArray(refEdge.inV) ? refEdge.inV : [refEdge.inV];
                
                for (const rangeId of ranges) {
                    const range = this.ranges.get(rangeId);
                    if (range) {
                        const doc = this.findDocumentForRange(range);
                        if (doc) {
                            const symbol = this.extractSymbolName(range);
                            const key = `${doc.uri}:${symbol}`;
                            
                            if (!this.referenceIndex.has(key)) {
                                this.referenceIndex.set(key, []);
                            }
                            
                            this.referenceIndex.get(key)!.push({
                                uri: doc.uri,
                                range: range
                            });
                        }
                    }
                }
            }
        }
    }

    /**
     * Index hover information
     */
    private indexHover(edge: LSIFEdge): void {
        const range = this.ranges.get(edge.outV);
        const hoverResult = this.vertices.get(edge.inV as string | number);
        
        if (range && hoverResult) {
            const doc = this.findDocumentForRange(range);
            if (doc) {
                const symbol = this.extractSymbolName(range);
                const key = `${doc.uri}:${symbol}`;
                
                this.hoverIndex.set(key, {
                    contents: hoverResult.result?.contents || [],
                    range: range
                });
            }
        }
    }

    /**
     * Index call graph edges
     */
    private indexCallGraph(edge: LSIFEdge): void {
        const callerRange = this.ranges.get(edge.outV);
        if (!callerRange) {
            return;
        }

        const calleeRanges = Array.isArray(edge.inV) ? edge.inV : [edge.inV];
        
        for (const calleeId of calleeRanges) {
            const calleeRange = this.ranges.get(calleeId);
            if (calleeRange) {
                const callerDoc = this.findDocumentForRange(callerRange);
                const calleeDoc = this.findDocumentForRange(calleeRange);
                
                if (callerDoc && calleeDoc) {
                    const caller = this.extractSymbolName(callerRange);
                    const callee = this.extractSymbolName(calleeRange);
                    const key = caller;
                    
                    if (!this.callGraphIndex.has(key)) {
                        this.callGraphIndex.set(key, []);
                    }
                    
                    this.callGraphIndex.get(key)!.push({
                        caller,
                        callee,
                        uri: callerDoc.uri,
                        line: callerRange.start.line
                    });
                }
            }
        }
    }

    /**
     * Find definitions for a symbol
     */
    findDefinitions(symbol: string, uri?: string): LSIFDefinition[] {
        if (uri) {
            return this.definitionIndex.get(`${uri}:${symbol}`) || [];
        }
        
        // Search across all URIs
        const results: LSIFDefinition[] = [];
        for (const [key, defs] of this.definitionIndex.entries()) {
            if (key.endsWith(`:${symbol}`)) {
                results.push(...defs);
            }
        }
        return results;
    }

    /**
     * Find references for a symbol
     */
    findReferences(symbol: string, uri?: string): LSIFReference[] {
        if (uri) {
            return this.referenceIndex.get(`${uri}:${symbol}`) || [];
        }
        
        // Search across all URIs
        const results: LSIFReference[] = [];
        for (const [key, refs] of this.referenceIndex.entries()) {
            if (key.endsWith(`:${symbol}`)) {
                results.push(...refs);
            }
        }
        return results;
    }

    /**
     * Get hover information for a symbol
     */
    getHoverInfo(symbol: string, uri: string): LSIFHoverInfo | null {
        return this.hoverIndex.get(`${uri}:${symbol}`) || null;
    }

    /**
     * Build call graph from LSIF data
     */
    buildCallGraph(): Map<string, string[]> {
        const callGraph = new Map<string, string[]>();
        
        for (const [caller, entries] of this.callGraphIndex.entries()) {
            const callees = entries.map(e => e.callee);
            callGraph.set(caller, callees);
        }
        
        return callGraph;
    }

    /**
     * Get all documents in the LSIF dump
     */
    getDocuments(): LSIFDocument[] {
        return Array.from(this.documents.values());
    }

    /**
     * Find document containing a specific range
     */
    private findDocumentForRange(range: any): LSIFDocument | null {
        // LSIF ranges should have document reference
        if (range.document) {
            const doc = this.vertices.get(range.document);
            if (doc && doc.label === 'document') {
                return doc as unknown as LSIFDocument;
            }
        }
        
        // Fallback: search through edges
        for (const edge of this.edges.values()) {
            if (edge.label === 'contains' && 
                Array.isArray(edge.inV) && 
                edge.inV.includes(range.id)) {
                const doc = this.vertices.get(edge.outV);
                if (doc && doc.label === 'document') {
                    return doc as unknown as LSIFDocument;
                }
            }
        }
        
        return null;
    }

    /**
     * Extract symbol name from a range (simplified)
     */
    private extractSymbolName(range: any): string {
        // Try to get from tag or label
        if (range.tag?.text) {
            return range.tag.text;
        }
        
        // Fallback to range ID
        return `range_${range.id}`;
    }

    /**
     * Export relationships in a format compatible with RelationshipIndexer
     */
    exportRelationships(): Array<{
        sourceEntity: string;
        targetEntity: string;
        relationType: string;
        sourceFile: string;
        sourceLine: number;
        metadata?: any;
    }> {
        const relationships: Array<any> = [];
        
        // Export call graph relationships
        for (const [caller, entries] of this.callGraphIndex.entries()) {
            for (const entry of entries) {
                relationships.push({
                    sourceEntity: entry.caller,
                    targetEntity: entry.callee,
                    relationType: 'CALLS',
                    sourceFile: entry.uri,
                    sourceLine: entry.line + 1,
                    metadata: { source: 'LSIF' }
                });
            }
        }
        
        // Export definition relationships
        for (const [key, defs] of this.definitionIndex.entries()) {
            const [uri, symbol] = key.split(':');
            for (const def of defs) {
                relationships.push({
                    sourceEntity: symbol,
                    targetEntity: symbol,
                    relationType: 'DEFINES',
                    sourceFile: uri,
                    sourceLine: def.range.start.line + 1,
                    metadata: { source: 'LSIF' }
                });
            }
        }
        
        return relationships;
    }

    /**
     * Clear all data
     */
    clear(): void {
        this.vertices.clear();
        this.edges.clear();
        this.documents.clear();
        this.ranges.clear();
        this.definitionIndex.clear();
        this.referenceIndex.clear();
        this.hoverIndex.clear();
        this.callGraphIndex.clear();
    }

    /**
     * Get statistics about loaded LSIF data
     */
    getStats() {
        return {
            vertices: this.vertices.size,
            edges: this.edges.size,
            documents: this.documents.size,
            definitions: this.definitionIndex.size,
            references: this.referenceIndex.size,
            hoverInfos: this.hoverIndex.size,
            callGraphEntries: Array.from(this.callGraphIndex.values()).reduce((sum, arr) => sum + arr.length, 0)
        };
    }
}
