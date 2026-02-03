import * as vscode from 'vscode';
import { Database } from 'sql.js';
import { LSPProvider } from './LSPProvider';

/**
 * Interface for semantic symbols from LSP
 */
export interface SemanticSymbol {
    name: string;
    kind: string;
    filePath: string;
    line: number;
    character: number;
    containerName?: string;
    references?: SemanticReference[];
}

/**
 * Interface for symbol references
 */
export interface SemanticReference {
    filePath: string;
    line: number;
    character: number;
    isDefinition: boolean;
}

/**
 * LSP Indexer - Extracts semantic information using VS Code's Language Servers
 * Complements tree-sitter's structural parsing with semantic understanding
 */
export class LSPIndexer {
    private lspProvider: LSPProvider;

    constructor(private db: Database) {
        this.lspProvider = new LSPProvider();
    }

    /**
     * Index workspace using LSP for semantic information
     */
    async indexWorkspace(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
        console.log('[LSPIndexer] Starting LSP-based semantic indexing...');

        try {
            // Find all source files
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, '**/*.{java,ts,tsx,js,jsx}'),
                '**/node_modules/**'
            );

            console.log(`[LSPIndexer] Found ${files.length} files for semantic indexing`);

            // Index files in batches (don't overwhelm LSP servers)
            const batchSize = 20;
            let indexed = 0;

            for (let i = 0; i < files.length; i += batchSize) {
                const batch = files.slice(i, i + batchSize);
                
                await Promise.all(
                    batch.map(uri => this.indexFile(uri).catch(err => {
                        console.warn(`[LSPIndexer] Failed to index ${uri.fsPath}:`, err);
                    }))
                );

                indexed += batch.length;
                console.log(`[LSPIndexer] Indexed ${Math.min(indexed, files.length)}/${files.length} files`);
            }

            console.log('[LSPIndexer] ✅ Semantic indexing complete');
        } catch (error) {
            console.error('[LSPIndexer] Indexing failed:', error);
            throw error;
        }
    }

    /**
     * Index a single file using LSP
     */
    private async indexFile(uri: vscode.Uri): Promise<void> {
        try {
            // Get all symbols in the file
            const symbols = await this.lspProvider.getDocumentSymbols(uri);
            
            if (symbols.length === 0) {
                return; // No symbols found, skip
            }

            // Save symbols to database
            for (const symbol of symbols) {
                await this.saveSymbol({
                    name: symbol.name,
                    kind: vscode.SymbolKind[symbol.kind],
                    filePath: uri.fsPath,
                    line: symbol.location.range.start.line,
                    character: symbol.location.range.start.character,
                    containerName: symbol.containerName
                });
            }

            // For key symbols, get and save references
            const keySymbols = symbols.filter(s => 
                s.kind === vscode.SymbolKind.Class ||
                s.kind === vscode.SymbolKind.Interface ||
                s.kind === vscode.SymbolKind.Method ||
                s.kind === vscode.SymbolKind.Function
            );

            for (const symbol of keySymbols) {
                try {
                    const refs = await this.lspProvider.getReferences(
                        uri,
                        symbol.location.range.start,
                        true
                    );

                    if (refs.length > 0) {
                        await this.saveReferences(symbol.name, uri.fsPath, refs.map(ref => ({
                            filePath: ref.uri.fsPath,
                            line: ref.range.start.line,
                            character: ref.range.start.character,
                            isDefinition: ref.isDefinition
                        })));
                    }
                } catch (error) {
                    // References may not be available for all symbols, ignore
                }
            }
        } catch (error) {
            console.warn(`[LSPIndexer] Error indexing ${uri.fsPath}:`, error);
        }
    }

    /**
     * Save semantic symbol to database
     */
    private async saveSymbol(symbol: SemanticSymbol): Promise<void> {
        this.db.run(`
            INSERT OR REPLACE INTO lsp_symbols (name, kind, file_path, line, character, container_name)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            symbol.name,
            symbol.kind,
            symbol.filePath,
            symbol.line,
            symbol.character,
            symbol.containerName || null
        ]);
    }

    /**
     * Save symbol references to database
     */
    private async saveReferences(symbolName: string, symbolFile: string, refs: SemanticReference[]): Promise<void> {
        // Get symbol ID
        const result = this.db.exec(`
            SELECT id FROM lsp_symbols 
            WHERE name = ? AND file_path = ?
            LIMIT 1
        `, [symbolName, symbolFile]);

        if (result.length === 0 || result[0].values.length === 0) {
            return; // Symbol not found
        }

        const symbolId = result[0].values[0][0] as number;

        // Insert references
        for (const ref of refs) {
            this.db.run(`
                INSERT OR REPLACE INTO lsp_references (symbol_id, file_path, line, character, is_definition)
                VALUES (?, ?, ?, ?, ?)
            `, [
                symbolId,
                ref.filePath,
                ref.line,
                ref.character,
                ref.isDefinition ? 1 : 0
            ]);
        }
    }

    /**
     * Query semantic symbols by name pattern
     */
    querySymbols(namePattern: string, kind?: string): SemanticSymbol[] {
        let sql = `
            SELECT name, kind, file_path, line, character, container_name
            FROM lsp_symbols
            WHERE name LIKE ?
        `;
        const params: any[] = [`%${namePattern}%`];

        if (kind) {
            sql += ` AND kind = ?`;
            params.push(kind);
        }

        sql += ` ORDER BY name`;

        const result = this.db.exec(sql, params);
        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => ({
            name: row[0] as string,
            kind: row[1] as string,
            filePath: row[2] as string,
            line: row[3] as number,
            character: row[4] as number,
            containerName: row[5] as string | undefined
        }));
    }

    /**
     * Get all references to a symbol
     */
    getSymbolReferences(symbolName: string, filePath: string): SemanticReference[] {
        const result = this.db.exec(`
            SELECT r.file_path, r.line, r.character, r.is_definition
            FROM lsp_references r
            JOIN lsp_symbols s ON r.symbol_id = s.id
            WHERE s.name = ? AND s.file_path = ?
            ORDER BY r.file_path, r.line
        `, [symbolName, filePath]);

        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => ({
            filePath: row[0] as string,
            line: row[1] as number,
            character: row[2] as number,
            isDefinition: row[3] === 1
        }));
    }

    /**
     * Get call hierarchy for a symbol
     */
    async getCallHierarchy(filePath: string, line: number, character: number) {
        const uri = vscode.Uri.file(filePath);
        const position = new vscode.Position(line, character);
        return this.lspProvider.getCallHierarchy(uri, position);
    }

    /**
     * Clear all LSP data from database
     */
    clearAll(): void {
        this.db.run('DELETE FROM lsp_symbols');
        this.db.run('DELETE FROM lsp_references');
        this.lspProvider.clearCache();
    }
}
