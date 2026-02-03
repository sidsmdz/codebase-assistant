import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { KnowledgeBaseManager } from './knowledgeBase/KnowledgeBaseManager';
import { TreeSitterParser } from './parsers/TreeSitterParser';
import { LSPIndexer } from './indexing/LSPIndexer';
import { ASTNode } from './parsers/ASTParser';
import { FeatureAnalyzer } from './analysis/FeatureAnalyzer';
import { ModuleDetector } from './analysis/ModuleDetector';

/**
 * Modern Ingestion Service using Tree-sitter + LSP
 * Completely rewritten for accuracy and performance
 */
export class IngestionService {
    private treeSitterParser: TreeSitterParser;
    private lspIndexer: LSPIndexer;
    private featureAnalyzer: FeatureAnalyzer;
    private moduleDetector: ModuleDetector;

    constructor(private kbManager: KnowledgeBaseManager) {
        const extensionPath = vscode.extensions.getExtension('your-company.autoforge')?.extensionPath || '';
        
        // Initialize with tree-sitter (replaces old custom parsers)
        this.treeSitterParser = new TreeSitterParser(extensionPath);
        
        // Initialize LSP indexer for semantic enrichment
        this.lspIndexer = new LSPIndexer(kbManager.getDatabase());
        
        // Keep existing analyzers
        this.featureAnalyzer = new FeatureAnalyzer();
        this.moduleDetector = new ModuleDetector();
    }

    async runIngestion() {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "AutoForge: Indexing with Tree-sitter + LSP...",
            cancellable: true
        }, async (progress, token) => {

            progress.report({ message: "Phase 1: Structural parsing with tree-sitter..." });
            
            const patterns = [
                '**/*.java',
                '**/*.ts',
                '**/*.tsx',
                '**/*.js',
                '**/*.jsx'
            ];

            // Find all files
            let allFiles: vscode.Uri[] = [];
            for (const pattern of patterns) {
                const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
                console.log(`Found ${files.length} files matching ${pattern}`);
                allFiles.push(...files);
            }

            // Log summary by extension
            const byExtension: { [key: string]: number } = {};
            allFiles.forEach(f => {
                const ext = path.extname(f.fsPath);
                byExtension[ext] = (byExtension[ext] || 0) + 1;
            });
            console.log('Files found by extension:', byExtension);

            let filesProcessed = 0;
            let filesSkipped = 0;

            // Clear previous feature analysis for fresh indexing
            this.featureAnalyzer.clear();

            // Initialize tree-sitter
            await this.treeSitterParser.initialize();

            // Phase 1: Parse with tree-sitter
            for (let i = 0; i < allFiles.length; i++) {
                const file = allFiles[i];
                if (token.isCancellationRequested) {
                    break;
                }

                const fileName = path.basename(file.fsPath);
                const relativePath = vscode.workspace.asRelativePath(file.fsPath);

                try {
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
                            increment: (1 / allFiles.length) * 50 // First phase is 50%
                        });
                        continue;
                    }

                    // Show which file is being indexed
                    progress.report({
                        message: `🌳 Tree-sitter parsing: ${relativePath} (${i + 1}/${allFiles.length})`,
                        increment: (1 / allFiles.length) * 50
                    });

                    if (this.shouldSkipFile(fileName, content)) {
                        filesSkipped++;
                        continue;
                    }

                    // Parse with tree-sitter (replaces all old parsers)
                    const astNodes: ASTNode[] = await this.treeSitterParser.parse(content, file.fsPath);
                    
                    console.log(`📊 Tree-sitter: ${relativePath} returned ${astNodes.length} nodes`);
                    if (astNodes.length > 0) {
                        astNodes.forEach((node, idx) => {
                            console.log(`  [${idx}] ${node.type} "${node.identifier}" - code length: ${node.code?.length || 0} chars`);
                        });
                    }

                    // Analyze nodes for feature detection
                    if (astNodes.length > 0) {
                        const components = this.featureAnalyzer.analyzeNodes(astNodes, content, file.fsPath);
                        console.log(`  📊 Analyzed ${astNodes.length} nodes → ${components.length} components`);
                    }

                    // Mark file as indexed
                    await this.kbManager.markFileAsIndexed(
                        file.fsPath,
                        stats.mtimeMs,
                        fileHash,
                        astNodes.length
                    );

                    filesProcessed++;

                } catch (e) {
                    console.warn(`Could not parse ${file.fsPath}: ${e}`);
                }
            }

            // Phase 2: Detect modules
            progress.report({ message: "Phase 2: Detecting project modules...", increment: 10 });
            
            
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const modules = await this.moduleDetector.detectModules(workspaceFolders[0].uri.fsPath);
                console.log(`📦 Detected ${modules.length} module(s):`, modules.map(m => m.name).join(', '));
                
                // If no modules detected, treat entire workspace as single module
                if (modules.length === 0) {
                    console.log('No build files detected. Treating workspace as single module.');
                    const singleModule = {
                        id: 'workspace-root',
                        name: path.basename(workspaceFolders[0].uri.fsPath),
                        path: workspaceFolders[0].uri.fsPath,
                        type: 'unknown' as const,
                        language: 'mixed' as const,
                        dependencies: [],
                        features: []
                    };
                    modules.push(singleModule);
                    // Register with detector for getModuleForFile to work
                    this.moduleDetector.registerModule(singleModule);
                }
                
                // Save module information to KB
                await this.kbManager.saveModules(modules);
            }

            // Phase 3: Identify and save features from analyzed components
            progress.report({ message: "🔍 Identifying features..." });

            const features = this.featureAnalyzer.identifyFeatures();
            const components = this.featureAnalyzer.getComponents();

            // Associate features with modules
            for (const feature of features) {
                // Find module for first component in feature
                const firstComponent = components.find(c => c.id === feature.components[0]);
                if (firstComponent) {
                    console.log(`Associating feature "${feature.name}" with module for file: ${firstComponent.filePath}`);
                    const module = this.moduleDetector.getModuleForFile(firstComponent.filePath);
                    if (module) {
                        console.log(`  ✅ Matched module: ${module.name} (${module.path})`);
                        feature.module = module.name;
                        feature.modulePath = module.path;
                        this.moduleDetector.addFeatureToModule(feature.id, firstComponent.filePath);
                    } else {
                        console.log(`  ⚠️ No module matched for ${firstComponent.filePath}`);
                        console.log(`  Available modules:`, this.moduleDetector.getAllModules().map(m => `${m.name} at ${m.path}`));
                    }
                } else {
                    console.log(`⚠️ Feature "${feature.name}" has no components!`);
                }

                // Detect cross-module dependencies
                for (const compId of feature.components) {
                    const comp = components.find(c => c.id === compId);
                    if (comp) {
                        const compModule = this.moduleDetector.getModuleForFile(comp.filePath);
                        if (compModule && compModule.name !== feature.module) {
                            // This component is from a different module - cross-module dependency
                            if (!feature.crossModuleDeps) {
                                feature.crossModuleDeps = [];
                            }
                            // Find other features in that module
                            const otherModuleFeatures = this.moduleDetector.getModuleFeatures(compModule.name);
                            feature.crossModuleDeps.push(...otherModuleFeatures.filter(f => f !== feature.id));
                        }
                    }
                }
            }

            if (components.length > 0) {
                progress.report({ message: `💾 Saving ${components.length} components...` });
                await this.kbManager.saveFeatureComponents(components);
            }

            if (features.length > 0) {
                progress.report({ message: `💾 Saving ${features.length} features...` });
                await this.kbManager.saveFeatures(features);
            }

            const featureStats = this.featureAnalyzer.getStats();
            console.log('Feature Analysis Stats:', featureStats);

            const modules = this.moduleDetector.getAllModules();
            const moduleInfo = modules.length > 1 
                ? ` across ${modules.length} modules (${modules.map(m => m.name).join(', ')})`
                : '';

            // Phase 3: LSP Semantic Indexing (optional enhancement)
            if (!token.isCancellationRequested && workspaceFolders && workspaceFolders.length > 0) {
                progress.report({ message: "Phase 3: LSP semantic indexing...", increment: 20 });
                
                try {
                    console.log('[IngestionService] Starting LSP semantic indexing...');
                    await this.lspIndexer.indexWorkspace(workspaceFolders[0]);
                    console.log('[IngestionService] ✅ LSP semantic indexing complete');
                } catch (error) {
                    console.warn('[IngestionService] LSP indexing failed (non-critical):', error);
                    vscode.window.showWarningMessage('LSP semantic indexing skipped - language servers may not be ready');
                }
            }

            progress.report({ increment: 20 }); // Complete to 100%

            const message = filesSkipped > 0
                ? `✅ Indexed ${features.length} features with ${components.length} components from ${filesProcessed} files${moduleInfo}! Skipped ${filesSkipped} unchanged files.`
                : `✅ Indexed ${features.length} features with ${components.length} components from ${filesProcessed} files${moduleInfo}!`;

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

    /**
     * Filter out trivial patterns that aren't meaningful for the knowledge base
     */
    private isTrivialPattern(identifier: string, nodeType: string, code: string): boolean {
        const lowerIdentifier = identifier.toLowerCase();

        // Skip standard library / common type names
        const trivialNames = [
            'arraylist', 'hashmap', 'hashset', 'linkedlist', 'treemap', 'treeset',
            'list', 'map', 'set', 'collection', 'iterator', 'comparable',
            'string', 'integer', 'boolean', 'double', 'float', 'long', 'object',
            'date', 'calendar', 'timestamp', 'uuid', 'optional', 'stream',
            'exception', 'error', 'throwable', 'runtimeexception',
            'tostring', 'hashcode', 'equals', 'clone', 'compareto',
            'promise', 'array', 'number', 'any', 'void', 'unknown', 'never'
        ];

        if (trivialNames.includes(lowerIdentifier)) {
            return true;
        }

        // Skip simple getters/setters (methods that are just get/set + field access)
        if (nodeType === 'METHOD') {
            if (lowerIdentifier.startsWith('get') || lowerIdentifier.startsWith('set')) {
                // Check if it's a simple getter/setter (very short code with just return/assign)
                const lines = code.split('\n').filter(l => l.trim().length > 0);
                if (lines.length <= 4) {
                    const codeBody = code.replace(/\s+/g, '');
                    if (codeBody.includes('return this.') || codeBody.includes('this.=')) {
                        return true;
                    }
                }
            }
        }

        // Skip very generic method names
        const genericMethodNames = [
            'init', 'initialize', 'setup', 'configure', 'destroy', 'dispose',
            'run', 'start', 'stop', 'execute', 'apply', 'call', 'invoke',
            'get', 'set', 'add', 'remove', 'update', 'delete', 'find', 'create'
        ];

        if (nodeType === 'METHOD' && genericMethodNames.includes(lowerIdentifier)) {
            // Only skip if the code is very short (likely just delegating)
            if (code.length < 200) {
                return true;
            }
        }

        // Skip interfaces that are just type definitions without behavior
        if (nodeType === 'INTERFACE') {
            // Keep interfaces if they have JSDoc or meaningful structure
            if (!code.includes('/**') && code.split('\n').length < 10) {
                return true;
            }
        }

        return false;
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
