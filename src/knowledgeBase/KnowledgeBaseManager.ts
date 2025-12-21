import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import initSqlJs, { Database } from 'sql.js';
import { HybridSearchEngine } from '../search/HybridSearchEngine';
import { ASTIndexer } from '../indexing/ASTIndexer';
import { TermIndexer, IndexableDocument } from '../indexing/TermIndexer';
import { ASTNode } from '../parsers/ASTParser';

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

        // Create indexes for faster searching
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_patterns_name ON patterns(name);`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_patterns_language ON patterns(language);`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_ast_identifier ON ast_nodes(identifier);`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_ast_type ON ast_nodes(node_type);`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_ast_language ON ast_nodes(language);`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_term ON term_index(term);`);
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
        path: string;
    }> {
        if (!this.isReady) {
            vscode.window.showErrorMessage('OpenCat Knowledge Base is not available.');
            return { patternCount: 0, astNodeCount: 0, termCount: 0, path: 'N/A' };
        }

        const result = this.db.exec(`
            SELECT
                (SELECT COUNT(*) FROM patterns) as pattern_count,
                (SELECT COUNT(*) FROM ast_nodes) as ast_count,
                (SELECT COUNT(DISTINCT term) FROM term_index) as term_count
        `);

        const row = result[0]?.values[0];
        return {
            patternCount: (row?.[0] as number) || 0,
            astNodeCount: (row?.[1] as number) || 0,
            termCount: (row?.[2] as number) || 0,
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
}
