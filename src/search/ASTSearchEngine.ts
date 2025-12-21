/**
 * AST Search Engine for structural code search
 * Searches indexed AST nodes based on structure, type, and identifiers
 */

import { Database } from 'sql.js';
import { ASTNode, NodeType } from '../parsers/ASTParser';
import { QueryIntent } from './QueryParser';

export interface ASTSearchResult {
    node: ASTNode;
    score: number;
    matchType: 'exact' | 'fuzzy' | 'partial';
}

export interface ASTSearchOptions {
    nodeType?: NodeType;
    identifier?: string;
    language?: 'java' | 'typescript' | 'javascript';
    fuzzyThreshold?: number;  // Levenshtein distance threshold for fuzzy matching
    limit?: number;
}

/**
 * AST-based structural search engine
 */
export class ASTSearchEngine {
    constructor(private db: Database) {}

    /**
     * Search AST nodes based on query intent
     */
    async search(intent: QueryIntent, limit: number = 10): Promise<ASTSearchResult[]> {
        const options: ASTSearchOptions = {
            nodeType: intent.nodeType,
            identifier: intent.identifier,
            language: intent.language,
            fuzzyThreshold: 3,
            limit
        };

        return this.searchWithOptions(options);
    }

    /**
     * Search with specific options
     */
    async searchWithOptions(options: ASTSearchOptions): Promise<ASTSearchResult[]> {
        const results: ASTSearchResult[] = [];

        // Step 1: Exact match search
        if (options.identifier) {
            const exactMatches = this.searchExact(options);
            results.push(...exactMatches);
        }

        // Step 2: Fuzzy match search (if not enough exact matches)
        if (options.identifier && results.length < (options.limit || 10)) {
            const fuzzyMatches = this.searchFuzzy(options);
            results.push(...fuzzyMatches);
        }

        // Step 3: Type-based search (if specified)
        if (options.nodeType && results.length < (options.limit || 10)) {
            const typeMatches = this.searchByType(options);
            results.push(...typeMatches);
        }

        // Remove duplicates and sort by score
        const uniqueResults = this.deduplicateResults(results);
        const sortedResults = uniqueResults.sort((a, b) => b.score - a.score);

        return sortedResults.slice(0, options.limit || 10);
    }

    /**
     * Exact match search for identifiers
     */
    private searchExact(options: ASTSearchOptions): ASTSearchResult[] {
        const results: ASTSearchResult[] = [];

        try {
            let query = 'SELECT * FROM ast_nodes WHERE identifier = ?';
            const params: any[] = [options.identifier];

            if (options.nodeType) {
                query += ' AND node_type = ?';
                params.push(options.nodeType);
            }

            if (options.language) {
                query += ' AND language = ?';
                params.push(options.language);
            }

            query += ' LIMIT ?';
            params.push(options.limit || 10);

            const stmt = this.db.prepare(query);
            stmt.bind(params);

            while (stmt.step()) {
                const row = stmt.getAsObject();
                const node = this.rowToASTNode(row);

                results.push({
                    node,
                    score: 1.0,  // Perfect match
                    matchType: 'exact'
                });
            }

            stmt.free();
        } catch (error) {
            console.error('Error in exact search:', error);
        }

        return results;
    }

    /**
     * Fuzzy match search using Levenshtein distance
     */
    private searchFuzzy(options: ASTSearchOptions): ASTSearchResult[] {
        const results: ASTSearchResult[] = [];

        try {
            // Get all nodes matching the type/language filter
            let query = 'SELECT * FROM ast_nodes WHERE 1=1';
            const params: any[] = [];

            if (options.nodeType) {
                query += ' AND node_type = ?';
                params.push(options.nodeType);
            }

            if (options.language) {
                query += ' AND language = ?';
                params.push(options.language);
            }

            const stmt = this.db.prepare(query);
            stmt.bind(params);

            const threshold = options.fuzzyThreshold || 3;

            while (stmt.step()) {
                const row = stmt.getAsObject();
                const identifier = row.identifier as string;

                // Calculate Levenshtein distance
                const distance = this.levenshteinDistance(
                    options.identifier!.toLowerCase(),
                    identifier.toLowerCase()
                );

                // Only include if within threshold
                if (distance <= threshold && distance > 0) {
                    const node = this.rowToASTNode(row);

                    // Score based on distance (closer = higher score)
                    const score = 0.8 - (distance / 10);

                    results.push({
                        node,
                        score: Math.max(0, score),
                        matchType: 'fuzzy'
                    });
                }
            }

            stmt.free();
        } catch (error) {
            console.error('Error in fuzzy search:', error);
        }

        return results;
    }

    /**
     * Search by node type only
     */
    private searchByType(options: ASTSearchOptions): ASTSearchResult[] {
        const results: ASTSearchResult[] = [];

        try {
            let query = 'SELECT * FROM ast_nodes WHERE node_type = ?';
            const params: any[] = [options.nodeType];

            if (options.language) {
                query += ' AND language = ?';
                params.push(options.language);
            }

            query += ' LIMIT ?';
            params.push(options.limit || 10);

            const stmt = this.db.prepare(query);
            stmt.bind(params);

            while (stmt.step()) {
                const row = stmt.getAsObject();
                const node = this.rowToASTNode(row);

                results.push({
                    node,
                    score: 0.5,  // Lower score for type-only matches
                    matchType: 'partial'
                });
            }

            stmt.free();
        } catch (error) {
            console.error('Error in type search:', error);
        }

        return results;
    }

    /**
     * Search for partial identifier matches
     * Example: "getUser" matches "getUserById", "getUserInfo", etc.
     */
    searchPartial(identifier: string, options: Partial<ASTSearchOptions> = {}): ASTSearchResult[] {
        const results: ASTSearchResult[] = [];

        try {
            let query = 'SELECT * FROM ast_nodes WHERE identifier LIKE ?';
            const params: any[] = [`%${identifier}%`];

            if (options.nodeType) {
                query += ' AND node_type = ?';
                params.push(options.nodeType);
            }

            if (options.language) {
                query += ' AND language = ?';
                params.push(options.language);
            }

            query += ' LIMIT ?';
            params.push(options.limit || 10);

            const stmt = this.db.prepare(query);
            stmt.bind(params);

            while (stmt.step()) {
                const row = stmt.getAsObject();
                const node = this.rowToASTNode(row);
                const nodeIdentifier = row.identifier as string;

                // Calculate partial match score
                let score = 0.6;

                // Boost score if it starts with the search term
                if (nodeIdentifier.toLowerCase().startsWith(identifier.toLowerCase())) {
                    score = 0.75;
                }

                // Boost score if it's a word boundary match
                if (new RegExp(`\\b${identifier}`, 'i').test(nodeIdentifier)) {
                    score = 0.7;
                }

                results.push({
                    node,
                    score,
                    matchType: 'partial'
                });
            }

            stmt.free();
        } catch (error) {
            console.error('Error in partial search:', error);
        }

        return results;
    }

    /**
     * Get child nodes of a parent node
     */
    getChildNodes(parentId: string): ASTNode[] {
        const nodes: ASTNode[] = [];

        try {
            const stmt = this.db.prepare('SELECT * FROM ast_nodes WHERE parent_id = ?');
            stmt.bind([parentId]);

            while (stmt.step()) {
                const row = stmt.getAsObject();
                nodes.push(this.rowToASTNode(row));
            }

            stmt.free();
        } catch (error) {
            console.error('Error getting child nodes:', error);
        }

        return nodes;
    }

    /**
     * Get a specific AST node by ID
     */
    getNodeById(id: string): ASTNode | null {
        try {
            const stmt = this.db.prepare('SELECT * FROM ast_nodes WHERE id = ?');
            stmt.bind([id]);

            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                return this.rowToASTNode(row);
            }

            stmt.free();
        } catch (error) {
            console.error('Error getting node by ID:', error);
        }

        return null;
    }

    /**
     * Calculate Levenshtein distance between two strings
     * (Edit distance - minimum number of single-character edits needed)
     */
    private levenshteinDistance(str1: string, str2: string): number {
        const len1 = str1.length;
        const len2 = str2.length;

        // Create a 2D array for dynamic programming
        const dp: number[][] = Array(len1 + 1)
            .fill(null)
            .map(() => Array(len2 + 1).fill(0));

        // Initialize first row and column
        for (let i = 0; i <= len1; i++) {
            dp[i][0] = i;
        }
        for (let j = 0; j <= len2; j++) {
            dp[0][j] = j;
        }

        // Fill the matrix
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(
                        dp[i - 1][j] + 1,      // Deletion
                        dp[i][j - 1] + 1,      // Insertion
                        dp[i - 1][j - 1] + 1   // Substitution
                    );
                }
            }
        }

        return dp[len1][len2];
    }

    /**
     * Remove duplicate results (same node ID)
     */
    private deduplicateResults(results: ASTSearchResult[]): ASTSearchResult[] {
        const seen = new Map<string, ASTSearchResult>();

        for (const result of results) {
            const existing = seen.get(result.node.id);

            // Keep the result with the higher score
            if (!existing || result.score > existing.score) {
                seen.set(result.node.id, result);
            }
        }

        return Array.from(seen.values());
    }

    /**
     * Convert database row to ASTNode
     */
    private rowToASTNode(row: any): ASTNode {
        return {
            id: row.id as string,
            type: row.node_type as NodeType,
            identifier: row.identifier as string,
            signature: row.signature as string | undefined,
            parameters: row.parameters_json ? JSON.parse(row.parameters_json as string) : undefined,
            returnType: row.return_type as string | undefined,
            modifiers: row.modifiers_json ? JSON.parse(row.modifiers_json as string) : undefined,
            parentId: row.parent_id as string | undefined,
            filePath: row.file_path as string,
            startLine: row.start_line as number,
            endLine: row.end_line as number,
            language: row.language as 'java' | 'typescript' | 'javascript',
            code: row.code as string | undefined
        };
    }
}
