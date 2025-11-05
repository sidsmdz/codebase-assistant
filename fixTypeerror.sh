#!/bin/bash

# Fix TypeScript type incompatibility
set -e

PROJECT_DIR=~/awesomeProject/codebase-assistant

echo "Fixing TypeScript type error..."

cd "$PROJECT_DIR"

cat > src/knowledgeBase/KnowledgeBaseManager.ts << 'EOF'
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import initSqlJs, { Database } from 'sql.js';

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

    constructor(private context: vscode.ExtensionContext) {
        this.dbPath = path.join(context.globalStorageUri.fsPath, 'opencat.db');
    }

    async initialize(): Promise<void> {
        try {
            await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
            
            // Load WASM file from extension directory
            const wasmPath = path.join(this.context.extensionPath, 'dist', 'sql-wasm.wasm');
            const wasmBuffer = await fs.readFile(wasmPath);
            
            // Convert Buffer to Uint8Array (which is compatible with ArrayBuffer)
            const wasmBinary = new Uint8Array(wasmBuffer);

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

            // Create tables
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

            this.db.run(`
                CREATE VIRTUAL TABLE IF NOT EXISTS patterns_fts USING fts5(
                    name,
                    description,
                    tags,
                    code
                );
            `);

            console.log('Knowledge base (sql.js) initialized at:', this.dbPath);
            vscode.window.showInformationMessage(`OpenCat KB ready`);

        } catch (error) {
            console.error('Failed to initialize KB (sql.js):', error);
            throw error;
        }
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

    async getStats(): Promise<{ patternCount: number; path: string }> {
        const result = this.db.exec("SELECT COUNT(*) as count FROM patterns");
        const count = result[0]?.values[0]?.[0] as number || 0;
        return {
            patternCount: count,
            path: this.dbPath
        };
    }

    async savePattern(pattern: Omit<SavedPattern, 'id' | 'savedAt'>): Promise<SavedPattern> {
        const savedPattern: SavedPattern = {
            ...pattern,
            id: this.generatePatternId(),
            savedAt: new Date().toISOString()
        };
        
        const tags_json = JSON.stringify(savedPattern.tags);
        const metadata_json = JSON.stringify(savedPattern.metadata || {});

        try {
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

            const lastRowId = this.db.exec("SELECT last_insert_rowid() as rowid")[0].values[0][0] as number;

            this.db.run(`
                INSERT INTO patterns_fts (rowid, name, description, tags, code)
                VALUES (?, ?, ?, ?, ?)
            `, [
                lastRowId,
                savedPattern.name,
                savedPattern.description,
                tags_json,
                savedPattern.code
            ]);

            await this.saveDatabase();

            console.log(`Saved pattern: ${savedPattern.name}`);
            return savedPattern;
        } catch (error) {
            console.error('Failed to save pattern:', error);
            throw error;
        }
    }

    private extractKeywords(query: string): string {
        const stopWords = ['how', 'do', 'i', 'the', 'a', 'an', 'to', 'in', 'for', 'create', 'make', 'write', 'add', 'new'];
        
        const words = query
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.includes(w));

        return [...new Set(words)].join(' OR ');
    }

    async searchPatterns(query: string): Promise<SavedPattern[]> {
        const ftsQuery = this.extractKeywords(query.toLowerCase());
        if (!ftsQuery) return [];

        try {
            const results = this.db.exec(`
                SELECT p.*
                FROM patterns p
                WHERE p.rowid IN (
                    SELECT rowid FROM patterns_fts WHERE patterns_fts MATCH ?
                )
                ORDER BY p.savedAt DESC
                LIMIT 5
            `, [ftsQuery]);

            if (!results[0]) return [];

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
        } catch (error) {
            console.error('Search failed:', error);
            return [];
        }
    }

    async getAllPatterns(): Promise<SavedPattern[]> {
        const results = this.db.exec("SELECT * FROM patterns ORDER BY name");
        
        if (!results[0]) return [];

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
        const row = this.db.exec("SELECT rowid FROM patterns WHERE id = ?", [patternId]);
        
        if (row[0]?.values[0]) {
            const rowid = row[0].values[0][0];
            this.db.run("DELETE FROM patterns_fts WHERE rowid = ?", [rowid]);
        }
        
        this.db.run("DELETE FROM patterns WHERE id = ?", [patternId]);
        
        await this.saveDatabase();
    }

    private generatePatternId(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}
EOF

echo "✅ Type error fixed"
echo ""
echo "Compiling..."
npm run compile

echo ""
echo "✅ Done! The key change:"
echo "   Buffer → Uint8Array (compatible with ArrayBuffer)"
echo ""
echo "Press F5 to test!"
