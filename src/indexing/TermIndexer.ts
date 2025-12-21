/**
 * Term Indexer for BM25
 * Indexes terms from code patterns for BM25-based search
 */

import { Database } from 'sql.js';
import { tokenizer } from '../search/Tokenizer';

export interface IndexableDocument {
    patternId: string;
    fields: {
        name?: string;        // Pattern/function/class name
        code?: string;        // Code content
        comment?: string;     // Comments/documentation
        description?: string; // Pattern description
    };
}

/**
 * Indexes terms for BM25 search
 */
export class TermIndexer {
    constructor(private db: Database) {}

    /**
     * Index a document's terms
     */
    async indexDocument(doc: IndexableDocument): Promise<void> {
        // Index each field separately
        for (const [field, content] of Object.entries(doc.fields)) {
            if (content) {
                await this.indexField(doc.patternId, field, content);
            }
        }

        // Update document statistics
        await this.updateDocStats(doc);
    }

    /**
     * Index terms from a specific field
     */
    private async indexField(patternId: string, field: string, content: string): Promise<void> {
        // Tokenize the content
        const termFreqs = tokenizer.calculateTermFrequency(content, {
            removeStopwords: true,
            minLength: 2,
            splitCamelCase: false
        });

        // For identifiers, also tokenize camelCase
        if (field === 'name') {
            const camelTokens = tokenizer.tokenizeIdentifier(content, {
                removeStopwords: true,
                minLength: 2
            });

            for (const token of camelTokens) {
                termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
            }
        }

        // Insert terms into index
        for (const [term, frequency] of termFreqs.entries()) {
            try {
                const stmt = this.db.prepare(`
                    INSERT OR REPLACE INTO term_index (term, pattern_id, field, frequency)
                    VALUES (?, ?, ?, ?)
                `);

                stmt.run([term, patternId, field, frequency]);
                stmt.free();
            } catch (error) {
                console.error(`Error indexing term "${term}":`, error);
            }
        }
    }

    /**
     * Update document statistics for a pattern
     */
    private async updateDocStats(doc: IndexableDocument): Promise<void> {
        const fieldLengths: any = {
            name_length: 0,
            code_length: 0,
            comment_length: 0,
            description_length: 0
        };

        let totalTerms = 0;

        if (doc.fields.name) {
            const tokens = tokenizer.tokenize(doc.fields.name);
            fieldLengths.name_length = tokens.length;
            totalTerms += tokens.length;
        }

        if (doc.fields.code) {
            const tokens = tokenizer.tokenize(doc.fields.code);
            fieldLengths.code_length = tokens.length;
            totalTerms += tokens.length;
        }

        if (doc.fields.comment) {
            const tokens = tokenizer.tokenize(doc.fields.comment);
            fieldLengths.comment_length = tokens.length;
            totalTerms += tokens.length;
        }

        if (doc.fields.description) {
            const tokens = tokenizer.tokenize(doc.fields.description);
            fieldLengths.description_length = tokens.length;
            totalTerms += tokens.length;
        }

        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO doc_stats (
                    pattern_id, name_length, code_length, comment_length, description_length, total_terms
                ) VALUES (?, ?, ?, ?, ?, ?)
            `);

            stmt.run([
                doc.patternId,
                fieldLengths.name_length,
                fieldLengths.code_length,
                fieldLengths.comment_length,
                fieldLengths.description_length,
                totalTerms
            ]);

            stmt.free();
        } catch (error) {
            console.error(`Error updating doc stats for ${doc.patternId}:`, error);
        }
    }

    /**
     * Update collection statistics (should be called after indexing all documents)
     */
    async updateCollectionStats(): Promise<void> {
        const fields = ['name', 'code', 'comment', 'description'];

        for (const field of fields) {
            try {
                // Get total docs and average length for this field
                const statsStmt = this.db.prepare(`
                    SELECT COUNT(*) as total_docs, AVG(${field}_length) as avg_length
                    FROM doc_stats
                    WHERE ${field}_length > 0
                `);

                statsStmt.step();
                const stats = statsStmt.getAsObject();
                statsStmt.free();

                const totalDocs = (stats.total_docs as number) || 0;
                const avgLength = (stats.avg_length as number) || 0;

                // Get total terms for this field
                const termsStmt = this.db.prepare(`
                    SELECT SUM(frequency) as total_terms
                    FROM term_index
                    WHERE field = ?
                `);

                termsStmt.bind([field]);
                termsStmt.step();
                const termsRow = termsStmt.getAsObject();
                termsStmt.free();

                const totalTerms = (termsRow.total_terms as number) || 0;

                // Update collection stats
                const updateStmt = this.db.prepare(`
                    INSERT OR REPLACE INTO collection_stats (field, total_docs, avg_length, total_terms)
                    VALUES (?, ?, ?, ?)
                `);

                updateStmt.run([field, totalDocs, avgLength, totalTerms]);
                updateStmt.free();
            } catch (error) {
                console.error(`Error updating collection stats for field ${field}:`, error);
            }
        }
    }

    /**
     * Get collection statistics for a field
     */
    getCollectionStats(field: string): { totalDocs: number; avgLength: number; totalTerms: number } | null {
        try {
            const stmt = this.db.prepare(`
                SELECT total_docs, avg_length, total_terms
                FROM collection_stats
                WHERE field = ?
            `);

            stmt.bind([field]);

            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();

                return {
                    totalDocs: row.total_docs as number,
                    avgLength: row.avg_length as number,
                    totalTerms: row.total_terms as number
                };
            }

            stmt.free();
        } catch (error) {
            console.error(`Error getting collection stats for field ${field}:`, error);
        }

        return null;
    }

    /**
     * Get document frequency for a term in a field
     */
    getDocumentFrequency(term: string, field: string): number {
        try {
            const stmt = this.db.prepare(`
                SELECT COUNT(DISTINCT pattern_id) as df
                FROM term_index
                WHERE term = ? AND field = ?
            `);

            stmt.bind([term, field]);
            stmt.step();
            const row = stmt.getAsObject();
            stmt.free();

            return row.df as number;
        } catch (error) {
            console.error(`Error getting document frequency for term "${term}":`, error);
            return 0;
        }
    }

    /**
     * Get term frequency for a term in a specific document and field
     */
    getTermFrequency(term: string, patternId: string, field: string): number {
        try {
            const stmt = this.db.prepare(`
                SELECT frequency
                FROM term_index
                WHERE term = ? AND pattern_id = ? AND field = ?
            `);

            stmt.bind([term, patternId, field]);

            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                return row.frequency as number;
            }

            stmt.free();
        } catch (error) {
            console.error(`Error getting term frequency:`, error);
        }

        return 0;
    }

    /**
     * Get document length for a specific field
     */
    getDocumentLength(patternId: string, field: string): number {
        try {
            const fieldColumn = `${field}_length`;
            const stmt = this.db.prepare(`
                SELECT ${fieldColumn} as length
                FROM doc_stats
                WHERE pattern_id = ?
            `);

            stmt.bind([patternId]);

            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                return row.length as number;
            }

            stmt.free();
        } catch (error) {
            console.error(`Error getting document length:`, error);
        }

        return 0;
    }

    /**
     * Get all patterns that contain a specific term
     */
    getPatternsWithTerm(term: string, field?: string): string[] {
        const patternIds: string[] = [];

        try {
            let query = 'SELECT DISTINCT pattern_id FROM term_index WHERE term = ?';
            const params: any[] = [term];

            if (field) {
                query += ' AND field = ?';
                params.push(field);
            }

            const stmt = this.db.prepare(query);
            stmt.bind(params);

            while (stmt.step()) {
                const row = stmt.getAsObject();
                patternIds.push(row.pattern_id as string);
            }

            stmt.free();
        } catch (error) {
            console.error(`Error getting patterns with term "${term}":`, error);
        }

        return patternIds;
    }

    /**
     * Remove terms for a specific pattern
     */
    async removeTermsByPattern(patternId: string): Promise<void> {
        try {
            // Remove from term index
            const termStmt = this.db.prepare('DELETE FROM term_index WHERE pattern_id = ?');
            termStmt.run([patternId]);
            termStmt.free();

            // Remove from doc stats
            const statsStmt = this.db.prepare('DELETE FROM doc_stats WHERE pattern_id = ?');
            statsStmt.run([patternId]);
            statsStmt.free();
        } catch (error) {
            console.error(`Error removing terms for pattern ${patternId}:`, error);
            throw error;
        }
    }

    /**
     * Clear all terms from the index
     */
    async clearIndex(): Promise<void> {
        try {
            const stmt1 = this.db.prepare('DELETE FROM term_index');
            stmt1.run();
            stmt1.free();

            const stmt2 = this.db.prepare('DELETE FROM doc_stats');
            stmt2.run();
            stmt2.free();

            const stmt3 = this.db.prepare('DELETE FROM collection_stats');
            stmt3.run();
            stmt3.free();
        } catch (error) {
            console.error('Error clearing term index:', error);
            throw error;
        }
    }

    /**
     * Get index statistics
     */
    getIndexStats(): {
        totalTerms: number;
        uniqueTerms: number;
        totalDocuments: number;
    } {
        try {
            // Get total term occurrences
            const totalStmt = this.db.prepare('SELECT SUM(frequency) as total FROM term_index');
            totalStmt.step();
            const totalRow = totalStmt.getAsObject();
            totalStmt.free();

            // Get unique terms
            const uniqueStmt = this.db.prepare('SELECT COUNT(DISTINCT term) as unique FROM term_index');
            uniqueStmt.step();
            const uniqueRow = uniqueStmt.getAsObject();
            uniqueStmt.free();

            // Get total documents
            const docsStmt = this.db.prepare('SELECT COUNT(*) as count FROM doc_stats');
            docsStmt.step();
            const docsRow = docsStmt.getAsObject();
            docsStmt.free();

            return {
                totalTerms: (totalRow.total as number) || 0,
                uniqueTerms: (uniqueRow.unique as number) || 0,
                totalDocuments: (docsRow.count as number) || 0
            };
        } catch (error) {
            console.error('Error getting index stats:', error);
            return { totalTerms: 0, uniqueTerms: 0, totalDocuments: 0 };
        }
    }
}
