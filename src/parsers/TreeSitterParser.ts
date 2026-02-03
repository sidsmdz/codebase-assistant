import * as vscode from 'vscode';
import { ASTNode, NodeType, Language } from './ASTParser';
import { TreeSitterWasmManager } from './TreeSitterWasmManager';

/**
 * Modern AST Parser using Tree-sitter WASM
 * Replaces legacy custom parsers with unified, accurate parsing
 */
export class TreeSitterParser {
    private treeSitter: TreeSitterWasmManager;
    private initialized: boolean = false;

    constructor(extensionPath: string) {
        this.treeSitter = new TreeSitterWasmManager(extensionPath);
    }

    /**
     * Initialize tree-sitter WASM
     */
    async initialize(): Promise<void> {
        if (!this.initialized) {
            await this.treeSitter.initialize();
            await this.treeSitter.loadLanguages().catch(err => {
                console.warn('Some tree-sitter grammars not available:', err);
            });
            this.initialized = true;
        }
    }

    /**
     * Parse source code and extract structured AST nodes
     */
    async parse(code: string, filePath: string): Promise<ASTNode[]> {
        if (!this.initialized) {
            await this.initialize();
        }

        const language = this.detectLanguage(filePath);
        if (!language) {
            console.warn(`Unsupported file type: ${filePath}`);
            return [];
        }

        try {
            // TreeSitterWasmManager uses TypeScript parser for JavaScript too
            const tsLanguage: 'java' | 'typescript' = language === 'java' ? 'java' : 'typescript';
            const tree = await this.treeSitter.parse(filePath, code, tsLanguage);
            if (!tree) {
                return [];
            }

            const nodes: ASTNode[] = [];
            this.extractNodes(tree.rootNode, code, filePath, language, nodes);
            return nodes;
        } catch (error) {
            console.error(`Tree-sitter parse error for ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Recursively extract AST nodes from tree-sitter syntax tree
     */
    private extractNodes(
        node: any,
        code: string,
        filePath: string,
        language: Language,
        result: ASTNode[],
        parentId?: string
    ): void {
        // Map tree-sitter node types to our NodeType enum
        const nodeType = this.mapNodeType(node.type, language);
        
        if (nodeType) {
            const astNode = this.createASTNode(node, code, filePath, language, nodeType, parentId);
            if (astNode) {
                result.push(astNode);
                parentId = astNode.id; // Children will reference this node
            }
        }

        // Recursively process children
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
                this.extractNodes(child, code, filePath, language, result, parentId);
            }
        }
    }

    /**
     * Create ASTNode from tree-sitter node
     */
    private createASTNode(
        node: any,
        code: string,
        filePath: string,
        language: Language,
        type: NodeType,
        parentId?: string
    ): ASTNode | null {
        try {
            // Get identifier (name of class, method, etc.)
            const identifier = this.extractIdentifier(node);
            if (!identifier) {
                return null;
            }

            const startLine = node.startPosition.row + 1;
            const endLine = node.endPosition.row + 1;
            const id = this.generateId(filePath, identifier, startLine);

            // Extract code snippet
            const nodeCode = code.substring(node.startIndex, node.endIndex);

            // Build AST node
            const astNode: ASTNode = {
                id,
                type,
                identifier,
                filePath,
                startLine,
                endLine,
                language,
                code: nodeCode,
                parentId
            };

            // Extract additional metadata based on node type
            if (type === 'METHOD' || type === 'FUNCTION') {
                astNode.parameters = this.extractParameters(node, language);
                astNode.returnType = this.extractReturnType(node, language);
                astNode.modifiers = this.extractModifiers(node, language);
                astNode.signature = this.buildSignature(astNode);
            } else if (type === 'CLASS' || type === 'INTERFACE') {
                astNode.modifiers = this.extractModifiers(node, language);
            }

            return astNode;
        } catch (error) {
            console.warn(`Failed to create AST node:`, error);
            return null;
        }
    }

    /**
     * Map tree-sitter node types to our NodeType enum
     */
    private mapNodeType(tsNodeType: string, language: Language): NodeType | null {
        if (language === 'java') {
            switch (tsNodeType) {
                case 'class_declaration':
                    return 'CLASS';
                case 'interface_declaration':
                    return 'INTERFACE';
                case 'method_declaration':
                case 'constructor_declaration':
                    return 'METHOD';
                case 'field_declaration':
                    return 'VARIABLE';
                case 'enum_declaration':
                    return 'ENUM';
                default:
                    return null;
            }
        } else if (language === 'typescript' || language === 'javascript') {
            switch (tsNodeType) {
                case 'class_declaration':
                    return 'CLASS';
                case 'interface_declaration':
                    return 'INTERFACE';
                case 'method_definition':
                case 'function_declaration':
                    return 'FUNCTION';
                case 'arrow_function':
                    return 'FUNCTION';
                case 'variable_declaration':
                case 'lexical_declaration':
                    return 'VARIABLE';
                default:
                    return null;
            }
        }

        return null;
    }

    /**
     * Extract identifier (name) from tree-sitter node
     */
    private extractIdentifier(node: any): string | null {
        // Try to find identifier child node
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && child.type === 'identifier') {
                return child.text;
            }
        }

        // Fallback: look for named children
        const namedChild = node.childForFieldName('name');
        if (namedChild) {
            return namedChild.text;
        }

        return null;
    }

    /**
     * Extract method/function parameters
     */
    private extractParameters(node: any, language: Language): Array<{ name: string; type: string }> {
        const params: Array<{ name: string; type: string }> = [];

        // Find formal_parameters or parameters node
        const paramsNode = node.childForFieldName('parameters');
        if (!paramsNode) {
            return params;
        }

        // Iterate through parameter nodes
        for (let i = 0; i < paramsNode.childCount; i++) {
            const child = paramsNode.child(i);
            if (!child || child.type === ',' || child.type === '(' || child.type === ')') {
                continue;
            }

            const paramName = this.extractIdentifier(child) || 'param';
            const paramType = this.extractType(child, language) || 'any';

            params.push({ name: paramName, type: paramType });
        }

        return params;
    }

    /**
     * Extract return type
     */
    private extractReturnType(node: any, language: Language): string | undefined {
        if (language === 'java') {
            const typeNode = node.childForFieldName('type');
            return typeNode ? typeNode.text : undefined;
        } else if (language === 'typescript') {
            const returnTypeNode = node.childForFieldName('return_type');
            return returnTypeNode ? returnTypeNode.text.replace(/^:\s*/, '') : undefined;
        }
        return undefined;
    }

    /**
     * Extract type from node
     */
    private extractType(node: any, language: Language): string | undefined {
        const typeNode = node.childForFieldName('type');
        return typeNode ? typeNode.text : undefined;
    }

    /**
     * Extract modifiers (public, static, async, etc.)
     */
    private extractModifiers(node: any, language: Language): string[] {
        const modifiers: string[] = [];

        // Look for modifier nodes (public, private, static, etc.)
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (!child) continue;

            if (language === 'java') {
                if (['public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized'].includes(child.type)) {
                    modifiers.push(child.type);
                }
            } else if (language === 'typescript' || language === 'javascript') {
                if (['async', 'static', 'export', 'default', 'readonly'].includes(child.type)) {
                    modifiers.push(child.type);
                }
            }
        }

        return modifiers;
    }

    /**
     * Build method/function signature
     */
    private buildSignature(node: ASTNode): string {
        const modifiers = node.modifiers?.join(' ') || '';
        const returnType = node.returnType || 'void';
        const params = node.parameters?.map(p => `${p.type} ${p.name}`).join(', ') || '';
        
        return `${modifiers} ${returnType} ${node.identifier}(${params})`.trim();
    }

    /**
     * Detect language from file path
     */
    private detectLanguage(filePath: string): Language | null {
        const ext = filePath.toLowerCase().split('.').pop();
        
        switch (ext) {
            case 'java':
                return 'java';
            case 'ts':
            case 'tsx':
                return 'typescript';
            case 'js':
            case 'jsx':
                return 'javascript';
            default:
                return null;
        }
    }

    /**
     * Generate unique ID for AST node
     */
    private generateId(filePath: string, identifier: string, startLine: number): string {
        const base = `${filePath}:${identifier}:${startLine}`;
        let hash = 0;
        for (let i = 0; i < base.length; i++) {
            const char = base.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        // Cache is managed by TreeSitterWasmManager internally
    }
}
