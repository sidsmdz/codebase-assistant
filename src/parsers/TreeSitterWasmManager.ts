import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as TreeSitter from 'web-tree-sitter';

// Type definitions
type Language = TreeSitter.Language;
type Tree = TreeSitter.Tree;
type SyntaxNode = TreeSitter.Node;

interface ParsedNode {
    type: string;
    name: string;
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
    children?: ParsedNode[];
}

interface Relationship {
    sourceEntity: string;
    targetEntity: string;
    relationType: 'EXTENDS' | 'IMPLEMENTS' | 'CALLS' | 'USES' | 'REFERENCES' | 'DEFINES' | 'RETURNS';
    sourceFile: string;
    sourceLine: number;
    metadata?: Record<string, any>;
}

export class TreeSitterWasmManager {
    private parser: TreeSitter.Parser | null = null;
    private javaLanguage: Language | null = null;
    private typescriptLanguage: Language | null = null;
    private cache: Map<string, { tree: Tree | null; version: number }> = new Map();
    private initialized: boolean = false;
    private extensionPath: string;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // Load WASM binary directly to avoid createRequire() issues in bundled extensions
            const wasmPath = path.join(this.extensionPath, 'dist', 'web-tree-sitter.wasm');
            console.log('Loading tree-sitter WASM from:', wasmPath);
            
            const wasmBuffer = await fs.readFile(wasmPath);
            const wasmBinary = new Uint8Array(wasmBuffer).buffer;
            
            // Initialize Parser with WASM binary
            await TreeSitter.Parser.init({
                wasmBinary: wasmBinary
            });
            
            this.parser = new TreeSitter.Parser();
            this.initialized = true;

            console.log('✅ Tree-sitter WASM initialized successfully');

        } catch (error) {
            console.error('Tree-sitter WASM initialization failed:', error);
            console.log('⚠️  Continuing without tree-sitter support');
            this.initialized = false;
        }
    }

    async loadLanguages(): Promise<void> {
        if (!this.parser) {
            console.log('Parser not initialized - skipping language loading');
            return;
        }

        try {
            // Load Java grammar
            const javaWasmPath = path.join(__dirname, '../../grammars/tree-sitter-java.wasm');
            this.javaLanguage = await TreeSitter.Language.load(javaWasmPath);
            console.log('✅ Java grammar loaded');
        } catch (error) {
            console.warn('⚠️  Java grammar not available:', error);
        }

        try {
            // Load TypeScript grammar
            const tsWasmPath = path.join(__dirname, '../../grammars/tree-sitter-typescript.wasm');
            this.typescriptLanguage = await TreeSitter.Language.load(tsWasmPath);
            console.log('✅ TypeScript grammar loaded');
        } catch (error) {
            console.warn('⚠️  TypeScript grammar not available:', error);
        }
    }

    isAvailable(): boolean {
        return this.initialized && this.parser !== null;
    }

    hasLanguage(language: 'java' | 'typescript'): boolean {
        return language === 'java' ? this.javaLanguage !== null : this.typescriptLanguage !== null;
    }

    parse(filePath: string, code: string, language: 'java' | 'typescript'): Tree | null {
        if (!this.parser) {
            return null;
        }

        const lang = language === 'java' ? this.javaLanguage : this.typescriptLanguage;
        if (!lang) {
            console.warn(`Language ${language} not loaded`);
            return null;
        }

        this.parser.setLanguage(lang);
        const tree = this.parser.parse(code);
        
        // Cache the tree
        this.cache.set(filePath, { tree, version: Date.now() });
        
        return tree;
    }

    update(filePath: string, newCode: string, edit: any): Tree | null {
        if (!this.parser) {
            return null;
        }

        const cached = this.cache.get(filePath);
        if (!cached) {
            // No cached tree, do a full parse
            const language = this.detectLanguage(filePath);
            return this.parse(filePath, newCode, language);
        }

        // Apply edit to existing tree if tree is not null
        if (cached.tree) {
            cached.tree.edit(edit);
            const newTree = this.parser.parse(newCode, cached.tree);
            
            // Update cache
            this.cache.set(filePath, { tree: newTree, version: Date.now() });
            return newTree;
        } else {
            // Re-parse if no tree available
            const language = this.detectLanguage(filePath);
            return this.parse(filePath, newCode, language);
        }
    }

    extractEntities(tree: Tree, sourceFile: string): ParsedNode[] {
        if (!tree) {
            return [];
        }

        const entities: ParsedNode[] = [];
        const rootNode = tree.rootNode;

        const traverse = (node: SyntaxNode) => {
            // Extract classes, interfaces, methods, functions
            if (this.isEntityNode(node)) {
                const entity = this.nodeToEntity(node);
                if (entity) {
                    entities.push(entity);
                }
            }

            // Recurse into children
            for (let i = 0; i < node.childCount; i++) {
                traverse(node.child(i)!);
            }
        };

        traverse(rootNode);
        return entities;
    }

    extractRelationships(tree: Tree, sourceFile: string): Relationship[] {
        if (!tree) {
            return [];
        }

        const relationships: Relationship[] = [];
        const rootNode = tree.rootNode;

        const traverse = (node: SyntaxNode, currentEntity?: string) => {
            // Detect different relationship types
            if (node.type === 'class_declaration') {
                const className = this.getIdentifier(node);
                
                // Check for extends/implements
                const superclassNode = node.childForFieldName('superclass');
                if (superclassNode && className) {
                    relationships.push({
                        sourceEntity: className,
                        targetEntity: superclassNode.text,
                        relationType: 'EXTENDS',
                        sourceFile,
                        sourceLine: node.startPosition.row + 1
                    });
                }

                const interfacesNode = node.childForFieldName('interfaces');
                if (interfacesNode && className) {
                    // Extract all interfaces
                    for (let i = 0; i < interfacesNode.childCount; i++) {
                        const interfaceNode = interfacesNode.child(i);
                        if (interfaceNode && interfaceNode.type === 'type_identifier') {
                            relationships.push({
                                sourceEntity: className,
                                targetEntity: interfaceNode.text,
                                relationType: 'IMPLEMENTS',
                                sourceFile,
                                sourceLine: node.startPosition.row + 1
                            });
                        }
                    }
                }

                // Recurse with current class context
                for (let i = 0; i < node.childCount; i++) {
                    const child = node.child(i);
                    if (child && className) {
                        traverse(child, className);
                    }
                }
            } else if (node.type === 'method_invocation' && currentEntity) {
                // Method call relationship
                const methodName = this.getIdentifier(node);
                if (methodName) {
                    relationships.push({
                        sourceEntity: currentEntity,
                        targetEntity: methodName,
                        relationType: 'CALLS',
                        sourceFile,
                        sourceLine: node.startPosition.row + 1
                    });
                }
            } else {
                // Continue traversing
                for (let i = 0; i < node.childCount; i++) {
                    traverse(node.child(i)!, currentEntity);
                }
            }
        };

        traverse(rootNode);
        return relationships;
    }

    private isEntityNode(node: SyntaxNode): boolean {
        return [
            'class_declaration',
            'interface_declaration',
            'method_declaration',
            'function_declaration',
            'constructor_declaration'
        ].includes(node.type);
    }

    private nodeToEntity(node: SyntaxNode): ParsedNode | null {
        const name = this.getIdentifier(node);
        if (!name) {
            return null;
        }

        return {
            type: node.type,
            name,
            startPosition: {
                row: node.startPosition.row,
                column: node.startPosition.column
            },
            endPosition: {
                row: node.endPosition.row,
                column: node.endPosition.column
            }
        };
    }

    private getIdentifier(node: SyntaxNode): string | null {
        // Try to get identifier from 'name' field
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
            return nameNode.text;
        }

        // Fallback: look for first identifier child
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && (child.type === 'identifier' || child.type === 'type_identifier')) {
                return child.text;
            }
        }

        return null;
    }

    private detectLanguage(filePath: string): 'java' | 'typescript' {
        const ext = path.extname(filePath).toLowerCase();
        return ext === '.java' ? 'java' : 'typescript';
    }

    dispose(): void {
        this.cache.clear();
        this.parser = null;
        this.javaLanguage = null;
        this.typescriptLanguage = null;
        this.initialized = false;
    }
}
