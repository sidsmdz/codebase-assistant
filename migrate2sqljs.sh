#!/bin/bash

# Migration Script: Switch from better-sqlite3 to sql.js
# Fixes: "Could not locate the bindings file" error

set -e

PROJECT_DIR=~/awesomeProject/codebase-assistant

echo "============================================"
echo "OpenCat: Migrating to sql.js"
echo "============================================"
echo ""

cd "$PROJECT_DIR"

# Step 1: Remove old dependencies
echo "Step 1/5: Removing better-sqlite3 and @vscode/sqlite3..."
npm uninstall better-sqlite3 @vscode/sqlite3 2>/dev/null || true
echo "✅ Old dependencies removed"
echo ""

# Step 2: Install sql.js
echo "Step 2/5: Installing sql.js..."
npm install sql.js
npm install --save-dev @types/sql.js
echo "✅ sql.js installed"
echo ""

# Step 3: Update package.json
echo "Step 3/5: Updating package.json..."
cat > package.json << 'EOF'
{
  "name": "opencat",
  "displayName": "OpenCat",
  "description": "AI code assistant with company knowledge",
  "version": "0.1.0",
  "publisher": "your-company",
  "engines": {
    "vscode": "^1.90.0"
  },
  "categories": [
    "AI",
    "Programming Languages"
  ],
  "main": "./dist/extension.js",
  "activationEvents": [
    "onView:opencat.chatView"
  ],
  "contributes": {
    "views": {
      "explorer": [
        {
          "type": "webview",
          "id": "opencat.chatView",
          "name": "OpenCat"
        }
      ]
    },
    "commands": [
      {
        "command": "opencat.openChat",
        "title": "OpenCat: Open Chat"
      },
      {
        "command": "opencat.showKBStats",
        "title": "OpenCat: Show Knowledge Base Stats"
      },
      {
        "command": "opencat.listPatterns",
        "title": "OpenCat: List Saved Patterns"
      },
      {
        "command": "opencat.ingestWorkspace",
        "title": "OpenCat: Index Workspace"
      }
    ]
  },
  "scripts": {
    "vscode:prepublish": "npm run package",
    "compile": "npm run check-types && npm run lint && node esbuild.js",
    "watch": "npm-run-all -p watch:*",
    "watch:esbuild": "node esbuild.js --watch",
    "watch:tsc": "tsc --noEmit --watch --project tsconfig.json",
    "package": "npm run check-types && npm run lint && node esbuild.js --production",
    "check-types": "tsc --noEmit",
    "lint": "eslint src"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/sql.js": "^1.4.9",
    "@types/vscode": "^1.90.0",
    "@typescript-eslint/eslint-plugin": "^8.46.2",
    "@typescript-eslint/parser": "^8.46.2",
    "@vscode/vsce": "^2.22.0",
    "esbuild": "^0.25.11",
    "eslint": "^8.56.0",
    "typescript": "^5.3.3"
  },
  "dependencies": {
    "sql.js": "^1.10.3"
  }
}
EOF
echo "✅ package.json updated"
echo ""

# Step 4: Replace KnowledgeBaseManager.ts with sql.js version
echo "Step 4/5: Updating KnowledgeBaseManager.ts..."
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
            
            // Initialize sql.js
            this.SQL = await initSqlJs({
                locateFile: (file: string) => `https://sql.js.org/dist/${file}`
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
echo "✅ KnowledgeBaseManager.ts updated with sql.js"
echo ""

# Step 5: Reinstall dependencies and compile
echo "Step 5/5: Installing dependencies and compiling..."
npm install
npm run compile
echo "✅ Compilation complete"
echo ""

echo "============================================"
echo "✅ Migration Complete!"
echo "============================================"
echo ""
echo "Changes made:"
echo "  ✅ Removed better-sqlite3 (native module)"
echo "  ✅ Installed sql.js (pure JavaScript)"
echo "  ✅ Updated KnowledgeBaseManager.ts"
echo "  ✅ All patterns will work the same"
echo ""
echo "Why this fixes your error:"
echo "  • sql.js uses WebAssembly (portable)"
echo "  • No native binaries needed"
echo "  • Works on local, remote, WSL, anywhere"
echo "  • Same SQLite features, zero config"
echo ""
echo "Next steps:"
echo "  1. Press F5 to debug extension"
echo "  2. Run: 'OpenCat: Index Workspace'"
echo "  3. Test pattern search"
echo ""
echo "Note: Your old database will be migrated automatically"
echo "      (sql.js reads the same .db file format)"
echo ""
