import * as vscode from 'vscode';
import { LSPProvider } from '../indexing/LSPProvider';
import { TreeSitterWasmManager } from '../parsers/TreeSitterWasmManager';

/**
 * Structured context with three layers for optimal AI understanding
 */
export interface HybridContext {
    /** The exact code block being edited (focal point) */
    activeCode: {
        code: string;
        language: string;
        filePath: string;
        range: vscode.Range;
        symbolName?: string;
    };
    
    /** Skeleton map of current file and neighbors (signatures only) */
    skeletonMap: SkeletonFile[];
    
    /** Resolved dependencies from other files (LSP-based) */
    dependencies: DependencyInfo[];
    
    /** LSP diagnostics and symbol information */
    lspContext: {
        symbols: Array<{ name: string; type: string; definedIn: string }>;
        diagnostics: Array<{ message: string; severity: string }>;
    };
}

export interface SkeletonFile {
    filePath: string;
    language: string;
    outline: SkeletonNode[];
}

export interface SkeletonNode {
    type: 'class' | 'interface' | 'function' | 'method' | 'property';
    name: string;
    signature: string;
    accessibility?: 'public' | 'private' | 'protected';
    isStatic?: boolean;
    children?: SkeletonNode[];
}

export interface DependencyInfo {
    symbolName: string;
    filePath: string;
    language: string;
    signature: string;
    description?: string;
}

/**
 * Builds structured hybrid context using Tree-sitter + LSP
 * Implements the three-layer approach: Focal Point → Skeleton Map → Dependency Inject
 */
export class ContextProvider {
    constructor(
        private treeSitter: TreeSitterWasmManager,
        private lspProvider: LSPProvider
    ) {}

    /**
     * Build complete hybrid context for the current editor position
     */
    async buildContext(
        document: vscode.TextDocument,
        position: vscode.Position,
        includeNeighbors: boolean = true
    ): Promise<HybridContext> {
        const [activeCode, skeletonMap, dependencies, lspContext] = await Promise.all([
            this.extractFocalPoint(document, position),
            includeNeighbors ? this.buildSkeletonMap(document) : Promise.resolve([]),
            this.resolveDependencies(document, position),
            this.gatherLSPContext(document, position)
        ]);

        return {
            activeCode,
            skeletonMap,
            dependencies,
            lspContext
        };
    }

    /**
     * Layer 1: Extract the focal point (current function/class being edited)
     * Uses Tree-sitter to find the enclosing symbol
     */
    private async extractFocalPoint(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<HybridContext['activeCode']> {
        const code = document.getText();
        const language = this.mapLanguage(document.languageId);
        
        if (!language) {
            // Fallback: return current line + context
            const lineCount = Math.min(10, document.lineCount);
            const startLine = Math.max(0, position.line - 5);
            const endLine = Math.min(document.lineCount, position.line + 5);
            const range = new vscode.Range(startLine, 0, endLine, 0);
            
            return {
                code: document.getText(range),
                language: document.languageId,
                filePath: document.uri.fsPath,
                range
            };
        }

        // Parse with tree-sitter to find enclosing function/class
        const tree = this.treeSitter.parse(document.uri.fsPath, code, language);
        if (!tree) {
            // Fallback
            const range = new vscode.Range(position.line, 0, position.line + 1, 0);
            return {
                code: document.getText(range),
                language: document.languageId,
                filePath: document.uri.fsPath,
                range
            };
        }

        // Find the smallest enclosing node that's a function, method, or class
        const enclosingNode = this.findEnclosingSymbol(tree.rootNode, position);
        if (enclosingNode) {
            const range = new vscode.Range(
                enclosingNode.startPosition.row,
                enclosingNode.startPosition.column,
                enclosingNode.endPosition.row,
                enclosingNode.endPosition.column
            );

            return {
                code: document.getText(range),
                language: document.languageId,
                filePath: document.uri.fsPath,
                range,
                symbolName: this.extractSymbolName(enclosingNode)
            };
        }

        // Fallback: return current line
        const range = new vscode.Range(position.line, 0, position.line + 1, 0);
        return {
            code: document.getText(range),
            language: document.languageId,
            filePath: document.uri.fsPath,
            range
        };
    }

    /**
     * Layer 2: Build skeleton map of current file and neighbors
     * Extracts signatures only (no implementation details)
     */
    private async buildSkeletonMap(document: vscode.TextDocument): Promise<SkeletonFile[]> {
        const skeletons: SkeletonFile[] = [];

        // Current file skeleton
        const currentSkeleton = await this.extractFileSkeleton(document);
        if (currentSkeleton) {
            skeletons.push(currentSkeleton);
        }

        // Get related files (imports/dependencies) - limit to 3-5 most relevant
        const relatedFiles = await this.findRelatedFiles(document);
        for (const fileUri of relatedFiles.slice(0, 5)) {
            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const skeleton = await this.extractFileSkeleton(doc);
                if (skeleton) {
                    skeletons.push(skeleton);
                }
            } catch (error) {
                // Skip files that can't be opened
            }
        }

        return skeletons;
    }

    /**
     * Extract skeleton (signatures only) from a file using LSP
     */
    private async extractFileSkeleton(document: vscode.TextDocument): Promise<SkeletonFile | null> {
        // Use VS Code's LSP directly for DocumentSymbols
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );
        
        if (!symbols || symbols.length === 0) {
            return null;
        }

        const outline = this.convertSymbolsToSkeleton(symbols, document);

        return {
            filePath: document.uri.fsPath,
            language: document.languageId,
            outline
        };
    }

    /**
     * Convert LSP symbols to skeleton nodes (signatures only)
     */
    private convertSymbolsToSkeleton(
        symbols: vscode.DocumentSymbol[],
        document: vscode.TextDocument
    ): SkeletonNode[] {
        return symbols.map(symbol => {
            const signature = this.extractSignature(symbol, document);
            
            const node: SkeletonNode = {
                type: this.mapSymbolKind(symbol.kind),
                name: symbol.name,
                signature
            };

            // Recursively process children
            if (symbol.children && symbol.children.length > 0) {
                node.children = this.convertSymbolsToSkeleton(symbol.children, document);
            }

            return node;
        });
    }

    /**
     * Extract clean signature from symbol (no implementation)
     */
    private extractSignature(symbol: vscode.DocumentSymbol, document: vscode.TextDocument): string {
        const text = document.getText(symbol.range);
        
        // For methods/functions: extract only the signature line
        if (symbol.kind === vscode.SymbolKind.Method || symbol.kind === vscode.SymbolKind.Function) {
            const lines = text.split('\n');
            let signature = '';
            
            // Find opening brace to determine where signature ends
            for (const line of lines) {
                signature += line.trim() + ' ';
                if (line.includes('{') || line.includes(';')) {
                    break;
                }
            }
            
            // Clean up: remove implementation, keep signature
            return signature.split('{')[0].trim() + ';';
        }

        // For classes/interfaces: extract declaration line
        if (symbol.kind === vscode.SymbolKind.Class || symbol.kind === vscode.SymbolKind.Interface) {
            const firstLine = text.split('\n')[0].trim();
            return firstLine + ' { ... }';
        }

        // For properties/fields: extract declaration
        return text.split('\n')[0].trim();
    }

    /**
     * Layer 3: Resolve dependencies (imports, used types, external references)
     * Uses LSP to find definitions from other files
     */
    private async resolveDependencies(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<DependencyInfo[]> {
        const dependencies: DependencyInfo[] = [];

        // Get all symbols in current file using VS Code LSP directly
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );
        
        if (!symbols) {
            return dependencies;
        }

        // For each symbol, check if it references external types
        const externalRefs = await this.findExternalReferences(document, symbols);
        
        // Resolve definitions for external references
        for (const ref of externalRefs.slice(0, 10)) { // Limit to top 10
            try {
                const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
                    'vscode.executeDefinitionProvider',
                    document.uri,
                    ref.position
                );

                if (definitions && definitions.length > 0) {
                    for (const def of definitions) {
                        // Skip definitions in same file
                        if (def.uri.toString() === document.uri.toString()) {
                            continue;
                        }

                        const depDoc = await vscode.workspace.openTextDocument(def.uri);
                        const depSymbol = await this.getSymbolAtPosition(depDoc, def.range.start);
                        
                        if (depSymbol) {
                            dependencies.push({
                                symbolName: ref.name,
                                filePath: def.uri.fsPath,
                                language: depDoc.languageId,
                                signature: this.extractSignature(depSymbol, depDoc)
                            });
                        }
                    }
                }
            } catch (error) {
                // Skip symbols that can't be resolved
            }
        }

        return dependencies;
    }

    /**
     * Gather LSP context (symbols, diagnostics)
     */
    private async gatherLSPContext(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<HybridContext['lspContext']> {
        const [hover, diagnostics] = await Promise.all([
            vscode.commands.executeCommand<vscode.Hover>(
                'vscode.executeHoverProvider',
                document.uri,
                position
            ),
            vscode.languages.getDiagnostics(document.uri)
        ]);

        const symbols: Array<{ name: string; type: string; definedIn: string }> = [];
        
        // Extract type information from hover
        if (hover && hover.contents) {
            const content = Array.isArray(hover.contents) 
                ? hover.contents.map((c: any) => (typeof c === 'string' ? c : ('value' in c ? c.value : ''))).join('\n')
                : (typeof hover.contents === 'string' ? hover.contents : ('value' in hover.contents ? (hover.contents as any).value : ''));
            
            // Parse hover content for symbol information
            const symbolMatch = content.match(/(\w+):\s*([^\n]+)/);
            if (symbolMatch) {
                symbols.push({
                    name: symbolMatch[1],
                    type: symbolMatch[2],
                    definedIn: document.uri.fsPath
                });
            }
        }

        return {
            symbols,
            diagnostics: diagnostics
                .filter((d: vscode.Diagnostic) => d.severity <= vscode.DiagnosticSeverity.Warning)
                .map((d: vscode.Diagnostic) => ({
                    message: d.message,
                    severity: vscode.DiagnosticSeverity[d.severity]
                }))
        };
    }

    /**
     * Format the hybrid context into a structured prompt
     */
    formatAsPrompt(context: HybridContext): string {
        const sections: string[] = [];

        // Header
        sections.push('### SYSTEM CONTEXT');
        sections.push('You are an expert developer. Below is the relevant project context.\n');

        // Layer 2: Skeleton Map
        if (context.skeletonMap.length > 0) {
            sections.push('### CURRENT WORKSPACE SKELETON');
            for (const file of context.skeletonMap) {
                const relativePath = vscode.workspace.asRelativePath(file.filePath);
                sections.push(`- File: \`${relativePath}\` (${file.language})`);
                
                for (const node of file.outline) {
                    sections.push(this.formatSkeletonNode(node, 2));
                }
            }
            sections.push('');
        }

        // Layer 3: Dependencies
        if (context.dependencies.length > 0) {
            sections.push('### EXTERNAL DEPENDENCIES (LSP Resolved)');
            for (const dep of context.dependencies) {
                const relativePath = vscode.workspace.asRelativePath(dep.filePath);
                sections.push(`- \`${dep.symbolName}\` from \`${relativePath}\``);
                sections.push(`  \`\`\`${dep.language}`);
                sections.push(`  ${dep.signature}`);
                sections.push(`  \`\`\``);
            }
            sections.push('');
        }

        // LSP Context
        if (context.lspContext.symbols.length > 0 || context.lspContext.diagnostics.length > 0) {
            sections.push('### LOCAL SYMBOLS & DIAGNOSTICS (LSP)');
            
            for (const symbol of context.lspContext.symbols) {
                sections.push(`- Symbol \`${symbol.name}\`: Type \`${symbol.type}\``);
            }
            
            for (const diag of context.lspContext.diagnostics) {
                sections.push(`- ${diag.severity}: ${diag.message}`);
            }
            sections.push('');
        }

        // Layer 1: Active Code (Focal Point)
        sections.push('### ACTIVE CODE (Focal Point)');
        if (context.activeCode.symbolName) {
            sections.push(`Currently editing: \`${context.activeCode.symbolName}\`\n`);
        }
        sections.push(`\`\`\`${context.activeCode.language}`);
        sections.push(context.activeCode.code);
        sections.push('```');

        return sections.join('\n');
    }

    /**
     * Format skeleton node as indented text
     */
    private formatSkeletonNode(node: SkeletonNode, indent: number): string {
        const prefix = '  '.repeat(indent);
        let result = `${prefix}- ${node.type} \`${node.signature}\``;
        
        if (node.children && node.children.length > 0) {
            result += '\n' + node.children.map(child => 
                this.formatSkeletonNode(child, indent + 1)
            ).join('\n');
        }
        
        return result;
    }

    // Helper methods

    private mapLanguage(languageId: string): 'java' | 'typescript' | null {
        if (languageId === 'java') return 'java';
        if (['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(languageId)) {
            return 'typescript';
        }
        return null;
    }

    private mapSymbolKind(kind: vscode.SymbolKind): SkeletonNode['type'] {
        switch (kind) {
            case vscode.SymbolKind.Class: return 'class';
            case vscode.SymbolKind.Interface: return 'interface';
            case vscode.SymbolKind.Method: return 'method';
            case vscode.SymbolKind.Function: return 'function';
            case vscode.SymbolKind.Property:
            case vscode.SymbolKind.Field:
                return 'property';
            default: return 'property';
        }
    }

    private findEnclosingSymbol(node: any, position: vscode.Position): any {
        // Check if position is within this node
        if (position.line < node.startPosition.row || position.line > node.endPosition.row) {
            return null;
        }

        // Check if this is a relevant symbol type
        const relevantTypes = [
            'method_declaration', 'function_declaration', 'class_declaration',
            'interface_declaration', 'constructor_declaration', 'arrow_function',
            'function_expression', 'method_definition'
        ];

        // Search children first (find smallest enclosing node)
        for (const child of node.children || []) {
            const result = this.findEnclosingSymbol(child, position);
            if (result) {
                return result;
            }
        }

        // If no child matched but this node is relevant, return it
        if (relevantTypes.includes(node.type)) {
            return node;
        }

        return null;
    }

    private extractSymbolName(node: any): string | undefined {
        // Try to find name in child nodes
        for (const child of node.children || []) {
            if (child.type === 'identifier' || child.type === 'name') {
                return child.text;
            }
        }
        return node.text?.split('(')[0]?.split(' ').pop();
    }

    private async findRelatedFiles(document: vscode.TextDocument): Promise<vscode.Uri[]> {
        // Simple heuristic: files in same directory
        const dirPath = vscode.Uri.joinPath(document.uri, '..');
        const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(dirPath, '*.{java,ts,tsx,js,jsx}'),
            null,
            10
        );
        
        return files.filter(uri => uri.toString() !== document.uri.toString());
    }

    private async findExternalReferences(
        document: vscode.TextDocument,
        symbols: vscode.DocumentSymbol[]
    ): Promise<Array<{ name: string; position: vscode.Position }>> {
        const refs: Array<{ name: string; position: vscode.Position }> = [];
        const code = document.getText();

        // Simple regex to find import statements
        const importRegex = /import\s+(?:{[^}]+}|[\w]+)\s+from\s+['"]([^'"]+)['"]/g;
        let match;

        while ((match = importRegex.exec(code)) !== null) {
            const line = document.positionAt(match.index).line;
            refs.push({
                name: match[1],
                position: new vscode.Position(line, match.index)
            });
        }

        return refs;
    }

    private async getSymbolAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.DocumentSymbol | null> {
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );
        
        if (!symbols) return null;

        // Find symbol containing position
        const findSymbol = (syms: vscode.DocumentSymbol[]): vscode.DocumentSymbol | null => {
            for (const sym of syms) {
                if (sym.range.contains(position)) {
                    // Check children first (most specific)
                    if (sym.children) {
                        const child = findSymbol(sym.children);
                        if (child) return child;
                    }
                    return sym;
                }
            }
            return null;
        };

        return findSymbol(symbols);
    }
}
