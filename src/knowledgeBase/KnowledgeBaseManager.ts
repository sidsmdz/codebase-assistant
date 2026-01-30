import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import initSqlJs, { Database } from 'sql.js';
import { HybridSearchEngine } from '../search/HybridSearchEngine';
import { ASTIndexer } from '../indexing/ASTIndexer';
import { TermIndexer, IndexableDocument } from '../indexing/TermIndexer';
import { ASTNode } from '../parsers/ASTParser';
import { Feature, FeatureComponent, FeatureFlow, ComponentType } from '../analysis/FeatureAnalyzer';

export interface SavedPattern {
    id: string;
    name: string;
    language: string;
    code: string;
    description: string;
    query: string;
    savedAt: string;
    tags: string[];
    metadata?: {
        filePath?: string;
        framework?: string;
        category?: string;
    };
}

export class KnowledgeBaseManager {
    private dbPath: string;
    private db!: Database;
    private SQL!: any;
    private isReady: boolean = false;

    // New search components
    private hybridSearch!: HybridSearchEngine;
    private astIndexer!: ASTIndexer;
    private termIndexer!: TermIndexer;

    constructor(private context: vscode.ExtensionContext) {
        this.dbPath = path.join(context.globalStorageUri.fsPath, 'opencat.db');
    }

    async initialize(): Promise<void> {
        try {
            await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);

            const wasmPath = path.join(this.context.extensionPath, 'dist', 'sql-wasm.wasm');
            const wasmBuffer = await fs.readFile(wasmPath);
            const wasmBinary = new Uint8Array(wasmBuffer).buffer;

            // Initialize sql.js with local WASM
            this.SQL = await initSqlJs({
                wasmBinary: wasmBinary
            });

            // Try to load existing database
            let buffer: Buffer | undefined;
            try {
                buffer = await fs.readFile(this.dbPath);
            } catch (e) {
                // Database doesn't exist yet, will create new one
            }

            this.db = new this.SQL.Database(buffer);

            // Create tables with new schema
            await this.createTables();

            // Initialize search components
            this.hybridSearch = new HybridSearchEngine(this.db);
            this.astIndexer = new ASTIndexer(this.db);
            this.termIndexer = new TermIndexer(this.db);

            this.isReady = true;
            console.log('Knowledge base initialized with AST + BM25 search at:', this.dbPath);

        } catch (error) {
            this.isReady = false;
            console.error('Failed to initialize KB:', error);
            vscode.window.showErrorMessage(`OpenCat failed to initialize its knowledge base. Some features may not work. Error: ${error}`);
        }
    }

    private async createTables(): Promise<void> {
        // Patterns table (unchanged)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS patterns (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                language TEXT NOT NULL,
                code TEXT NOT NULL,
                description TEXT,
                query TEXT,
                savedAt TEXT NOT NULL,
                tags_json TEXT,
                metadata_json TEXT
            );
        `);

        // AST nodes table (NEW)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS ast_nodes (
                id TEXT PRIMARY KEY,
                pattern_id TEXT NOT NULL,
                node_type TEXT NOT NULL,
                identifier TEXT NOT NULL,
                signature TEXT,
                parameters_json TEXT,
                return_type TEXT,
                modifiers_json TEXT,
                parent_id TEXT,
                file_path TEXT NOT NULL,
                start_line INTEGER NOT NULL,
                end_line INTEGER NOT NULL,
                language TEXT NOT NULL,
                code TEXT,
                FOREIGN KEY(pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
            );
        `);

        // Term index for BM25 (NEW)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS term_index (
                term TEXT NOT NULL,
                pattern_id TEXT NOT NULL,
                field TEXT NOT NULL,
                frequency INTEGER NOT NULL,
                PRIMARY KEY(term, pattern_id, field),
                FOREIGN KEY(pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
            );
        `);

        // Document statistics for BM25 (NEW)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS doc_stats (
                pattern_id TEXT PRIMARY KEY,
                name_length INTEGER DEFAULT 0,
                code_length INTEGER DEFAULT 0,
                comment_length INTEGER DEFAULT 0,
                description_length INTEGER DEFAULT 0,
                total_terms INTEGER DEFAULT 0,
                FOREIGN KEY(pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
            );
        `);

        // Collection statistics for BM25 (NEW)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS collection_stats (
                field TEXT PRIMARY KEY,
                total_docs INTEGER DEFAULT 0,
                avg_length REAL DEFAULT 0,
                total_terms INTEGER DEFAULT 0
            );
        `);

        // File tracking for incremental indexing (NEW)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS indexed_files (
                file_path TEXT PRIMARY KEY,
                last_modified INTEGER NOT NULL,
                file_hash TEXT NOT NULL,
                indexed_at TEXT NOT NULL,
                pattern_count INTEGER DEFAULT 0
            );
        `);

        // Feature components table (NEW - for feature analysis)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS feature_components (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                component_type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                language TEXT NOT NULL,
                code TEXT,
                start_line INTEGER NOT NULL,
                end_line INTEGER NOT NULL,
                dependencies_json TEXT,
                dependents_json TEXT,
                annotations_json TEXT,
                imports_json TEXT,
                exports_json TEXT
            );
        `);

        // Features table (NEW - for feature analysis)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS features (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                entry_points_json TEXT,
                components_json TEXT,
                languages_json TEXT,
                frameworks_json TEXT,
                tags_json TEXT,
                flow_json TEXT
            );
        `);

        // Feature-component relationship table (NEW)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS feature_component_map (
                feature_id TEXT NOT NULL,
                component_id TEXT NOT NULL,
                is_entry_point INTEGER DEFAULT 0,
                PRIMARY KEY(feature_id, component_id),
                FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE,
                FOREIGN KEY(component_id) REFERENCES feature_components(id) ON DELETE CASCADE
            );
        `);

        // Create indexes for faster searching
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_patterns_name ON patterns(name);`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_patterns_language ON patterns(language);`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_ast_identifier ON ast_nodes(identifier);`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_ast_type ON ast_nodes(node_type);`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_ast_language ON ast_nodes(language);`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_term ON term_index(term);`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_component_type ON feature_components(component_type);`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_component_language ON feature_components(language);`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_feature_name ON features(name);`);
    }

    private async saveDatabase(): Promise<void> {
        try {
            const data = this.db.export();
            await fs.writeFile(this.dbPath, data);
        } catch (error) {
            console.error('Failed to save database:', error);
        }
    }

    getKBPath(): string {
        return this.dbPath;
    }

    async getStats(): Promise<{
        patternCount: number;
        astNodeCount: number;
        termCount: number;
        indexedFilesCount: number;
        path: string;
    }> {
        if (!this.isReady) {
            vscode.window.showErrorMessage('OpenCat Knowledge Base is not available.');
            return { patternCount: 0, astNodeCount: 0, termCount: 0, indexedFilesCount: 0, path: 'N/A' };
        }

        const result = this.db.exec(`
            SELECT
                (SELECT COUNT(*) FROM patterns) as pattern_count,
                (SELECT COUNT(*) FROM ast_nodes) as ast_count,
                (SELECT COUNT(DISTINCT term) FROM term_index) as term_count,
                (SELECT COUNT(*) FROM indexed_files) as indexed_files_count
        `);

        const row = result[0]?.values[0];
        return {
            patternCount: (row?.[0] as number) || 0,
            astNodeCount: (row?.[1] as number) || 0,
            termCount: (row?.[2] as number) || 0,
            indexedFilesCount: (row?.[3] as number) || 0,
            path: this.dbPath
        };
    }

    /**
     * Save a pattern to the knowledge base
     * @param pattern Pattern data (without id and savedAt)
     * @param astNodes Optional AST nodes extracted from the code
     */
    async savePattern(
        pattern: Omit<SavedPattern, 'id' | 'savedAt'>,
        astNodes?: ASTNode[]
    ): Promise<SavedPattern> {
        if (!this.isReady) {
            vscode.window.showErrorMessage('OpenCat Knowledge Base is not available.');
            throw new Error('Knowledge Base not initialized.');
        }

        const savedPattern: SavedPattern = {
            ...pattern,
            id: this.generatePatternId(),
            savedAt: new Date().toISOString()
        };

        const tags_json = JSON.stringify(savedPattern.tags);
        const metadata_json = JSON.stringify(savedPattern.metadata || {});

        try {
            // Save pattern to database
            this.db.run(`
                INSERT INTO patterns (id, name, language, code, description, query, savedAt, tags_json, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                savedPattern.id,
                savedPattern.name,
                savedPattern.language,
                savedPattern.code,
                savedPattern.description,
                savedPattern.query,
                savedPattern.savedAt,
                tags_json,
                metadata_json
            ]);

            // Index AST nodes if provided
            if (astNodes && astNodes.length > 0) {
                await this.astIndexer.indexNodes(astNodes, savedPattern.id);
            }

            // Index terms for BM25 search
            const indexableDoc: IndexableDocument = {
                patternId: savedPattern.id,
                fields: {
                    name: savedPattern.name,
                    code: savedPattern.code,
                    description: savedPattern.description,
                    comment: '' // Could extract from code if needed
                }
            };
            await this.termIndexer.indexDocument(indexableDoc);

            // Update collection statistics
            await this.termIndexer.updateCollectionStats();

            await this.saveDatabase();

            console.log(`Saved pattern: ${savedPattern.name} with ${astNodes?.length || 0} AST nodes`);
            return savedPattern;
        } catch (error) {
            console.error('Failed to save pattern:', error);
            throw error;
        }
    }

    /**
     * Search patterns using hybrid AST + BM25 search
     * @param query Natural language query
     * @param limit Maximum number of results (default: 5)
     */
    async searchPatterns(query: string, limit: number = 5): Promise<SavedPattern[]> {
        if (!this.isReady) {
            return [];
        }

        try {
            // Use hybrid search
            const searchResults = await this.hybridSearch.search(query, { limit });

            // Convert search results to SavedPattern objects
            const patterns: SavedPattern[] = [];

            for (const result of searchResults) {
                const pattern = await this.getPatternById(result.patternId);
                if (pattern) {
                    patterns.push(pattern);
                }
            }

            return patterns;
        } catch (error) {
            console.error('Search failed:', error);
            return [];
        }
    }

    /**
     * Get a pattern by ID
     */
    private async getPatternById(patternId: string): Promise<SavedPattern | null> {
        try {
            const results = this.db.exec("SELECT * FROM patterns WHERE id = ?", [patternId]);

            if (!results[0] || results[0].values.length === 0) {
                return null;
            }

            const columns = results[0].columns;
            const row = results[0].values[0];

            const obj: any = {};
            columns.forEach((col, idx) => {
                obj[col] = row[idx];
            });

            return {
                ...obj,
                tags: JSON.parse(obj.tags_json || '[]'),
                metadata: JSON.parse(obj.metadata_json || '{}')
            };
        } catch (error) {
            console.error('Error getting pattern by ID:', error);
            return null;
        }
    }

    async getAllPatterns(): Promise<SavedPattern[]> {
        if (!this.isReady) {
            vscode.window.showErrorMessage('OpenCat Knowledge Base is not available.');
            return [];
        }

        const results = this.db.exec("SELECT * FROM patterns ORDER BY name");

        if (!results[0]) {
            return [];
        }

        const columns = results[0].columns;
        const rows = results[0].values;

        return rows.map((row: any[]) => {
            const obj: any = {};
            columns.forEach((col, idx) => {
                obj[col] = row[idx];
            });
            return {
                ...obj,
                tags: JSON.parse(obj.tags_json || '[]'),
                metadata: JSON.parse(obj.metadata_json || '{}')
            };
        });
    }

    async deletePattern(patternId: string): Promise<void> {
        if (!this.isReady) {
            vscode.window.showErrorMessage('OpenCat Knowledge Base is not available.');
            return;
        }

        try {
            // Delete from patterns table (cascades to ast_nodes, term_index, doc_stats)
            this.db.run("DELETE FROM patterns WHERE id = ?", [patternId]);

            // Update collection statistics after deletion
            await this.termIndexer.updateCollectionStats();

            await this.saveDatabase();
        } catch (error) {
            console.error('Error deleting pattern:', error);
            throw error;
        }
    }

    async clearAllData(): Promise<void> {
        if (!this.isReady) {
            vscode.window.showErrorMessage('OpenCat Knowledge Base is not available.');
            return;
        }

        try {
            // Log counts before clearing for debugging
            const beforeStats = await this.getStats();
            console.log(`Clearing KB - Before: ${beforeStats.patternCount} patterns, ${beforeStats.indexedFilesCount} indexed files`);

            // Clear indexes using the indexer methods for proper cleanup
            await this.termIndexer.clearIndex();
            await this.astIndexer.clearIndex();

            // Delete all data from all tables (explicit delete for tables not covered by indexers)
            this.db.run("DELETE FROM patterns");
            this.db.run("DELETE FROM indexed_files");
            this.db.run("DELETE FROM feature_component_map");
            this.db.run("DELETE FROM features");
            this.db.run("DELETE FROM feature_components");

            // Reinitialize collection statistics (will be empty after clear)
            await this.termIndexer.updateCollectionStats();

            // Save the cleared database to disk
            await this.saveDatabase();

            // Verify the clear worked
            const afterStats = await this.getStats();
            console.log(`KB cleared - After: ${afterStats.patternCount} patterns, ${afterStats.indexedFilesCount} indexed files`);

            if (afterStats.patternCount > 0 || afterStats.indexedFilesCount > 0) {
                console.error('WARNING: KB clear may not have worked completely!');
            }

            console.log('Knowledge base cleared successfully - all indexes and file tracking reset');
        } catch (error) {
            console.error('Error clearing knowledge base:', error);
            throw error;
        }
    }

    /**
     * Get the hybrid search engine (for advanced queries)
     */
    getSearchEngine(): HybridSearchEngine {
        return this.hybridSearch;
    }

    /**
     * Get the AST indexer
     */
    getASTIndexer(): ASTIndexer {
        return this.astIndexer;
    }

    /**
     * Get the term indexer
     */
    getTermIndexer(): TermIndexer {
        return this.termIndexer;
    }

    /**
     * Check if a file needs to be indexed (new or modified)
     */
    async shouldIndexFile(filePath: string, lastModified: number, fileHash: string): Promise<boolean> {
        if (!this.isReady) {
            return false;
        }

        try {
            const result = this.db.exec(
                "SELECT last_modified, file_hash FROM indexed_files WHERE file_path = ?",
                [filePath]
            );

            if (!result[0] || result[0].values.length === 0) {
                // File not indexed yet
                return true;
            }

            const row = result[0].values[0];
            const storedModified = row[0] as number;
            const storedHash = row[1] as string;

            // Check if file was modified or content changed
            return lastModified > storedModified || fileHash !== storedHash;
        } catch (error) {
            console.error('Error checking if file should be indexed:', error);
            return true; // Index on error to be safe
        }
    }

    /**
     * Mark a file as indexed
     */
    async markFileAsIndexed(filePath: string, lastModified: number, fileHash: string, patternCount: number): Promise<void> {
        if (!this.isReady) {
            return;
        }

        try {
            // Delete old entry if exists
            this.db.run("DELETE FROM indexed_files WHERE file_path = ?", [filePath]);

            // Insert new entry
            this.db.run(`
                INSERT INTO indexed_files (file_path, last_modified, file_hash, indexed_at, pattern_count)
                VALUES (?, ?, ?, ?, ?)
            `, [filePath, lastModified, fileHash, new Date().toISOString(), patternCount]);

            await this.saveDatabase();
        } catch (error) {
            console.error('Error marking file as indexed:', error);
        }
    }

    /**
     * Get detailed statistics about the knowledge base
     */
    async getDetailedStats(): Promise<{
        totalPatterns: number;
        totalASTNodes: number;
        totalTerms: number;
        indexedFiles: number;
        patternsByLanguage: { [key: string]: number };
        patternsByType: { [key: string]: number };
        patternsByFramework: { [key: string]: number };
        topTags: Array<{ tag: string; count: number }>;
    }> {
        if (!this.isReady) {
            return {
                totalPatterns: 0,
                totalASTNodes: 0,
                totalTerms: 0,
                indexedFiles: 0,
                patternsByLanguage: {},
                patternsByType: {},
                patternsByFramework: {},
                topTags: []
            };
        }

        try {
            // Basic counts
            const basicResult = this.db.exec(`
                SELECT
                    (SELECT COUNT(*) FROM patterns) as pattern_count,
                    (SELECT COUNT(*) FROM ast_nodes) as ast_count,
                    (SELECT COUNT(DISTINCT term) FROM term_index) as term_count,
                    (SELECT COUNT(*) FROM indexed_files) as file_count
            `);
            const basicRow = basicResult[0]?.values[0];

            // Patterns by language
            const langResult = this.db.exec("SELECT language, COUNT(*) as count FROM patterns GROUP BY language");
            const patternsByLanguage: { [key: string]: number } = {};
            if (langResult[0]) {
                langResult[0].values.forEach(row => {
                    patternsByLanguage[row[0] as string] = row[1] as number;
                });
            }

            // Patterns by node type
            const typeResult = this.db.exec("SELECT node_type, COUNT(*) as count FROM ast_nodes GROUP BY node_type");
            const patternsByType: { [key: string]: number } = {};
            if (typeResult[0]) {
                typeResult[0].values.forEach(row => {
                    patternsByType[row[0] as string] = row[1] as number;
                });
            }

            // Patterns by framework (from metadata)
            const patterns = await this.getAllPatterns();
            const patternsByFramework: { [key: string]: number } = {};
            const tagCounts: { [key: string]: number } = {};

            patterns.forEach(p => {
                if (p.metadata?.framework) {
                    patternsByFramework[p.metadata.framework] = (patternsByFramework[p.metadata.framework] || 0) + 1;
                }
                p.tags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            });

            // Top 10 tags
            const topTags = Object.entries(tagCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([tag, count]) => ({ tag, count }));

            return {
                totalPatterns: (basicRow?.[0] as number) || 0,
                totalASTNodes: (basicRow?.[1] as number) || 0,
                totalTerms: (basicRow?.[2] as number) || 0,
                indexedFiles: (basicRow?.[3] as number) || 0,
                patternsByLanguage,
                patternsByType,
                patternsByFramework,
                topTags
            };
        } catch (error) {
            console.error('Error getting detailed stats:', error);
            return {
                totalPatterns: 0,
                totalASTNodes: 0,
                totalTerms: 0,
                indexedFiles: 0,
                patternsByLanguage: {},
                patternsByType: {},
                patternsByFramework: {},
                topTags: []
            };
        }
    }

    private generatePatternId(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // ============== Feature Analysis Methods ==============

    /**
     * Save a feature component to the knowledge base
     */
    async saveFeatureComponent(component: FeatureComponent): Promise<void> {
        if (!this.isReady) {
            return;
        }

        try {
            this.db.run(`
                INSERT OR REPLACE INTO feature_components
                (id, name, component_type, file_path, language, code, start_line, end_line,
                 dependencies_json, dependents_json, annotations_json, imports_json, exports_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                component.id,
                component.name,
                component.type,
                component.filePath,
                component.language,
                component.code,
                component.startLine,
                component.endLine,
                JSON.stringify(component.dependencies),
                JSON.stringify(component.dependents),
                JSON.stringify(component.annotations),
                JSON.stringify(component.imports),
                JSON.stringify(component.exports)
            ]);

            // Index for BM25 search
            const indexableDoc: IndexableDocument = {
                patternId: component.id,
                fields: {
                    name: component.name,
                    code: component.code,
                    description: `${component.type}: ${component.name} (${component.language})`,
                    comment: component.annotations.join(' ')
                }
            };
            await this.termIndexer.indexDocument(indexableDoc);

        } catch (error) {
            console.error('Failed to save feature component:', error);
        }
    }

    /**
     * Save multiple feature components in batch
     */
    async saveFeatureComponents(components: FeatureComponent[]): Promise<void> {
        for (const component of components) {
            await this.saveFeatureComponent(component);
        }
        await this.termIndexer.updateCollectionStats();
        await this.saveDatabase();
    }

    /**
     * Save a feature to the knowledge base
     */
    async saveFeature(feature: Feature): Promise<void> {
        if (!this.isReady) {
            return;
        }

        try {
            this.db.run(`
                INSERT OR REPLACE INTO features
                (id, name, description, entry_points_json, components_json,
                 languages_json, frameworks_json, tags_json, flow_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                feature.id,
                feature.name,
                feature.description,
                JSON.stringify(feature.entryPoints),
                JSON.stringify(feature.components),
                JSON.stringify(feature.languages),
                JSON.stringify(feature.frameworks),
                JSON.stringify(feature.tags),
                JSON.stringify(feature.flow)
            ]);

            // Create feature-component mappings
            for (const componentId of feature.components) {
                const isEntryPoint = feature.entryPoints.includes(componentId) ? 1 : 0;
                this.db.run(`
                    INSERT OR REPLACE INTO feature_component_map (feature_id, component_id, is_entry_point)
                    VALUES (?, ?, ?)
                `, [feature.id, componentId, isEntryPoint]);
            }

            console.log(`saveFeature: Saved feature "${feature.name}" (${feature.id})`);
        } catch (error) {
            console.error('Failed to save feature:', error);
            // Try to get more info about the error
            try {
                const tableCheck = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='features'");
                console.log('Features table exists:', tableCheck[0]?.values?.length > 0);
            } catch (e) {
                console.error('Could not check table existence:', e);
            }
        }
    }

    /**
     * Save multiple features in batch
     */
    async saveFeatures(features: Feature[]): Promise<void> {
        console.log(`saveFeatures: Starting to save ${features.length} features`);

        for (const feature of features) {
            await this.saveFeature(feature);
        }

        await this.saveDatabase();

        // Verify features were saved
        const verifyResult = this.db.exec("SELECT COUNT(*) as count FROM features");
        const count = verifyResult[0]?.values[0]?.[0] || 0;
        console.log(`saveFeatures: Verified ${count} features in database after save`);

        console.log(`Saved ${features.length} features to knowledge base`);
    }

    /**
     * Get all features
     */
    async getAllFeatures(): Promise<Feature[]> {
        if (!this.isReady) {
            console.log('getAllFeatures: KB not ready');
            return [];
        }

        try {
            const results = this.db.exec("SELECT * FROM features ORDER BY name");
            console.log(`getAllFeatures: Query returned ${results.length} result sets`);

            if (!results[0]) {
                console.log('getAllFeatures: No results found');
                return [];
            }

            const columns = results[0].columns;
            const rows = results[0].values;
            console.log(`getAllFeatures: Found ${rows.length} features`);

            return rows.map((row: any[]) => {
                const obj: any = {};
                columns.forEach((col, idx) => {
                    obj[col] = row[idx];
                });
                return {
                    id: obj.id,
                    name: obj.name,
                    description: obj.description,
                    entryPoints: JSON.parse(obj.entry_points_json || '[]'),
                    components: JSON.parse(obj.components_json || '[]'),
                    languages: JSON.parse(obj.languages_json || '[]'),
                    frameworks: JSON.parse(obj.frameworks_json || '[]'),
                    tags: JSON.parse(obj.tags_json || '[]'),
                    flow: JSON.parse(obj.flow_json || '[]')
                } as Feature;
            });
        } catch (error) {
            console.error('getAllFeatures error:', error);
            return [];
        }
    }

    /**
     * Get a feature by ID
     */
    async getFeatureById(featureId: string): Promise<Feature | null> {
        if (!this.isReady) {
            return null;
        }

        try {
            const results = this.db.exec("SELECT * FROM features WHERE id = ?", [featureId]);
            if (!results[0] || results[0].values.length === 0) {
                return null;
            }

            const columns = results[0].columns;
            const row = results[0].values[0];
            const obj: any = {};
            columns.forEach((col, idx) => {
                obj[col] = row[idx];
            });

            return {
                id: obj.id,
                name: obj.name,
                description: obj.description,
                entryPoints: JSON.parse(obj.entry_points_json || '[]'),
                components: JSON.parse(obj.components_json || '[]'),
                languages: JSON.parse(obj.languages_json || '[]'),
                frameworks: JSON.parse(obj.frameworks_json || '[]'),
                tags: JSON.parse(obj.tags_json || '[]'),
                flow: JSON.parse(obj.flow_json || '[]')
            } as Feature;
        } catch (error) {
            console.error('Error getting feature by ID:', error);
            return null;
        }
    }

    /**
     * Get all feature components
     */
    async getAllFeatureComponents(): Promise<FeatureComponent[]> {
        if (!this.isReady) {
            return [];
        }

        const results = this.db.exec("SELECT * FROM feature_components ORDER BY name");
        if (!results[0]) {
            return [];
        }

        const columns = results[0].columns;
        const rows = results[0].values;

        return rows.map((row: any[]) => {
            const obj: any = {};
            columns.forEach((col, idx) => {
                obj[col] = row[idx];
            });
            return {
                id: obj.id,
                name: obj.name,
                type: obj.component_type as ComponentType,
                filePath: obj.file_path,
                language: obj.language,
                code: obj.code,
                startLine: obj.start_line,
                endLine: obj.end_line,
                dependencies: JSON.parse(obj.dependencies_json || '[]'),
                dependents: JSON.parse(obj.dependents_json || '[]'),
                annotations: JSON.parse(obj.annotations_json || '[]'),
                imports: JSON.parse(obj.imports_json || '[]'),
                exports: JSON.parse(obj.exports_json || '[]')
            } as FeatureComponent;
        });
    }

    /**
     * Get a feature component by ID
     */
    async getFeatureComponentById(componentId: string): Promise<FeatureComponent | null> {
        if (!this.isReady) {
            return null;
        }

        try {
            const results = this.db.exec("SELECT * FROM feature_components WHERE id = ?", [componentId]);
            if (!results[0] || results[0].values.length === 0) {
                return null;
            }

            const columns = results[0].columns;
            const row = results[0].values[0];
            const obj: any = {};
            columns.forEach((col, idx) => {
                obj[col] = row[idx];
            });

            return {
                id: obj.id,
                name: obj.name,
                type: obj.component_type as ComponentType,
                filePath: obj.file_path,
                language: obj.language,
                code: obj.code,
                startLine: obj.start_line,
                endLine: obj.end_line,
                dependencies: JSON.parse(obj.dependencies_json || '[]'),
                dependents: JSON.parse(obj.dependents_json || '[]'),
                annotations: JSON.parse(obj.annotations_json || '[]'),
                imports: JSON.parse(obj.imports_json || '[]'),
                exports: JSON.parse(obj.exports_json || '[]')
            } as FeatureComponent;
        } catch (error) {
            console.error('Error getting component by ID:', error);
            return null;
        }
    }

    /**
     * Search features by query
     */
    async searchFeatures(query: string, limit: number = 5): Promise<Feature[]> {
        if (!this.isReady) {
            return [];
        }

        try {
            // Search using BM25 to find relevant components first
            const searchResults = await this.hybridSearch.search(query, { limit: limit * 2 });

            // Find features that contain these components
            const featureIds = new Set<string>();
            for (const result of searchResults) {
                const mappings = this.db.exec(
                    "SELECT feature_id FROM feature_component_map WHERE component_id = ?",
                    [result.patternId]
                );
                if (mappings[0]) {
                    for (const row of mappings[0].values) {
                        featureIds.add(row[0] as string);
                    }
                }
            }

            // Also search feature names/descriptions directly
            const nameSearch = this.db.exec(
                "SELECT id FROM features WHERE name LIKE ? OR description LIKE ? LIMIT ?",
                [`%${query}%`, `%${query}%`, limit]
            );
            if (nameSearch[0]) {
                for (const row of nameSearch[0].values) {
                    featureIds.add(row[0] as string);
                }
            }

            // Get full feature objects
            const features: Feature[] = [];
            for (const featureId of featureIds) {
                const feature = await this.getFeatureById(featureId);
                if (feature) {
                    features.push(feature);
                }
                if (features.length >= limit) {
                    break;
                }
            }

            return features;
        } catch (error) {
            console.error('Error searching features:', error);
            return [];
        }
    }

    /**
     * Get components for a specific feature
     */
    async getComponentsForFeature(featureId: string): Promise<FeatureComponent[]> {
        if (!this.isReady) {
            return [];
        }

        try {
            const results = this.db.exec(`
                SELECT fc.* FROM feature_components fc
                INNER JOIN feature_component_map fcm ON fc.id = fcm.component_id
                WHERE fcm.feature_id = ?
            `, [featureId]);

            if (!results[0]) {
                return [];
            }

            const columns = results[0].columns;
            const rows = results[0].values;

            return rows.map((row: any[]) => {
                const obj: any = {};
                columns.forEach((col, idx) => {
                    obj[col] = row[idx];
                });
                return {
                    id: obj.id,
                    name: obj.name,
                    type: obj.component_type as ComponentType,
                    filePath: obj.file_path,
                    language: obj.language,
                    code: obj.code,
                    startLine: obj.start_line,
                    endLine: obj.end_line,
                    dependencies: JSON.parse(obj.dependencies_json || '[]'),
                    dependents: JSON.parse(obj.dependents_json || '[]'),
                    annotations: JSON.parse(obj.annotations_json || '[]'),
                    imports: JSON.parse(obj.imports_json || '[]'),
                    exports: JSON.parse(obj.exports_json || '[]')
                } as FeatureComponent;
            });
        } catch (error) {
            console.error('Error getting components for feature:', error);
            return [];
        }
    }

    /**
     * Get feature statistics
     */
    async getFeatureStats(): Promise<{
        totalFeatures: number;
        totalComponents: number;
        componentsByType: Record<string, number>;
        componentsByLanguage: Record<string, number>;
        frameworkUsage: Record<string, number>;
    }> {
        if (!this.isReady) {
            return {
                totalFeatures: 0,
                totalComponents: 0,
                componentsByType: {},
                componentsByLanguage: {},
                frameworkUsage: {}
            };
        }

        try {
            // Basic counts
            const countResult = this.db.exec(`
                SELECT
                    (SELECT COUNT(*) FROM features) as feature_count,
                    (SELECT COUNT(*) FROM feature_components) as component_count
            `);
            const countRow = countResult[0]?.values[0];

            // Components by type
            const typeResult = this.db.exec("SELECT component_type, COUNT(*) FROM feature_components GROUP BY component_type");
            const componentsByType: Record<string, number> = {};
            if (typeResult[0]) {
                typeResult[0].values.forEach(row => {
                    componentsByType[row[0] as string] = row[1] as number;
                });
            }

            // Components by language
            const langResult = this.db.exec("SELECT language, COUNT(*) FROM feature_components GROUP BY language");
            const componentsByLanguage: Record<string, number> = {};
            if (langResult[0]) {
                langResult[0].values.forEach(row => {
                    componentsByLanguage[row[0] as string] = row[1] as number;
                });
            }

            // Framework usage from features
            const features = await this.getAllFeatures();
            const frameworkUsage: Record<string, number> = {};
            features.forEach(f => {
                f.frameworks.forEach(fw => {
                    frameworkUsage[fw] = (frameworkUsage[fw] || 0) + 1;
                });
            });

            return {
                totalFeatures: (countRow?.[0] as number) || 0,
                totalComponents: (countRow?.[1] as number) || 0,
                componentsByType,
                componentsByLanguage,
                frameworkUsage
            };
        } catch (error) {
            console.error('Error getting feature stats:', error);
            return {
                totalFeatures: 0,
                totalComponents: 0,
                componentsByType: {},
                componentsByLanguage: {},
                frameworkUsage: {}
            };
        }
    }

    /**
     * Clear all feature data
     */
    async clearFeatureData(): Promise<void> {
        if (!this.isReady) {
            return;
        }

        try {
            this.db.run("DELETE FROM feature_component_map");
            this.db.run("DELETE FROM features");
            this.db.run("DELETE FROM feature_components");
            await this.saveDatabase();
            console.log('Feature data cleared');
        } catch (error) {
            console.error('Error clearing feature data:', error);
        }
    }
}
