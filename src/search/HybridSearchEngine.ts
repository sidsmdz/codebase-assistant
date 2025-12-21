/**
 * Hybrid Search Engine
 * Combines AST-based structural search with BM25 text search
 * Provides ranked results using score fusion
 */

import { Database } from 'sql.js';
import { ASTSearchEngine, ASTSearchResult } from './ASTSearchEngine';
import { BM25 } from './BM25';
import { QueryParser, QueryIntent } from './QueryParser';
import { tokenizer } from './Tokenizer';
import { TermIndexer } from '../indexing/TermIndexer';

export interface HybridSearchResult {
    patternId: string;
    score: number;
    astScore: number;
    bm25Score: number;
    matchType: 'exact' | 'fuzzy' | 'semantic' | 'hybrid';
    astNode?: any;
}

export interface HybridSearchOptions {
    astWeight?: number;     // Weight for AST search (default: 0.5)
    bm25Weight?: number;    // Weight for BM25 search (default: 0.3)
    fuzzyWeight?: number;   // Weight for fuzzy matching (default: 0.2)
    limit?: number;         // Maximum number of results (default: 5)
    fieldBoosts?: {         // Field boost factors for BM25
        name?: number;
        code?: number;
        comment?: number;
        description?: number;
    };
}

/**
 * Hybrid search engine combining AST and BM25
 */
export class HybridSearchEngine {
    private astSearch: ASTSearchEngine;
    private bm25: BM25;
    private queryParser: QueryParser;
    private termIndexer: TermIndexer;

    // Default weights
    private defaultOptions: Required<HybridSearchOptions> = {
        astWeight: 0.5,
        bm25Weight: 0.3,
        fuzzyWeight: 0.2,
        limit: 5,
        fieldBoosts: {
            name: 3.0,        // Identifier matches are most important
            code: 1.0,        // Code content baseline
            comment: 1.5,     // Comments/docs moderately important
            description: 1.2  // Descriptions somewhat important
        }
    };

    constructor(private db: Database) {
        this.astSearch = new ASTSearchEngine(db);
        this.bm25 = new BM25({ k1: 1.5, b: 0.75 });
        this.queryParser = new QueryParser();
        this.termIndexer = new TermIndexer(db);
    }

    /**
     * Main search method
     * Combines AST and BM25 search with intelligent score fusion
     */
    async search(query: string, options?: Partial<HybridSearchOptions>): Promise<HybridSearchResult[]> {
        const opts = { ...this.defaultOptions, ...options };

        // Parse query to understand intent
        const intent = this.queryParser.parse(query);

        // Get results from both search methods
        const astResults = await this.performASTSearch(intent, opts.limit * 2);
        const bm25Results = await this.performBM25Search(intent, opts);

        // Merge and rank results
        const mergedResults = this.mergeResults(astResults, bm25Results, opts);

        // Sort by final score and return top-k
        return mergedResults
            .sort((a, b) => b.score - a.score)
            .slice(0, opts.limit);
    }

    /**
     * Perform AST-based structural search
     */
    private async performASTSearch(intent: QueryIntent, limit: number): Promise<Map<string, ASTSearchResult>> {
        const resultsMap = new Map<string, ASTSearchResult>();

        try {
            const astResults = await this.astSearch.search(intent, limit);

            for (const result of astResults) {
                // Get pattern ID from AST node
                const patternId = this.getPatternIdFromNode(result.node.id);
                if (patternId) {
                    resultsMap.set(patternId, result);
                }
            }
        } catch (error) {
            console.error('Error in AST search:', error);
        }

        return resultsMap;
    }

    /**
     * Perform BM25 text search
     */
    private async performBM25Search(
        intent: QueryIntent,
        options: Required<HybridSearchOptions>
    ): Promise<Map<string, number>> {
        const scoresMap = new Map<string, number>();

        try {
            // Tokenize query
            const queryTerms = tokenizer.tokenize(intent.originalQuery, {
                removeStopwords: true,
                minLength: 2,
                splitCamelCase: false
            });

            if (queryTerms.length === 0) {
                return scoresMap;
            }

            // Get all patterns that contain any of the query terms
            const candidatePatterns = this.getCandidatePatterns(queryTerms);

            // Calculate BM25 score for each candidate
            for (const patternId of candidatePatterns) {
                const score = this.calculateBM25Score(queryTerms, patternId, options.fieldBoosts);
                if (score > 0) {
                    scoresMap.set(patternId, score);
                }
            }
        } catch (error) {
            console.error('Error in BM25 search:', error);
        }

        return scoresMap;
    }

    /**
     * Get candidate patterns that contain any query terms
     */
    private getCandidatePatterns(queryTerms: string[]): Set<string> {
        const candidates = new Set<string>();

        for (const term of queryTerms) {
            const patterns = this.termIndexer.getPatternsWithTerm(term);
            patterns.forEach(p => candidates.add(p));
        }

        return candidates;
    }

    /**
     * Calculate BM25 score for a pattern across multiple fields
     */
    private calculateBM25Score(
        queryTerms: string[],
        patternId: string,
        fieldBoosts: { [field: string]: number }
    ): number {
        let totalScore = 0;

        const fields = ['name', 'code', 'comment', 'description'];

        for (const field of fields) {
            const boost = fieldBoosts[field] || 1.0;

            // Get collection stats for this field
            const stats = this.termIndexer.getCollectionStats(field);
            if (!stats || stats.totalDocs === 0) {
                continue;
            }

            // Get document length for this field
            const docLength = this.termIndexer.getDocumentLength(patternId, field);
            if (docLength === 0) {
                continue;
            }

            // Calculate score for each term
            let fieldScore = 0;

            for (const term of queryTerms) {
                const tf = this.termIndexer.getTermFrequency(term, patternId, field);
                const df = this.termIndexer.getDocumentFrequency(term, field);

                if (tf > 0 && df > 0) {
                    const idf = this.bm25.calculateIDF(stats.totalDocs, df);
                    const termScore = this.bm25.scoreTerm(tf, idf, docLength, stats.avgLength);
                    fieldScore += termScore;
                }
            }

            totalScore += fieldScore * boost;
        }

        return totalScore;
    }

    /**
     * Merge AST and BM25 results with score fusion
     */
    private mergeResults(
        astResults: Map<string, ASTSearchResult>,
        bm25Results: Map<string, number>,
        options: Required<HybridSearchOptions>
    ): HybridSearchResult[] {
        const mergedMap = new Map<string, HybridSearchResult>();

        // Normalize scores to 0-1 range
        const maxASTScore = Math.max(...Array.from(astResults.values()).map(r => r.score), 0.001);
        const maxBM25Score = Math.max(...Array.from(bm25Results.values()), 0.001);

        // Add AST results
        for (const [patternId, astResult] of astResults.entries()) {
            const normalizedASTScore = astResult.score / maxASTScore;

            mergedMap.set(patternId, {
                patternId,
                score: normalizedASTScore * options.astWeight,
                astScore: normalizedASTScore,
                bm25Score: 0,
                matchType: astResult.matchType as any,
                astNode: astResult.node
            });
        }

        // Add/merge BM25 results
        for (const [patternId, bm25Score] of bm25Results.entries()) {
            const normalizedBM25Score = bm25Score / maxBM25Score;

            const existing = mergedMap.get(patternId);

            if (existing) {
                // Merge scores
                existing.bm25Score = normalizedBM25Score;
                existing.score += normalizedBM25Score * options.bm25Weight;
                existing.matchType = 'hybrid';
            } else {
                // New result from BM25 only
                mergedMap.set(patternId, {
                    patternId,
                    score: normalizedBM25Score * options.bm25Weight,
                    astScore: 0,
                    bm25Score: normalizedBM25Score,
                    matchType: 'semantic'
                });
            }
        }

        return Array.from(mergedMap.values());
    }

    /**
     * Get pattern ID from AST node ID
     */
    private getPatternIdFromNode(nodeId: string): string | null {
        try {
            const stmt = this.db.prepare('SELECT pattern_id FROM ast_nodes WHERE id = ?');
            stmt.bind([nodeId]);

            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                return row.pattern_id as string;
            }

            stmt.free();
        } catch (error) {
            console.error('Error getting pattern ID from node:', error);
        }

        return null;
    }

    /**
     * Search with custom weights
     */
    async searchWithWeights(
        query: string,
        astWeight: number,
        bm25Weight: number,
        fuzzyWeight: number,
        limit: number = 5
    ): Promise<HybridSearchResult[]> {
        return this.search(query, {
            astWeight,
            bm25Weight,
            fuzzyWeight,
            limit
        });
    }

    /**
     * Search with custom field boosts
     */
    async searchWithFieldBoosts(
        query: string,
        fieldBoosts: { [field: string]: number },
        limit: number = 5
    ): Promise<HybridSearchResult[]> {
        return this.search(query, {
            fieldBoosts,
            limit
        });
    }

    /**
     * Explain search results (for debugging)
     * Shows how scores were calculated
     */
    async explainSearch(query: string, limit: number = 3): Promise<any[]> {
        const results = await this.search(query, { limit });

        return results.map(result => ({
            patternId: result.patternId,
            totalScore: result.score.toFixed(3),
            breakdown: {
                astScore: result.astScore.toFixed(3),
                bm25Score: result.bm25Score.toFixed(3)
            },
            matchType: result.matchType,
            hasASTMatch: result.astScore > 0,
            hasBM25Match: result.bm25Score > 0
        }));
    }
}
