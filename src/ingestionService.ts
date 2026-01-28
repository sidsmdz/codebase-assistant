import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { KnowledgeBaseManager } from './knowledgeBase/KnowledgeBaseManager';
import { JavaASTParser } from './parsers/JavaASTParser';
import { TypeScriptASTParser } from './parsers/TypeScriptASTParser';
import { ASTNode } from './parsers/ASTParser';

export class IngestionService {
    private javaParser: JavaASTParser;
    private tsParser: TypeScriptASTParser;
    private jsParser: TypeScriptASTParser;

    constructor(private kbManager: KnowledgeBaseManager) {
        this.javaParser = new JavaASTParser();
        this.tsParser = new TypeScriptASTParser(true);  // TypeScript
        this.jsParser = new TypeScriptASTParser(false); // JavaScript
    }

    async runIngestion() {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "OpenCat: Indexing workspace with AST + BM25...",
            cancellable: true
        }, async (progress, token) => {

            const patterns = [
                '**/*.java',
                '**/*.ts',
                '**/*.tsx',
                '**/*.js',
                '**/*.jsx'
            ];

            // Find all files
            progress.report({ message: "Finding files..." });
            let allFiles: vscode.Uri[] = [];
            for (const pattern of patterns) {
                const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
                allFiles.push(...files);
            }

            let patternsSaved = 0;
            let astNodesSaved = 0;
            let filesProcessed = 0;
            let filesSkipped = 0;
            const seenPatterns = new Set<string>();

            for (let i = 0; i < allFiles.length; i++) {
                const file = allFiles[i];
                if (token.isCancellationRequested) {
                    break;
                }

                const fileName = path.basename(file.fsPath);
                const relativePath = vscode.workspace.asRelativePath(file.fsPath);

                try {
                    // Get file stats for incremental indexing
                    const stats = await fs.stat(file.fsPath);
                    const content = await fs.readFile(file.fsPath, 'utf-8');
                    const fileHash = this.calculateHash(content);

                    // Check if file needs indexing
                    const shouldIndex = await this.kbManager.shouldIndexFile(
                        file.fsPath,
                        stats.mtimeMs,
                        fileHash
                    );

                    if (!shouldIndex) {
                        filesSkipped++;
                        progress.report({
                            message: `⏭️  Skipped (unchanged): ${relativePath}`,
                            increment: (1 / allFiles.length) * 100
                        });
                        continue;
                    }

                    // Show which file is being indexed
                    progress.report({
                        message: `📄 Indexing: ${relativePath} (${i + 1}/${allFiles.length})`,
                        increment: (1 / allFiles.length) * 100
                    });

                    const language = this.detectLanguage(file.fsPath);

                    if (this.shouldSkipFile(fileName, content)) {
                        filesSkipped++;
                        continue;
                    }

                    // Parse file using appropriate AST parser
                    let astNodes: ASTNode[] = [];

                    if (language === 'java') {
                        astNodes = this.javaParser.parse(content, file.fsPath);
                        console.log(`📊 Java Parser: ${relativePath} returned ${astNodes.length} nodes`);
                        if (astNodes.length > 0) {
                            astNodes.forEach((node, idx) => {
                                console.log(`  [${idx}] ${node.type} "${node.identifier}" - code length: ${node.code?.length || 0} chars`);
                            });
                        }
                    } else if (language === 'typescript') {
                        astNodes = this.tsParser.parse(content, file.fsPath);
                    } else if (language === 'javascript') {
                        astNodes = this.jsParser.parse(content, file.fsPath);
                    }

                    // Group AST nodes into patterns and save
                    const framework = this.detectFramework(content);
                    const imports = this.extractImports(content, language);
                    let filePatternsCount = 0;

                    for (const node of astNodes) {
                        // Skip if no code
                        if (!node.code || node.code.trim().length < 100) {
                            if (language === 'java') {
                                console.log(`  ⏭️  Skipped ${node.identifier}: code too short (${node.code?.length || 0} < 100)`);
                            }
                            continue;
                        }

                        // Create fingerprint for deduplication
                        const fingerprint = this.createFingerprint(node.code);
                        if (seenPatterns.has(fingerprint)) {
                            if (language === 'java') {
                                console.log(`  ⏭️  Skipped ${node.identifier}: duplicate fingerprint`);
                            }
                            continue;
                        }
                        seenPatterns.add(fingerprint);

                        // Detect patterns in the code
                        const detectedPatterns = this.detectPatterns(node.code, language);

                        // Build tags
                        const tags = [
                            'ingested',
                            language,
                            node.type.toLowerCase(),
                            ...imports.slice(0, 3),
                            ...detectedPatterns,
                            ...(framework ? [framework] : [])
                        ];

                        // Save pattern with AST node
                        await this.kbManager.savePattern({
                            name: node.identifier,
                            language: language,
                            code: node.code,
                            description: `${node.type} from ${path.basename(file.fsPath)}: ${node.signature || node.identifier}`,
                            query: tags.join(' '),
                            tags: [...new Set(tags)],
                            metadata: {
                                filePath: file.fsPath,
                                framework: framework,
                                category: this.categorizeCode(node.code, language)
                            }
                        }, [node]); // Pass AST node for indexing

                        if (language === 'java') {
                            console.log(`  ✅ Saved Java pattern: ${node.identifier}`);
                        }

                        patternsSaved++;
                        astNodesSaved++;
                        filePatternsCount++;
                    }

                    // Mark file as indexed
                    await this.kbManager.markFileAsIndexed(
                        file.fsPath,
                        stats.mtimeMs,
                        fileHash,
                        filePatternsCount
                    );

                    filesProcessed++;

                } catch (e) {
                    console.warn(`Could not parse ${file.fsPath}: ${e}`);
                }
            }

            const message = filesSkipped > 0
                ? `✅ Indexed ${patternsSaved} patterns from ${filesProcessed} files! Skipped ${filesSkipped} unchanged files.`
                : `✅ Indexed ${patternsSaved} patterns with ${astNodesSaved} AST nodes from ${filesProcessed} files!`;

            vscode.window.showInformationMessage(message);
        });
    }

    /**
     * Calculate SHA-256 hash of content for change detection
     */
    private calculateHash(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const langMap: { [key: string]: string } = {
            '.java': 'java',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript'
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

    private detectFramework(content: string): string | undefined {
        if (content.includes('@RestController') || content.includes('@Controller')) {
            return 'spring-boot';
        }
        if (content.includes('io.grpc')) {
            return 'grpc';
        }
        if (content.includes('from "react"') || content.includes('from \'react\'')) {
            return 'react';
        }
        if (content.includes('@angular/core')) {
            return 'angular';
        }
        if (content.includes('express')) {
            return 'express';
        }
        if (content.includes('nestjs')) {
            return 'nestjs';
        }
        if (content.includes('from flask')) {
            return 'flask';
        }
        if (content.includes('from django')) {
            return 'django';
        }
        if (content.includes('from fastapi')) {
            return 'fastapi';
        }
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
        }

        return [...new Set(imports)];
    }

    private detectPatterns(code: string, language: string): string[] {
        const patterns = [];

        if (code.includes('async') || code.includes('await')) {
            patterns.push('async');
        }
        if (code.includes('Promise') || code.includes('Future')) {
            patterns.push('promise');
        }
        if (code.includes('try') && code.includes('catch')) {
            patterns.push('error-handling');
        }

        if (language === 'java') {
            if (code.includes('@Override')) {
                patterns.push('override');
            }
            if (code.includes('@Autowired')) {
                patterns.push('dependency-injection');
            }
            if (code.includes('Stream.')) {
                patterns.push('stream-api');
            }
        }

        if (language === 'typescript' || language === 'javascript') {
            if (code.includes('useState') || code.includes('useEffect')) {
                patterns.push('react-hooks');
            }
            if (code.includes('.map(') || code.includes('.filter(')) {
                patterns.push('functional');
            }
            if (code.includes('interface') || code.includes('type')) {
                patterns.push('types');
            }
        }

        if (code.includes('grpc') || code.includes('rpc ')) {
            patterns.push('grpc');
        }

        return patterns;
    }

    private categorizeCode(code: string, _language: string): string {
        if (code.includes('server') || code.includes('listen') || code.includes('bind')) {
            return 'server';
        }
        if (code.includes('rpc') || code.includes('grpc')) {
            return 'grpc';
        }
        if (code.includes('http') || code.includes('router') || code.includes('@Get') || code.includes('@Post')) {
            return 'api';
        }
        if (code.includes('render') || code.includes('component') || code.includes('jsx')) {
            return 'ui';
        }
        if (code.includes('useState') || code.includes('useEffect')) {
            return 'react-component';
        }
        if (code.includes('repository') || code.includes('database') || code.includes('query')) {
            return 'data';
        }
        if (code.includes('util') || code.includes('helper')) {
            return 'utility';
        }
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
