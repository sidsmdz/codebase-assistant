/**
 * RelationshipIndexer - Indexes entity relationships and builds knowledge graph
 * 
 * This class captures relationships between code entities:
 * - Method calls (CALLS)
 * - Type usage (USES, RETURNS, PARAMETER)
 * - Class hierarchy (EXTENDS, IMPLEMENTS)
 * - Data flow (DEFINES, USES_VARIABLE)
 * - Dependencies (DEPENDS_ON, IMPORTS)
 */

import { Database } from 'sql.js';
import { ASTNode } from '../parsers/ASTParser';

export type RelationshipType = 
    | 'CALLS'           // Method A calls method B
    | 'USES'            // Entity A uses type B
    | 'IMPLEMENTS'      // Class A implements interface B
    | 'EXTENDS'         // Class A extends class B
    | 'CONTAINS'        // Class A contains method B
    | 'RETURNS'         // Method A returns type B
    | 'PARAMETER'       // Method A has parameter of type B
    | 'FIELD'           // Class A has field of type B
    | 'IMPORTS'         // File A imports module B
    | 'DEPENDS_ON';     // Entity A depends on entity B

export type CallType = 'direct' | 'virtual' | 'interface' | 'constructor' | 'static';
export type FlowType = 'parameter' | 'return' | 'assignment' | 'field_access' | 'argument';

export interface EntityRelationship {
    sourceEntityId: string;      // e.g., "PaymentService.processPayment"
    targetEntityId: string;      // e.g., "PaymentGateway.createTransaction"
    relationshipType: RelationshipType;
    context?: string;            // Additional context (e.g., "parameter 0")
    filePath: string;
    lineNumber: number;
}

export interface MethodCall {
    callerId: string;            // Method making the call
    calleeId: string;            // Method being called
    calleeIdentifier: string;    // Method name (for partial matching)
    calleeClass?: string;        // Class name if known
    callType: CallType;
    filePath: string;
    lineNumber: number;
}

export interface DataFlowNode {
    variableName: string;
    variableType: string;
    sourceLocation: string;      // Where variable is defined (method:line)
    usageLocation: string;       // Where variable is used (method:line)
    flowType: FlowType;
    methodId: string;
    lineNumber: number;
}

export interface TypeRelationship {
    childType: string;           // e.g., "PaymentService"
    parentType: string;          // e.g., "IPaymentService"
    hierarchyType: 'EXTENDS' | 'IMPLEMENTS';
    filePath: string;
}

/**
 * Indexes relationships between code entities
 */
export class RelationshipIndexer {
    constructor(private db: Database) {}

    /**
     * Initialize relationship tables
     */
    initializeTables(): void {
        // Entity relationships table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS entity_relationships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_entity_id TEXT NOT NULL,
                target_entity_id TEXT NOT NULL,
                relationship_type TEXT NOT NULL,
                context TEXT,
                file_path TEXT,
                line_number INTEGER,
                indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        this.db.run(`CREATE INDEX IF NOT EXISTS idx_rel_source 
            ON entity_relationships(source_entity_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_rel_target 
            ON entity_relationships(target_entity_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_rel_type 
            ON entity_relationships(relationship_type)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_rel_source_type 
            ON entity_relationships(source_entity_id, relationship_type)`);

        // Call graph table (optimized for traversal)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS call_graph (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                caller_id TEXT NOT NULL,
                callee_id TEXT,
                callee_identifier TEXT NOT NULL,
                callee_class TEXT,
                call_type TEXT NOT NULL,
                file_path TEXT,
                line_number INTEGER,
                indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        this.db.run(`CREATE INDEX IF NOT EXISTS idx_call_caller 
            ON call_graph(caller_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_call_callee 
            ON call_graph(callee_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_call_identifier 
            ON call_graph(callee_identifier)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_call_class 
            ON call_graph(callee_class)`);

        // Data flow table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS data_flow (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                variable_name TEXT NOT NULL,
                variable_type TEXT,
                source_location TEXT NOT NULL,
                usage_location TEXT NOT NULL,
                flow_type TEXT NOT NULL,
                method_id TEXT,
                line_number INTEGER,
                indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        this.db.run(`CREATE INDEX IF NOT EXISTS idx_flow_variable 
            ON data_flow(variable_name)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_flow_type 
            ON data_flow(variable_type)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_flow_method 
            ON data_flow(method_id)`);

        // Type hierarchy table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS type_hierarchy (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                child_type TEXT NOT NULL,
                parent_type TEXT NOT NULL,
                hierarchy_type TEXT NOT NULL,
                file_path TEXT,
                indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        this.db.run(`CREATE INDEX IF NOT EXISTS idx_type_child 
            ON type_hierarchy(child_type)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_type_parent 
            ON type_hierarchy(parent_type)`);
    }

    /**
     * Index a generic entity relationship
     */
    indexRelationship(rel: EntityRelationship): void {
        const stmt = this.db.prepare(`
            INSERT INTO entity_relationships (
                source_entity_id, target_entity_id, relationship_type,
                context, file_path, line_number
            ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run([
            rel.sourceEntityId,
            rel.targetEntityId,
            rel.relationshipType,
            rel.context || null,
            rel.filePath,
            rel.lineNumber
        ]);

        stmt.free();
    }

    /**
     * Index a method call
     */
    indexMethodCall(call: MethodCall): void {
        const stmt = this.db.prepare(`
            INSERT INTO call_graph (
                caller_id, callee_id, callee_identifier, callee_class,
                call_type, file_path, line_number
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run([
            call.callerId,
            call.calleeId || null,
            call.calleeIdentifier,
            call.calleeClass || null,
            call.callType,
            call.filePath,
            call.lineNumber
        ]);

        stmt.free();
    }

    /**
     * Index data flow
     */
    indexDataFlow(flow: DataFlowNode): void {
        const stmt = this.db.prepare(`
            INSERT INTO data_flow (
                variable_name, variable_type, source_location, usage_location,
                flow_type, method_id, line_number
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run([
            flow.variableName,
            flow.variableType,
            flow.sourceLocation,
            flow.usageLocation,
            flow.flowType,
            flow.methodId,
            flow.lineNumber
        ]);

        stmt.free();
    }

    /**
     * Index type hierarchy relationship
     */
    indexTypeHierarchy(rel: TypeRelationship): void {
        const stmt = this.db.prepare(`
            INSERT INTO type_hierarchy (
                child_type, parent_type, hierarchy_type, file_path
            ) VALUES (?, ?, ?, ?)
        `);

        stmt.run([
            rel.childType,
            rel.parentType,
            rel.hierarchyType,
            rel.filePath
        ]);

        stmt.free();
    }

    /**
     * Clear all relationships for a specific file (for re-indexing)
     */
    clearRelationshipsForFile(filePath: string): void {
        this.db.run('DELETE FROM entity_relationships WHERE file_path = ?', [filePath]);
        this.db.run('DELETE FROM call_graph WHERE file_path = ?', [filePath]);
        this.db.run('DELETE FROM data_flow WHERE file_path = ?', [filePath]);
        this.db.run('DELETE FROM type_hierarchy WHERE file_path = ?', [filePath]);
    }

    /**
     * Get statistics about indexed relationships
     */
    getStats(): {
        relationships: number;
        calls: number;
        dataFlows: number;
        typeHierarchies: number;
    } {
        const relCount = this.db.exec('SELECT COUNT(*) as count FROM entity_relationships')[0]?.values[0]?.[0] || 0;
        const callCount = this.db.exec('SELECT COUNT(*) as count FROM call_graph')[0]?.values[0]?.[0] || 0;
        const flowCount = this.db.exec('SELECT COUNT(*) as count FROM data_flow')[0]?.values[0]?.[0] || 0;
        const typeCount = this.db.exec('SELECT COUNT(*) as count FROM type_hierarchy')[0]?.values[0]?.[0] || 0;

        return {
            relationships: relCount as number,
            calls: callCount as number,
            dataFlows: flowCount as number,
            typeHierarchies: typeCount as number
        };
    }
}
