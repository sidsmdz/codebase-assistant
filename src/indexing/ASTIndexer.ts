/**
 * AST Indexer
 * Indexes AST nodes into the database for fast structural search
 */

import { Database } from 'sql.js';
import { ASTNode } from '../parsers/ASTParser';

/**
 * Indexes AST nodes into the database
 */
export class ASTIndexer {
    constructor(private db: Database) {}

    /**
     * Index a single AST node
     */
    async indexNode(node: ASTNode, patternId: string): Promise<void> {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO ast_nodes (
                    id, pattern_id, node_type, identifier, signature,
                    parameters_json, return_type, modifiers_json, parent_id,
                    file_path, start_line, end_line, language, code
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run([
                node.id,
                patternId,
                node.type,
                node.identifier,
                node.signature || null,
                node.parameters ? JSON.stringify(node.parameters) : null,
                node.returnType || null,
                node.modifiers ? JSON.stringify(node.modifiers) : null,
                node.parentId || null,
                node.filePath,
                node.startLine,
                node.endLine,
                node.language,
                node.code || null
            ]);

            stmt.free();
        } catch (error) {
            console.error(`Error indexing AST node ${node.id}:`, error);
            throw error;
        }
    }

    /**
     * Index multiple AST nodes (batch operation)
     */
    async indexNodes(nodes: ASTNode[], patternId: string): Promise<void> {
        for (const node of nodes) {
            await this.indexNode(node, patternId);
        }
    }

    /**
     * Remove AST nodes for a specific pattern
     */
    async removeNodesByPattern(patternId: string): Promise<void> {
        try {
            const stmt = this.db.prepare('DELETE FROM ast_nodes WHERE pattern_id = ?');
            stmt.run([patternId]);
            stmt.free();
        } catch (error) {
            console.error(`Error removing AST nodes for pattern ${patternId}:`, error);
            throw error;
        }
    }

    /**
     * Remove a specific AST node
     */
    async removeNode(nodeId: string): Promise<void> {
        try {
            const stmt = this.db.prepare('DELETE FROM ast_nodes WHERE id = ?');
            stmt.run([nodeId]);
            stmt.free();
        } catch (error) {
            console.error(`Error removing AST node ${nodeId}:`, error);
            throw error;
        }
    }

    /**
     * Get count of indexed AST nodes
     */
    getNodeCount(): number {
        try {
            const stmt = this.db.prepare('SELECT COUNT(*) as count FROM ast_nodes');
            stmt.step();
            const row = stmt.getAsObject();
            stmt.free();
            return row.count as number;
        } catch (error) {
            console.error('Error getting node count:', error);
            return 0;
        }
    }

    /**
     * Get count of nodes by type
     */
    getNodeCountByType(): Map<string, number> {
        const counts = new Map<string, number>();

        try {
            const stmt = this.db.prepare('SELECT node_type, COUNT(*) as count FROM ast_nodes GROUP BY node_type');

            while (stmt.step()) {
                const row = stmt.getAsObject();
                counts.set(row.node_type as string, row.count as number);
            }

            stmt.free();
        } catch (error) {
            console.error('Error getting node counts by type:', error);
        }

        return counts;
    }

    /**
     * Get count of nodes by language
     */
    getNodeCountByLanguage(): Map<string, number> {
        const counts = new Map<string, number>();

        try {
            const stmt = this.db.prepare('SELECT language, COUNT(*) as count FROM ast_nodes GROUP BY language');

            while (stmt.step()) {
                const row = stmt.getAsObject();
                counts.set(row.language as string, row.count as number);
            }

            stmt.free();
        } catch (error) {
            console.error('Error getting node counts by language:', error);
        }

        return counts;
    }

    /**
     * Clear all AST nodes from the index
     */
    async clearIndex(): Promise<void> {
        try {
            const stmt = this.db.prepare('DELETE FROM ast_nodes');
            stmt.run();
            stmt.free();
        } catch (error) {
            console.error('Error clearing AST index:', error);
            throw error;
        }
    }
}
