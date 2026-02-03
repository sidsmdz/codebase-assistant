import * as vscode from 'vscode';

/**
 * Interface for symbol information from LSP
 */
export interface LSPSymbol {
    name: string;
    kind: vscode.SymbolKind;
    location: vscode.Location;
    containerName?: string;
    detail?: string;
}

/**
 * Interface for reference information
 */
export interface LSPReference {
    uri: vscode.Uri;
    range: vscode.Range;
    isDefinition: boolean;
}

/**
 * LSP Provider - Leverages VS Code's existing Language Servers
 * Instead of using LSIF static indexes, this uses real-time LSP data
 * from whatever language extensions the user has installed (Java, TypeScript, Python, etc.)
 */
export class LSPProvider {
    private symbolCache: Map<string, LSPSymbol[]> = new Map();
    private cacheTimeout = 60000; // 1 minute cache
    private lastIndexTime: Map<string, number> = new Map();

    /**
     * Get all symbols in a document using VS Code's LSP
     */
    async getDocumentSymbols(uri: vscode.Uri): Promise<LSPSymbol[]> {
        const cacheKey = uri.toString();
        const cached = this.symbolCache.get(cacheKey);
        const lastIndex = this.lastIndexTime.get(cacheKey) || 0;

        // Return cached if still valid
        if (cached && Date.now() - lastIndex < this.cacheTimeout) {
            return cached;
        }

        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
            );

            if (!symbols) {
                return [];
            }

            const flatSymbols = this.flattenSymbols(symbols, uri);
            this.symbolCache.set(cacheKey, flatSymbols);
            this.lastIndexTime.set(cacheKey, Date.now());

            return flatSymbols;
        } catch (error) {
            console.warn(`Failed to get symbols for ${uri.fsPath}:`, error);
            return [];
        }
    }

    /**
     * Flatten hierarchical document symbols
     */
    private flattenSymbols(
        symbols: vscode.DocumentSymbol[],
        uri: vscode.Uri,
        containerName?: string
    ): LSPSymbol[] {
        const result: LSPSymbol[] = [];

        for (const symbol of symbols) {
            const location = new vscode.Location(uri, symbol.range);
            
            result.push({
                name: symbol.name,
                kind: symbol.kind,
                location,
                containerName,
                detail: symbol.detail
            });

            // Recursively process children
            if (symbol.children && symbol.children.length > 0) {
                result.push(...this.flattenSymbols(symbol.children, uri, symbol.name));
            }
        }

        return result;
    }

    /**
     * Get all symbols in workspace using LSP
     */
    async getWorkspaceSymbols(query: string = ''): Promise<LSPSymbol[]> {
        try {
            const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                'vscode.executeWorkspaceSymbolProvider',
                query
            );

            if (!symbols) {
                return [];
            }

            return symbols.map(sym => ({
                name: sym.name,
                kind: sym.kind,
                location: sym.location,
                containerName: sym.containerName
            }));
        } catch (error) {
            console.warn('Failed to get workspace symbols:', error);
            return [];
        }
    }

    /**
     * Get definition locations for a symbol at a position
     */
    async getDefinition(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
        try {
            const locations = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeDefinitionProvider',
                uri,
                position
            );

            return locations || [];
        } catch (error) {
            console.warn('Failed to get definition:', error);
            return [];
        }
    }

    /**
     * Get all references to a symbol at a position
     */
    async getReferences(
        uri: vscode.Uri,
        position: vscode.Position,
        includeDeclaration: boolean = true
    ): Promise<LSPReference[]> {
        try {
            const locations = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeReferenceProvider',
                uri,
                position
            );

            if (!locations) {
                return [];
            }

            // Get definition to mark it
            const definitions = await this.getDefinition(uri, position);
            const defSet = new Set(
                definitions.map(loc => `${loc.uri.toString()}:${loc.range.start.line}:${loc.range.start.character}`)
            );

            return locations.map(loc => ({
                uri: loc.uri,
                range: loc.range,
                isDefinition: defSet.has(`${loc.uri.toString()}:${loc.range.start.line}:${loc.range.start.character}`)
            }));
        } catch (error) {
            console.warn('Failed to get references:', error);
            return [];
        }
    }

    /**
     * Get type definition for a symbol
     */
    async getTypeDefinition(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
        try {
            const locations = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeTypeDefinitionProvider',
                uri,
                position
            );

            return locations || [];
        } catch (error) {
            console.warn('Failed to get type definition:', error);
            return [];
        }
    }

    /**
     * Get implementations of an interface/abstract class
     */
    async getImplementations(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
        try {
            const locations = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeImplementationProvider',
                uri,
                position
            );

            return locations || [];
        } catch (error) {
            console.warn('Failed to get implementations:', error);
            return [];
        }
    }

    /**
     * Get call hierarchy (callers and callees)
     */
    async getCallHierarchy(
        uri: vscode.Uri,
        position: vscode.Position
    ): Promise<{
        incoming: vscode.CallHierarchyIncomingCall[];
        outgoing: vscode.CallHierarchyOutgoingCall[];
    }> {
        try {
            // Prepare call hierarchy
            const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                'vscode.prepareCallHierarchy',
                uri,
                position
            );

            if (!items || items.length === 0) {
                return { incoming: [], outgoing: [] };
            }

            const item = items[0];

            // Get incoming calls (who calls this)
            const incoming = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
                'vscode.provideIncomingCalls',
                item
            ) || [];

            // Get outgoing calls (what this calls)
            const outgoing = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
                'vscode.provideOutgoingCalls',
                item
            ) || [];

            return { incoming, outgoing };
        } catch (error) {
            console.warn('Failed to get call hierarchy:', error);
            return { incoming: [], outgoing: [] };
        }
    }

    /**
     * Get hover information (documentation, type info)
     */
    async getHover(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Hover | null> {
        try {
            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                uri,
                position
            );

            return hovers && hovers.length > 0 ? hovers[0] : null;
        } catch (error) {
            console.warn('Failed to get hover info:', error);
            return null;
        }
    }

    /**
     * Index all files in workspace using LSP
     */
    async indexWorkspace(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
        console.log('Indexing workspace using LSP...');
        
        const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceFolder, '**/*.{java,ts,js,py,go,cs,cpp,c,h}'),
            '**/node_modules/**'
        );

        console.log(`Found ${files.length} files to index via LSP`);

        // Index files in batches to avoid overwhelming LSP servers
        const batchSize = 50;
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            await Promise.all(
                batch.map(uri => this.getDocumentSymbols(uri).catch(() => []))
            );
            console.log(`Indexed ${Math.min(i + batchSize, files.length)}/${files.length} files`);
        }

        console.log('✅ Workspace indexed via LSP');
    }

    /**
     * Clear cache for a specific file or all files
     */
    clearCache(uri?: vscode.Uri): void {
        if (uri) {
            const key = uri.toString();
            this.symbolCache.delete(key);
            this.lastIndexTime.delete(key);
        } else {
            this.symbolCache.clear();
            this.lastIndexTime.clear();
        }
    }

    /**
     * Search for symbols matching a query
     */
    async searchSymbols(query: string, kinds?: vscode.SymbolKind[]): Promise<LSPSymbol[]> {
        const symbols = await this.getWorkspaceSymbols(query);

        if (!kinds || kinds.length === 0) {
            return symbols;
        }

        return symbols.filter(sym => kinds.includes(sym.kind));
    }

    /**
     * Find all classes in workspace
     */
    async findClasses(): Promise<LSPSymbol[]> {
        return this.searchSymbols('', [vscode.SymbolKind.Class]);
    }

    /**
     * Find all interfaces in workspace
     */
    async findInterfaces(): Promise<LSPSymbol[]> {
        return this.searchSymbols('', [vscode.SymbolKind.Interface]);
    }

    /**
     * Find all methods/functions in workspace
     */
    async findMethods(): Promise<LSPSymbol[]> {
        return this.searchSymbols('', [vscode.SymbolKind.Method, vscode.SymbolKind.Function]);
    }
}
