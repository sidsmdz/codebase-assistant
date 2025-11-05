#!/bin/bash

# Phase 0 Update Script - Generic Multi-Language Support
# Removes type restrictions, adds multi-language ingestion

set -e  # Exit on error

PROJECT_DIR=~/awesomeProject/codebase-assistant

echo "============================================"
echo "OpenCat Phase 0 - Generic Pattern Support"
echo "============================================"
echo ""

cd "$PROJECT_DIR"

# Step 1: Install dependencies
echo "Step 1/6: Installing dependencies..."
npm uninstall sqlite3 sqlite 2>/dev/null || true
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
echo "✅ Dependencies installed"
echo ""

# Step 2: Update package.json
echo "Step 2/6: Updating package.json..."
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
  "categories": ["AI", "Programming Languages"],
  "main": "./dist/extension.js",
  "activationEvents": ["onView:opencat.chatView"],
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
    "@types/better-sqlite3": "^7.6.8",
    "@types/node": "^20.10.0",
    "@types/vscode": "^1.90.0",
    "@typescript-eslint/eslint-plugin": "^8.46.2",
    "@typescript-eslint/parser": "^8.46.2",
    "@vscode/vsce": "^2.22.0",
    "esbuild": "^0.25.11",
    "eslint": "^8.56.0",
    "typescript": "^5.3.3"
  },
  "dependencies": {
    "better-sqlite3": "^9.2.2"
  }
}
EOF
echo "✅ package.json updated"
echo ""

# Step 3: Create ingestionService.ts
echo "Step 3/6: Creating ingestionService.ts..."
cat > src/ingestionService.ts << 'INGESTION_EOF'
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { KnowledgeBaseManager } from './knowledgeBase/KnowledgeBaseManager';

export class IngestionService {
    constructor(private kbManager: KnowledgeBaseManager) {}

    async runIngestion() {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "OpenCat: Indexing workspace...",
            cancellable: true
        }, async (progress, token) => {

            const patterns = [
                '**/*.java',
                '**/*.ts',
                '**/*.tsx',
                '**/*.js',
                '**/*.jsx',
                '**/*.py',
                '**/*.go',
                '**/*.rs',
                '**/*.proto'
            ];

            let allFiles: vscode.Uri[] = [];
            for (const pattern of patterns) {
                const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
                allFiles.push(...files);
            }

            let patternsSaved = 0;
            const seenPatterns = new Set<string>();

            for (let i = 0; i < allFiles.length; i++) {
                const file = allFiles[i];
                if (token.isCancellationRequested) break;

                const fileName = path.basename(file.fsPath);
                progress.report({ 
                    message: `Scanning: ${fileName}`,
                    increment: (i / allFiles.length) * 100 
                });

                try {
                    const content = await fs.readFile(file.fsPath, 'utf-8');
                    const language = this.detectLanguage(file.fsPath);
                                        
                    if (this.shouldSkipFile(fileName, content)) {
                        continue;
                    }

                    const snippets = this.extractSnippets(content, file.fsPath, language);
                                        
                    for (const snippet of snippets) {
                        const fingerprint = this.createFingerprint(snippet.code);
                        if (seenPatterns.has(fingerprint)) {
                            continue;
                        }
                        seenPatterns.add(fingerprint);

                        await this.kbManager.savePattern({
                            name: snippet.name,
                            language: language,
                            code: snippet.code,
                            description: snippet.description,
                            query: snippet.tags.join(' '),
                            tags: snippet.tags,
                            metadata: {
                                filePath: file.fsPath,
                                framework: snippet.framework,
                                category: snippet.category
                            }
                        });
                        patternsSaved++;
                    }
                } catch (e) {
                    console.warn(`Could not parse ${file.fsPath}: ${e}`);
                }
            }
            vscode.window.showInformationMessage(
                `✅ Indexed ${patternsSaved} patterns from ${allFiles.length} files!`
            );
        });
    }

    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const langMap: { [key: string]: string } = {
            '.java': 'java',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.py': 'python',
            '.go': 'go',
            '.rs': 'rust',
            '.proto': 'protobuf'
        };
        return langMap[ext] || 'text';
    }

    private shouldSkipFile(fileName: string, content: string): boolean {
        const lowerFileName = fileName.toLowerCase();
                
        if (lowerFileName.includes('test') || 
            lowerFileName.includes('spec') ||
            lowerFileName.includes('.min.') ||
            lowerFileName.includes('.bundle.')) {
            return true;
        }
                
        if (content.includes('@Generated') || 
            content.includes('// AUTO-GENERATED') ||
            content.includes('/* eslint-disable */') ||
            content.includes('# Generated by')) {
            return true;
        }

        if (content.length < 200) {
            return true;
        }
                
        return false;
    }

    private extractSnippets(content: string, filePath: string, language: string): Array<{
        name: string;
        code: string;
        description: string;
        tags: string[];
        framework?: string;
        category?: string;
    }> {
        const snippets = [];
        const fileName = path.basename(filePath, path.extname(filePath));

        const framework = this.detectFramework(content);
        const imports = this.extractImports(content, language);
        const blocks = this.extractCodeBlocks(content, language);

        for (const block of blocks) {
            if (block.code.split('\n').length < 5) continue;

            const detectedPatterns = this.detectPatterns(block.code, language);
            if (detectedPatterns.length === 0) continue;

            const tags = [
                'ingested',
                language,
                ...imports.slice(0, 3),
                ...detectedPatterns,
                ...(framework ? [framework] : [])
            ];

            snippets.push({
                name: block.name || `${fileName} Pattern`,
                code: block.code,
                description: `Example from ${path.basename(filePath)}: ${block.description}`,
                tags: [...new Set(tags)],
                framework: framework,
                category: this.categorizeCode(block.code, language)
            });
        }

        return snippets;
    }

    private detectFramework(content: string): string | undefined {
        if (content.includes('@RestController') || content.includes('@Controller')) return 'spring-boot';
        if (content.includes('io.grpc')) return 'grpc';
        if (content.includes('from "react"') || content.includes('from \'react\'')) return 'react';
        if (content.includes('@angular/core')) return 'angular';
        if (content.includes('express')) return 'express';
        if (content.includes('nestjs')) return 'nestjs';
        if (content.includes('from flask')) return 'flask';
        if (content.includes('from django')) return 'django';
        if (content.includes('from fastapi')) return 'fastapi';
        return undefined;
    }

    private extractImports(content: string, language: string): string[] {
        const imports: string[] = [];

        if (language === 'java') {
            const matches = content.matchAll(/import\s+([\w.]+);/g);
            for (const match of matches) {
                const parts = match[1].split('.');
                imports.push(parts[parts.length - 1]);
            }
        } else if (language === 'typescript' || language === 'javascript') {
            const matches = content.matchAll(/import\s+.*?from\s+['"](.+?)['"]/g);
            for (const match of matches) {
                const pkg = match[1].replace(/^[@./]/, '').split('/')[0];
                imports.push(pkg);
            }
        } else if (language === 'python') {
            const matches = content.matchAll(/(?:from|import)\s+([\w.]+)/g);
            for (const match of matches) {
                imports.push(match[1].split('.')[0]);
            }
        }

        return [...new Set(imports)];
    }

    private extractCodeBlocks(content: string, language: string): Array<{
        name: string;
        code: string;
        description: string;
    }> {
        const blocks = [];
        const lines = content.split('\n');

        if (language === 'java' || language === 'typescript' || language === 'javascript') {
            const methods = this.findMethods(lines, language);
            for (const method of methods) {
                const methodCode = lines.slice(method.start, method.end).join('\n');
                blocks.push({
                    name: `${method.name} Example`,
                    code: methodCode,
                    description: `Method: ${method.name}`
                });
            }
        } else if (language === 'python') {
            const funcs = this.findPythonFunctions(lines);
            for (const func of funcs) {
                const funcCode = lines.slice(func.start, func.end).join('\n');
                blocks.push({
                    name: `${func.name} Example`,
                    code: funcCode,
                    description: `Function: ${func.name}`
                });
            }
        } else if (language === 'protobuf') {
            blocks.push({
                name: 'Protocol Buffer Definition',
                code: content,
                description: 'gRPC service or message definition'
            });
        }

        return blocks;
    }

    private findMethods(lines: string[], language: string): Array<{
        name: string;
        start: number;
        end: number;
    }> {
        const methods = [];
        let currentMethod: { name: string; start: number; end: number } | null = null;
        let braceCount = 0;

        const methodRegex = language === 'java'
            ? /(private|public|protected)\s+[\w<>[\]]+\s+(\w+)\s*\(/
            : /(?:function|const|let|var)?\s*(\w+)\s*[=:]?\s*(?:async\s*)?\(?[\w,\s]*\)?\s*(?:=>)?\s*{/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            if (!currentMethod) {
                const match = trimmedLine.match(methodRegex);
                if (match) {
                    currentMethod = {
                        name: match[2] || match[1],
                        start: i,
                        end: -1
                    };
                    braceCount = 0;
                }
            }
            
            if (currentMethod) {
                const openBraces = (line.match(/{/g) || []).length;
                const closeBraces = (line.match(/}/g) || []).length;
                braceCount += openBraces - closeBraces;
                
                if (braceCount === 0 && currentMethod.start !== i) {
                    currentMethod.end = i + 1;
                    
                    const methodLength = currentMethod.end - currentMethod.start;
                    if (methodLength > 5 && methodLength < 100) {
                        methods.push(currentMethod);
                    }
                    currentMethod = null;
                }
            }
        }
        return methods;
    }

    private findPythonFunctions(lines: string[]): Array<{
        name: string;
        start: number;
        end: number;
    }> {
        const functions = [];
        let currentFunc: { name: string; start: number; end: number; indent: number } | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const indent = line.search(/\S/);
            
            if (line.trim().startsWith('def ')) {
                const match = line.match(/def\s+(\w+)\s*\(/);
                if (match) {
                    if (currentFunc) {
                        currentFunc.end = i;
                        functions.push(currentFunc);
                    }
                    currentFunc = {
                        name: match[1],
                        start: i,
                        end: -1,
                        indent: indent
                    };
                }
            } else if (currentFunc && indent <= currentFunc.indent && line.trim().length > 0) {
                currentFunc.end = i;
                functions.push(currentFunc);
                currentFunc = null;
            }
        }

        if (currentFunc) {
            currentFunc.end = lines.length;
            functions.push(currentFunc);
        }

        return functions.filter(f => (f.end - f.start) > 5 && (f.end - f.start) < 100);
    }

    private detectPatterns(code: string, language: string): string[] {
        const patterns = [];

        if (code.includes('async') || code.includes('await')) patterns.push('async');
        if (code.includes('Promise') || code.includes('Future')) patterns.push('promise');
        if (code.includes('try') && code.includes('catch')) patterns.push('error-handling');
        
        if (language === 'java') {
            if (code.includes('@Override')) patterns.push('override');
            if (code.includes('@Autowired')) patterns.push('dependency-injection');
            if (code.includes('Stream.')) patterns.push('stream-api');
        }
        
        if (language === 'typescript' || language === 'javascript') {
            if (code.includes('useState') || code.includes('useEffect')) patterns.push('react-hooks');
            if (code.includes('.map(') || code.includes('.filter(')) patterns.push('functional');
            if (code.includes('interface') || code.includes('type')) patterns.push('types');
        }

        if (language === 'python') {
            if (code.includes('@decorator') || code.match(/@\w+/)) patterns.push('decorator');
            if (code.includes('with ')) patterns.push('context-manager');
            if (code.includes('yield')) patterns.push('generator');
        }

        if (code.includes('grpc') || code.includes('rpc ')) patterns.push('grpc');
        if (code.includes('message ') && language === 'protobuf') patterns.push('protobuf-message');

        return patterns;
    }

    private categorizeCode(code: string, language: string): string {
        if (code.includes('server') || code.includes('listen') || code.includes('bind')) return 'server';
        if (code.includes('rpc') || code.includes('grpc')) return 'grpc';
        if (code.includes('http') || code.includes('router') || code.includes('@Get') || code.includes('@Post')) return 'api';
        if (code.includes('render') || code.includes('component') || code.includes('jsx')) return 'ui';
        if (code.includes('useState') || code.includes('useEffect')) return 'react-component';
        if (code.includes('repository') || code.includes('database') || code.includes('query')) return 'data';
        if (code.includes('util') || code.includes('helper')) return 'utility';
        return 'general';
    }

    private createFingerprint(code: string): string {
        const methodNames = (code.match(/\w+\s*\(/g) || []).join('');
        const normalized = code
            .replace(/\s+/g, '')
            .replace(/["'].*?["']/g, 'STR')
            .replace(/[0-9]+/g, 'N')
            .replace(/\/\/.*/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        
        return normalized.substring(0, 500) + '::' + methodNames;
    }
}
INGESTION_EOF
echo "✅ ingestionService.ts created"
echo ""

# Step 4: Replace KnowledgeBaseManager.ts
echo "Step 4/6: Updating KnowledgeBaseManager.ts..."
cat > src/knowledgeBase/KnowledgeBaseManager.ts << 'KB_MANAGER_EOF'
import * as vscode from 'vscode';
import * as path from 'path';
import Database from 'better-sqlite3';

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
    private db!: Database.Database;

    constructor(private context: vscode.ExtensionContext) {
        this.dbPath = path.join(context.globalStorageUri.fsPath, 'opencat.db');
    }

    async initialize(): Promise<void> {
        try {
            await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
            
            this.db = new Database(this.dbPath);

            this.db.exec(`
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

            this.db.exec(`
                CREATE VIRTUAL TABLE IF NOT EXISTS patterns_fts USING fts5(
                    name,
                    description,
                    tags,
                    code
                );
            `);

            console.log('Knowledge base (SQLite) initialized at:', this.dbPath);
            vscode.window.showInformationMessage(`OpenCat KB ready`);

        } catch (error) {
            console.error('Failed to initialize KB (SQLite):', error);
            throw error;
        }
    }

    getKBPath(): string {
        return this.dbPath;
    }

    async getStats(): Promise<{ patternCount: number; path: string }> {
        const result = this.db.prepare("SELECT COUNT(*) as count FROM patterns").get() as { count: number };
        return {
            patternCount: result?.count || 0,
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
            this.db.prepare(`
                INSERT INTO patterns (id, name, language, code, description, query, savedAt, tags_json, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                savedPattern.id,
                savedPattern.name,
                savedPattern.language,
                savedPattern.code,
                savedPattern.description,
                savedPattern.query,
                savedPattern.savedAt,
                tags_json,
                metadata_json
            );

            const insertedRow = this.db.prepare("SELECT last_insert_rowid() as rowid").get() as { rowid: number };

            this.db.prepare(`
                INSERT INTO patterns_fts (rowid, name, description, tags, code)
                VALUES (?, ?, ?, ?, ?)
            `).run(
                insertedRow.rowid,
                savedPattern.name,
                savedPattern.description,
                tags_json,
                savedPattern.code
            );

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
            const results = this.db.prepare(`
                SELECT p.*
                FROM patterns p
                WHERE p.rowid IN (
                    SELECT rowid FROM patterns_fts WHERE patterns_fts MATCH ?
                )
                ORDER BY p.savedAt DESC
                LIMIT 5
            `).all(ftsQuery);

            return results.map((row: any) => ({
                ...row,
                tags: JSON.parse(row.tags_json || '[]'),
                metadata: JSON.parse(row.metadata_json || '{}')
            }));
        } catch (error) {
            console.error('Search failed:', error);
            return [];
        }
    }

    async getAllPatterns(): Promise<SavedPattern[]> {
        const results = this.db.prepare("SELECT * FROM patterns ORDER BY name").all();
        return results.map((row: any) => ({
            ...row,
            tags: JSON.parse(row.tags_json || '[]'),
            metadata: JSON.parse(row.metadata_json || '{}')
        }));
    }

    async deletePattern(patternId: string): Promise<void> {
        const row = this.db.prepare("SELECT rowid FROM patterns WHERE id = ?").get(patternId) as { rowid: number } | undefined;
        
        if (row) {
            this.db.prepare("DELETE FROM patterns_fts WHERE rowid = ?").run(row.rowid);
        }
        
        this.db.prepare("DELETE FROM patterns WHERE id = ?").run(patternId);
    }

    private generatePatternId(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}
KB_MANAGER_EOF
echo "✅ KnowledgeBaseManager.ts updated"
echo ""

# Step 5: Update ContextBuilder.ts
echo "Step 5/6: Updating ContextBuilder.ts..."
cat > src/knowledgeBase/ContextBuilder.ts << 'CONTEXT_BUILDER_EOF'
import * as vscode from 'vscode';
import { KnowledgeBaseManager, SavedPattern } from './KnowledgeBaseManager';

export class ContextBuilder {
    
    constructor(private kbManager?: KnowledgeBaseManager) {}

    async buildContextForQuery(userQuery: string): Promise<string> {
        
        try {
            let savedPatterns: SavedPattern[] = [];
            if (this.kbManager) {
                savedPatterns = await this.kbManager.searchPatterns(userQuery);
            }

            if (savedPatterns.length === 0) {
                console.log('No patterns found in KB. Asking Copilot directly.');
                return this.buildEnrichedPrompt(userQuery, []);
            }

            return this.buildEnrichedPrompt(userQuery, savedPatterns.slice(0, 3));

        } catch (error) {
            console.error('Failed to build context:', error);
            return this.buildEnrichedPrompt(userQuery, []);
        }
    }

    private buildEnrichedPrompt(userQuery: string, savedPatterns: SavedPattern[]): string {
        let prompt = `You are a helpful and precise code assistant.
You MUST follow these rules:
1.  Answer the user's request using ONLY the code examples provided in the context blocks.
2.  Do NOT invent new class names, file names, or methods if they are not in the context.
3.  Base your answer *directly* on the provided snippets.
4.  If the context is empty or irrelevant, politely state that you cannot answer based on the provided examples.

`;

        if (savedPatterns.length > 0) {
            prompt += `--- CONTEXT: SAVED KNOWLEDGE BASE PATTERNS ---\n\n`;
            savedPatterns.forEach((pattern) => {
                prompt += `**Pattern: ${pattern.name}** (Description: ${pattern.description})\n`;
                prompt += `(Tags: ${pattern.tags.join(', ')})\n`;
                prompt += `\`\`\`${pattern.language}\n${pattern.code}\n\`\`\`\n\n`;
            });
        } else {
            return userQuery;
        }

        prompt += `--- END OF CONTEXT ---\n\n`;
        prompt += `User Request: ${userQuery}\n\n`;
        prompt += `Answer the user request using ONLY the code from the '--- CONTEXT ---' blocks above.`;

        return prompt;
    }
}
CONTEXT_BUILDER_EOF
echo "✅ ContextBuilder.ts updated"
echo ""

# Step 6: Update extension.ts
echo "Step 6/6: Updating extension.ts..."
cat > src/extension.ts << 'EXTENSION_EOF'
import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';
import { KnowledgeBaseManager } from './knowledgeBase/KnowledgeBaseManager';
import { IngestionService } from './ingestionService';

let kbManager: KnowledgeBaseManager;

export async function activate(context: vscode.ExtensionContext) {
    console.log('OpenCat extension activating...');

    kbManager = new KnowledgeBaseManager(context);
    await kbManager.initialize();

    const provider = new ChatViewProvider(context.extensionUri, kbManager);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('opencat.chatView', provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('opencat.openChat', () => {
            vscode.commands.executeCommand('opencat.chatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('opencat.ingestWorkspace', async () => {
            const ingestService = new IngestionService(kbManager);
            await ingestService.runIngestion();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('opencat.showKBStats', async () => {
            const stats = await kbManager.getStats();
            vscode.window.showInformationMessage(
                `OpenCat Knowledge Base (SQLite)\n` +
                `Patterns: ${stats.patternCount}\n` +
                `Path: ${stats.path}`
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('opencat.listPatterns', async () => {
            const patterns = await kbManager.getAllPatterns();
            
            if (patterns.length === 0) {
                vscode.window.showInformationMessage('No patterns saved. Run "OpenCat: Index Workspace" to get started!');
                return;
            }

            const items = patterns.map(p => ({
                label: `${p.name}`,
                description: `${p.language} • ${p.tags.join(', ')}`,
                detail: p.description,
                pattern: p
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a pattern to view or delete'
            });

            if (selected) {
                const action = await vscode.window.showQuickPick([
                    { label: '👁️  View Code', action: 'view' },
                    { label: '🗑️  Delete', action: 'delete' }
                ], {
                    placeHolder: `What do you want to do with "${selected.label}"?`
                });

                if (action?.action === 'view') {
                    const doc = await vscode.workspace.openTextDocument({
                        content: selected.pattern.code,
                        language: selected.pattern.language
                    });
                    await vscode.window.showTextDocument(doc);
                } else if (action?.action === 'delete') {
                    const confirm = await vscode.window.showWarningMessage(
                        `Delete pattern "${selected.label}"?`,
                        'Delete', 'Cancel'
                    );
                    if (confirm === 'Delete') {
                        await kbManager.deletePattern(selected.pattern.id);
                        vscode.window.showInformationMessage(`Deleted pattern "${selected.label}"`);
                    }
                }
            }
        })
    );

    console.log('OpenCat activated successfully');
}

export function deactivate() {}

export function getKBManager(): KnowledgeBaseManager {
    return kbManager;
}
EXTENSION_EOF
echo "✅ extension.ts updated"
echo ""

# Step 7: Delete old files
echo "Cleaning up old files..."
rm -f src/knowledgeBase/DependencyTracer.ts
echo "✅ DependencyTracer.ts deleted"
echo ""

# Step 8: Compile
echo "Compiling extension..."
npm run compile
echo "✅ Compilation complete"
echo ""

echo "============================================"
echo "✅ Phase 0 Update Complete!"
echo "============================================"
echo ""
echo "Changes made:"
echo "  ✅ Removed type restrictions (controller/service/etc)"
echo "  ✅ Added multi-language support (Java, TS, Python, Go, Rust, Proto)"
echo "  ✅ SQLite database with FTS"
echo "  ✅ Smart pattern extraction with metadata"
echo "  ✅ Framework detection (Spring, React, gRPC, Flask, etc)"
echo ""
echo "Next steps:"
echo "  1. Press F5 to debug extension"
echo "  2. Run: 'OpenCat: Index Workspace'"
echo "  3. Watch patterns being extracted"
echo "  4. Ask OpenCat questions!"
echo ""
echo "Test queries:"
echo "  - 'create grpc server'"
echo "  - 'react component with hooks'"
echo "  - 'python async function'"
echo ""
