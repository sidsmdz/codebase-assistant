import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Database } from 'sql.js';
import { LSIFManager } from '../indexing/LSIFManager';
import { LSIFGenerator } from '../indexing/LSIFGenerator';
import { TreeSitterManager } from '../parsers/TreeSitterManager';
import { RelationshipIndexer } from '../indexing/RelationshipIndexer';
import { RelationshipSearch, RelatedEntity, DataFlowPath as SearchDataFlowPath } from '../search/RelationshipSearch';

interface Relationship {
    sourceEntity: string;
    targetEntity: string;
    relationType: string;
    sourceFile: string;
    sourceLine: number;
    metadata?: any;
}

interface QueryOptions {
    type?: 'class' | 'method' | 'interface' | 'field' | 'all';
    relationship?: 'EXTENDS' | 'IMPLEMENTS' | 'CALLS' | 'USES' | 'DEFINES' | 'all';
    maxDepth?: number;
}

export class HybridKnowledgeBase {
    private lsifManager: LSIFManager;
    private lsifGenerator: LSIFGenerator;
    private treeSitterManager: TreeSitterManager;
    private relationshipIndexer: RelationshipIndexer;
    private relationshipSearch: RelationshipSearch;
    
    private lsifLoaded: boolean = false;
    private lsifCoverage: Set<string> = new Set(); // Files covered by LSIF
    private treeSitterCache: Map<string, { timestamp: number; relationships: Relationship[] }> = new Map();

    constructor(private db: Database) {
        this.lsifManager = new LSIFManager();
        this.lsifGenerator = new LSIFGenerator({
            autoGenerate: true,
            generateOnStartup: false,
            generateOnBuild: true,
            outputPath: 'lsif-output',
            incrementalUpdate: true
        });
        this.treeSitterManager = new TreeSitterManager();
        this.relationshipIndexer = new RelationshipIndexer(db);
        this.relationshipSearch = new RelationshipSearch(db);
    }

    /**
     * Initialize the hybrid knowledge base
     */
    async initialize(): Promise<void> {
        console.log('Initializing Hybrid Knowledge Base...');
        
        // Initialize tree-sitter
        await this.treeSitterManager.initialize();
        
        // Initialize LSIF generator
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            await this.lsifGenerator.initialize(workspaceFolders[0]);
        }
        
        // Try to load existing LSIF or generate new one
        await this.ensureLSIF();
        
        console.log(`Hybrid KB initialized. LSIF loaded: ${this.lsifLoaded}, Coverage: ${this.lsifCoverage.size} files`);
    }

    /**
     * Ensure LSIF data is available - load existing or generate new
     */
    private async ensureLSIF(): Promise<void> {
        // Try to load existing LSIF
        const loaded = await this.tryLoadLSIF();
        
        if (!loaded) {
            console.log('No existing LSIF found. Checking if auto-generation is enabled...');
            
            // Try to generate LSIF automatically
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const result = await this.lsifGenerator.generateForWorkspace(workspaceFolders[0]);
                
                if (result.success && result.outputPath) {
                    console.log(`LSIF generated successfully: ${result.outputPath}`);
                    // Try to load the newly generated LSIF
                    try {
                        await this.lsifManager.loadFromFile(result.outputPath);
                        this.lsifLoaded = true;
                        
                        // Build coverage map
                        const docs = this.lsifManager.getDocuments();
                        for (const doc of docs) {
                            this.lsifCoverage.add(this.normalizeUri(doc.uri));
                        }
                        
                        console.log(`Auto-generated LSIF loaded. Coverage: ${this.lsifCoverage.size} files`);
                        
                        // Import relationships
                        await this.importLSIFRelationships();
                    } catch (error) {
                        console.error('Failed to load auto-generated LSIF:', error);
                    }
                } else {
                    console.log('LSIF auto-generation not available. Using tree-sitter only.');
                }
            }
        }
    }

    /**
     * Try to load LSIF data from workspace
     */
    private async tryLoadLSIF(): Promise<boolean> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return false;
        }

        // Look for LSIF files in common locations
        const searchPaths = [
            'lsif-output',
            '.lsif',
            'build/lsif',
            'target/lsif'
        ];

        for (const folder of workspaceFolders) {
            for (const searchPath of searchPaths) {
                const lsifPath = path.join(folder.uri.fsPath, searchPath);
                
                if (fs.existsSync(lsifPath)) {
                    // Look for .lsif or .ndjson files
                    const files = fs.readdirSync(lsifPath);
                    const lsifFile = files.find(f => 
                        f.endsWith('.lsif') || 
                        f.endsWith('.ndjson') || 
                        f.endsWith('.json')
                    );
                    
                    if (lsifFile) {
                        const fullPath = path.join(lsifPath, lsifFile);
                        console.log(`Found LSIF file: ${fullPath}`);
                        
                        try {
                            await this.lsifManager.loadFromFile(fullPath);
                            this.lsifLoaded = true;
                            
                            // Build coverage map
                            const docs = this.lsifManager.getDocuments();
                            for (const doc of docs) {
                                this.lsifCoverage.add(this.normalizeUri(doc.uri));
                            }
                            
                            console.log(`LSIF loaded successfully. Coverage: ${this.lsifCoverage.size} files`);
                            
                            // Import LSIF relationships into the database
                            await this.importLSIFRelationships();
                            
                            return true;
                        } catch (error) {
                            console.error(`Failed to load LSIF: ${error}`);
                        }
                    }
                }
            }
        }
        
        console.log('No existing LSIF data found.');
        return false;
    }

    /**
     * Import LSIF relationships into the database
     */
    private async importLSIFRelationships(): Promise<void> {
        const relationships = this.lsifManager.exportRelationships();
        console.log(`Importing ${relationships.length} LSIF relationships...`);
        
        for (const rel of relationships) {
            await this.relationshipIndexer.indexRelationship({
                sourceEntityId: rel.sourceEntity,
                targetEntityId: rel.targetEntity,
                relationshipType: rel.relationType as any,
                context: JSON.stringify(rel.metadata || {}),
                filePath: rel.sourceFile,
                lineNumber: rel.sourceLine
            });
        }
        
        console.log('LSIF relationships imported.');
    }

    /**
     * Index a file using the hybrid approach
     * Strategy: Use LSIF if available, otherwise fall back to tree-sitter
     */
    async indexFile(filePath: string): Promise<void> {
        const normalizedPath = this.normalizeUri(filePath);
        const language = this.getLanguage(filePath);
        
        if (!language) {
            console.log(`Skipping unsupported file: ${filePath}`);
            return;
        }

        // Check if file is covered by LSIF
        if (this.lsifLoaded && this.lsifCoverage.has(normalizedPath)) {
            console.log(`File ${filePath} is covered by LSIF. Skipping tree-sitter parsing.`);
            return;
        }

        // Use tree-sitter for files not covered by LSIF
        console.log(`Parsing ${filePath} with tree-sitter...`);
        await this.indexFileWithTreeSitter(filePath, language);
    }

    /**
     * Index a file using tree-sitter
     */
    private async indexFileWithTreeSitter(filePath: string, language: 'java' | 'typescript'): Promise<void> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            
            let relationships: Relationship[];
            if (language === 'java') {
                relationships = await this.treeSitterManager.extractJavaRelationships(filePath, content);
            } else {
                relationships = await this.treeSitterManager.extractTypeScriptRelationships(filePath, content);
            }

            // Cache the relationships
            this.treeSitterCache.set(filePath, {
                timestamp: Date.now(),
                relationships
            });

            // Index relationships
            for (const rel of relationships) {
                await this.relationshipIndexer.indexRelationship({
                    sourceEntityId: rel.sourceEntity,
                    targetEntityId: rel.targetEntity,
                    relationshipType: rel.relationType as any,
                    context: JSON.stringify(rel.metadata || {}),
                    filePath: rel.sourceFile,
                    lineNumber: rel.sourceLine
                });
            }

            console.log(`Indexed ${relationships.length} relationships from ${filePath}`);
        } catch (error) {
            console.error(`Failed to index ${filePath} with tree-sitter:`, error);
        }
    }

    /**
     * Update a file incrementally
     */
    async updateFile(filePath: string): Promise<void> {
        const normalizedPath = this.normalizeUri(filePath);
        const language = this.getLanguage(filePath);
        
        if (!language) {
            return;
        }

        // If covered by LSIF, we need to re-parse with tree-sitter
        // because LSIF is static and doesn't reflect changes
        if (this.lsifLoaded && this.lsifCoverage.has(normalizedPath)) {
            console.log(`File ${filePath} changed. Using tree-sitter for updated relationships.`);
            this.lsifCoverage.delete(normalizedPath); // Remove from LSIF coverage
        }

        // Re-index with tree-sitter
        await this.indexFileWithTreeSitter(filePath, language);
    }

    /**
     * Find relationships for an entity
     */
    async findRelationships(entityName: string, options?: QueryOptions): Promise<Relationship[]> {
        // Try LSIF first for instant results
        if (this.lsifLoaded) {
            const lsifRefs = this.lsifManager.findReferences(entityName);
            const lsifDefs = this.lsifManager.findDefinitions(entityName);
            
            if (lsifRefs.length > 0 || lsifDefs.length > 0) {
                console.log(`Found ${lsifRefs.length} references and ${lsifDefs.length} definitions in LSIF`);
                
                // Convert to relationship format
                const relationships: Relationship[] = [];
                
                for (const ref of lsifRefs) {
                    relationships.push({
                        sourceEntity: entityName,
                        targetEntity: entityName,
                        relationType: 'REFERENCES',
                        sourceFile: ref.uri,
                        sourceLine: ref.range.start.line + 1,
                        metadata: { source: 'LSIF' }
                    });
                }
                
                return relationships;
            }
        }

        // Fall back to database query
        // Note: RelationshipSearch doesn't have findRelationships, so we use findCallers/findCallees
        const relatedEntities = this.relationshipSearch.findCallers(entityName);
        return this.convertRelatedEntitiesToRelationships(relatedEntities);
    }

    /**
     * Convert RelatedEntity[] to Relationship[]
     */
    private convertRelatedEntitiesToRelationships(entities: RelatedEntity[]): Relationship[] {
        return entities.map(entity => ({
            sourceEntity: entity.id,
            targetEntity: entity.identifier,
            relationType: entity.relationshipType,
            sourceFile: entity.filePath,
            sourceLine: entity.lineNumber,
            metadata: { 
                type: entity.type,
                distance: entity.distance
            }
        }));
    }

    /**
     * Find all methods that call a specific method
     */
    async findCallers(methodName: string): Promise<Relationship[]> {
        // Check LSIF call graph first
        if (this.lsifLoaded) {
            const callGraph = this.lsifManager.buildCallGraph();
            const callers: Relationship[] = [];
            
            for (const [caller, callees] of callGraph.entries()) {
                if (callees.includes(methodName)) {
                    callers.push({
                        sourceEntity: caller,
                        targetEntity: methodName,
                        relationType: 'CALLS',
                        sourceFile: '',
                        sourceLine: 0,
                        metadata: { source: 'LSIF-CallGraph' }
                    });
                }
            }
            
            if (callers.length > 0) {
                return callers;
            }
        }

        // Fall back to database
        const relatedEntities = this.relationshipSearch.findCallers(methodName);
        return this.convertRelatedEntitiesToRelationships(relatedEntities);
    }

    /**
     * Find all methods called by a specific method
     */
    async findCallees(methodName: string): Promise<Relationship[]> {
        // Check LSIF call graph first
        if (this.lsifLoaded) {
            const callGraph = this.lsifManager.buildCallGraph();
            const callees = callGraph.get(methodName);
            
            if (callees) {
                return callees.map(callee => ({
                    sourceEntity: methodName,
                    targetEntity: callee,
                    relationType: 'CALLS',
                    sourceFile: '',
                    sourceLine: 0,
                    metadata: { source: 'LSIF-CallGraph' }
                }));
            }
        }

        // Fall back to database
        const relatedEntities = this.relationshipSearch.findCallees(methodName);
        return this.convertRelatedEntitiesToRelationships(relatedEntities);
    }

    /**
     * Trace data flow for a specific entity
     */
    async traceDataFlow(entityName: string, maxDepth: number = 3): Promise<Relationship[]> {
        // Data flow is better computed from database which has all relationships
        const dataFlows = this.relationshipSearch.traceDataFlow(entityName);
        
        // Convert DataFlowPath[] to Relationship[]
        const relationships: Relationship[] = [];
        for (const flow of dataFlows) {
            for (const step of flow.flow) {
                relationships.push({
                    sourceEntity: flow.variable,
                    targetEntity: flow.type,
                    relationType: 'USES',
                    sourceFile: step.location,
                    sourceLine: step.lineNumber,
                    metadata: { 
                        context: step.context,
                        flowType: 'data-flow'
                    }
                });
            }
        }
        
        return relationships;
    }

    /**
     * Find type hierarchy for a class or interface
     */
    async findTypeHierarchy(typeName: string): Promise<{
        superclasses: string[];
        subclasses: string[];
        interfaces: string[];
    }> {
        // Try LSIF first
        if (this.lsifLoaded) {
            const defs = this.lsifManager.findDefinitions(typeName);
            // LSIF might have hover info with type information
            for (const def of defs) {
                const hover = this.lsifManager.getHoverInfo(typeName, def.uri);
                if (hover) {
                    // Parse hover contents for extends/implements information
                    // This is a simplified version - real implementation would be more sophisticated
                }
            }
        }

        // Use database for complete hierarchy
        // Note: This is a simplified implementation - would need actual SQL queries
        return {
            superclasses: [],
            subclasses: [],
            interfaces: []
        };
    }

    /**
     * Get statistics about the knowledge base
     */
    getStats() {
        const lsifStats = this.lsifLoaded ? this.lsifManager.getStats() : null;
        const treeSitterCacheSize = this.treeSitterManager.getCacheSize();
        const generatorStatus = this.lsifGenerator.getStatus();
        
        return {
            lsifLoaded: this.lsifLoaded,
            lsifCoverage: this.lsifCoverage.size,
            lsifStats,
            treeSitterCacheSize,
            strategy: this.lsifLoaded ? 'hybrid' : 'tree-sitter-only',
            generator: {
                isGenerating: generatorStatus.isGenerating,
                autoGenerate: generatorStatus.config.autoGenerate,
                lastGeneration: Array.from(generatorStatus.lastGenerationTimes.entries())
            }
        };
    }

    /**
     * Manually trigger LSIF regeneration
     */
    async regenerateLSIF(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        await this.lsifGenerator.regenerate(workspaceFolders[0]);
        
        // Reload the newly generated LSIF
        await this.ensureLSIF();
    }

    /**
     * Update LSIF generator configuration
     */
    updateGeneratorConfig(config: {
        autoGenerate?: boolean;
        generateOnStartup?: boolean;
        generateOnBuild?: boolean;
    }): void {
        this.lsifGenerator.updateConfig(config);
    }

    /**
     * Helper: Normalize URI for comparison
     */
    private normalizeUri(uri: string): string {
        // Remove file:// protocol if present
        return uri.replace('file://', '').toLowerCase();
    }

    /**
     * Helper: Determine language from file path
     */
    private getLanguage(filePath: string): 'java' | 'typescript' | null {
        const ext = path.extname(filePath).toLowerCase();
        
        if (ext === '.java') {
            return 'java';
        }
        if (ext === '.ts' || ext === '.tsx') {
            return 'typescript';
        }
        
        return null;
    }

    /**
     * Clear all caches
     */
    clearCaches(): void {
        this.treeSitterManager.clearCache();
        this.treeSitterCache.clear();
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.clearCaches();
        this.lsifManager.clear();
        this.lsifGenerator.dispose();
    }
}
