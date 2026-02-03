/**
 * RelationshipSearch - Query and traverse the relationship graph
 * 
 * Provides graph search capabilities:
 * - Find callers/callees (call graph traversal)
 * - Find type implementations/extensions (type hierarchy)
 * - Trace data flow (variable usage tracking)
 * - Find transitive dependencies
 * - Calculate shortest paths between entities
 */

import { Database } from 'sql.js';
import { ASTNode } from '../parsers/ASTParser';

export interface RelatedEntity {
    id: string;
    identifier: string;
    type: string;
    relationshipType: string;
    relationshipContext?: string;
    filePath: string;
    lineNumber: number;
    distance?: number;  // Hops from source entity
}

export interface CallPath {
    path: string[];      // Array of entity IDs forming the path
    depth: number;
    pathDescription: string[];  // Human-readable path
}

export interface DataFlowPath {
    variable: string;
    type: string;
    flow: Array<{
        location: string;
        context: string;
        lineNumber: number;
    }>;
}

export interface SearchWithRelationshipsResult {
    directMatches: ASTNode[];
    callers: RelatedEntity[];
    callees: RelatedEntity[];
    usedTypes: RelatedEntity[];
    implementations: RelatedEntity[];
    dataFlows: DataFlowPath[];
    totalRelatedCount: number;
}

/**
 * Search and traverse the relationship graph
 */
export class RelationshipSearch {
    constructor(private db: Database) {}

    /**
     * Find all methods that call a specific entity
     * @param entityId Entity to find callers for
     * @param maxDepth Maximum depth to traverse (default: 3)
     */
    findCallers(entityId: string, maxDepth: number = 3): RelatedEntity[] {
        const result = this.db.exec(`
            SELECT 
                cg.caller_id as id,
                an.identifier,
                an.node_type as type,
                'CALLS' as relationshipType,
                cg.file_path as filePath,
                cg.line_number as lineNumber
            FROM call_graph cg
            LEFT JOIN ast_nodes an ON cg.caller_id = an.id
            WHERE cg.callee_id = ?
            ORDER BY cg.file_path, cg.line_number
        `, [entityId]);

        if (!result[0]) {return [];}

        return result[0].values.map(row => ({
            id: row[0] as string,
            identifier: row[1] as string,
            type: row[2] as string,
            relationshipType: row[3] as string,
            filePath: row[4] as string,
            lineNumber: row[5] as number,
            distance: 1
        }));
    }

    /**
     * Find all methods called by a specific entity
     * @param entityId Entity to find callees for
     */
    findCallees(entityId: string): RelatedEntity[] {
        const result = this.db.exec(`
            SELECT 
                cg.callee_id as id,
                COALESCE(an.identifier, cg.callee_identifier) as identifier,
                COALESCE(an.node_type, 'METHOD') as type,
                'CALLS' as relationshipType,
                cg.file_path as filePath,
                cg.line_number as lineNumber
            FROM call_graph cg
            LEFT JOIN ast_nodes an ON cg.callee_id = an.id
            WHERE cg.caller_id = ?
            ORDER BY cg.line_number
        `, [entityId]);

        if (!result[0]) {return [];}

        return result[0].values.map(row => ({
            id: row[0] as string,
            identifier: row[1] as string,
            type: row[2] as string,
            relationshipType: row[3] as string,
            filePath: row[4] as string,
            lineNumber: row[5] as number,
            distance: 1
        }));
    }

    /**
     * Find all transitive callers (methods that eventually call this)
     * Uses BFS to find all callers up to maxDepth
     */
    findTransitiveCallers(entityId: string, maxDepth: number = 5): RelatedEntity[] {
        const allCallers = new Map<string, RelatedEntity>();
        const queue: Array<{id: string, depth: number}> = [{id: entityId, depth: 0}];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current.depth >= maxDepth || visited.has(current.id)) {
                continue;
            }
            visited.add(current.id);

            const callers = this.findCallers(current.id);
            for (const caller of callers) {
                if (!allCallers.has(caller.id)) {
                    allCallers.set(caller.id, {
                        ...caller,
                        distance: current.depth + 1
                    });
                    queue.push({id: caller.id, depth: current.depth + 1});
                }
            }
        }

        return Array.from(allCallers.values());
    }

    /**
     * Find all transitive callees (methods eventually called by this)
     */
    findTransitiveCallees(entityId: string, maxDepth: number = 5): RelatedEntity[] {
        const allCallees = new Map<string, RelatedEntity>();
        const queue: Array<{id: string, depth: number}> = [{id: entityId, depth: 0}];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current.depth >= maxDepth || visited.has(current.id)) {
                continue;
            }
            visited.add(current.id);

            const callees = this.findCallees(current.id);
            for (const callee of callees) {
                if (callee.id && !allCallees.has(callee.id)) {
                    allCallees.set(callee.id, {
                        ...callee,
                        distance: current.depth + 1
                    });
                    queue.push({id: callee.id, depth: current.depth + 1});
                }
            }
        }

        return Array.from(allCallees.values());
    }

    /**
     * Find shortest path between two entities
     */
    findPathBetween(sourceId: string, targetId: string, maxDepth: number = 10): CallPath | null {
        const queue: Array<{id: string, path: string[], pathDesc: string[]}> = [
            {id: sourceId, path: [sourceId], pathDesc: [this.getEntityName(sourceId)]}
        ];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const current = queue.shift()!;
            
            if (current.path.length > maxDepth) {
                continue;
            }

            if (current.id === targetId) {
                return {
                    path: current.path,
                    depth: current.path.length - 1,
                    pathDescription: current.pathDesc
                };
            }

            if (visited.has(current.id)) {
                continue;
            }
            visited.add(current.id);

            const callees = this.findCallees(current.id);
            for (const callee of callees) {
                if (callee.id && !visited.has(callee.id)) {
                    queue.push({
                        id: callee.id,
                        path: [...current.path, callee.id],
                        pathDesc: [...current.pathDesc, callee.identifier]
                    });
                }
            }
        }

        return null;  // No path found
    }

    /**
     * Find types used by an entity (parameters, returns, fields)
     */
    findUsedTypes(entityId: string): RelatedEntity[] {
        const result = this.db.exec(`
            SELECT 
                er.target_entity_id as id,
                an.identifier,
                an.node_type as type,
                er.relationship_type as relationshipType,
                er.context as relationshipContext,
                er.file_path as filePath,
                er.line_number as lineNumber
            FROM entity_relationships er
            LEFT JOIN ast_nodes an ON er.target_entity_id = an.id
            WHERE er.source_entity_id = ? 
            AND er.relationship_type IN ('USES', 'RETURNS', 'PARAMETER', 'FIELD')
            ORDER BY er.relationship_type, er.line_number
        `, [entityId]);

        if (!result[0]) {return [];}

        return result[0].values.map(row => ({
            id: row[0] as string,
            identifier: row[1] as string,
            type: row[2] as string,
            relationshipType: row[3] as string,
            relationshipContext: row[4] as string,
            filePath: row[5] as string,
            lineNumber: row[6] as number,
            distance: 1
        }));
    }

    /**
     * Find implementations of an interface or subclasses of a class
     */
    findImplementations(typeId: string): RelatedEntity[] {
        const result = this.db.exec(`
            SELECT 
                th.child_type as id,
                th.child_type as identifier,
                'CLASS' as type,
                th.hierarchy_type as relationshipType,
                th.file_path as filePath,
                0 as lineNumber
            FROM type_hierarchy th
            WHERE th.parent_type = ?
            ORDER BY th.child_type
        `, [typeId]);

        if (!result[0]) {return [];}

        return result[0].values.map(row => ({
            id: row[0] as string,
            identifier: row[1] as string,
            type: row[2] as string,
            relationshipType: row[3] as string,
            filePath: row[4] as string,
            lineNumber: row[5] as number,
            distance: 1
        }));
    }

    /**
     * Find parent classes/interfaces
     */
    findParents(typeId: string): RelatedEntity[] {
        const result = this.db.exec(`
            SELECT 
                th.parent_type as id,
                th.parent_type as identifier,
                'INTERFACE' as type,
                th.hierarchy_type as relationshipType,
                th.file_path as filePath,
                0 as lineNumber
            FROM type_hierarchy th
            WHERE th.child_type = ?
            ORDER BY th.parent_type
        `, [typeId]);

        if (!result[0]) {return [];}

        return result[0].values.map(row => ({
            id: row[0] as string,
            identifier: row[1] as string,
            type: row[2] as string,
            relationshipType: row[3] as string,
            filePath: row[4] as string,
            lineNumber: row[5] as number,
            distance: 1
        }));
    }

    /**
     * Trace data flow for a variable type
     */
    traceDataFlow(variableType: string, methodId?: string): DataFlowPath[] {
        let query = `
            SELECT 
                variable_name,
                variable_type,
                source_location,
                usage_location,
                flow_type,
                line_number
            FROM data_flow
            WHERE variable_type = ?
        `;
        const params: any[] = [variableType];

        if (methodId) {
            query += ' AND method_id = ?';
            params.push(methodId);
        }

        query += ' ORDER BY method_id, line_number';

        const result = this.db.exec(query, params);

        if (!result[0]) {return [];}

        const flowsByVariable = new Map<string, DataFlowPath>();

        for (const row of result[0].values) {
            const varName = row[0] as string;
            const varType = row[1] as string;
            const sourceLoc = row[2] as string;
            const usageLoc = row[3] as string;
            const flowType = row[4] as string;
            const lineNum = row[5] as number;

            if (!flowsByVariable.has(varName)) {
                flowsByVariable.set(varName, {
                    variable: varName,
                    type: varType,
                    flow: []
                });
            }

            flowsByVariable.get(varName)!.flow.push({
                location: usageLoc,
                context: flowType,
                lineNumber: lineNum
            });
        }

        return Array.from(flowsByVariable.values());
    }

    /**
     * Search with full relationship context
     * Given a query, find matching entities and all their relationships
     */
    searchWithRelationships(entityIds: string[]): SearchWithRelationshipsResult {
        const allCallers: RelatedEntity[] = [];
        const allCallees: RelatedEntity[] = [];
        const allUsedTypes: RelatedEntity[] = [];
        const allImplementations: RelatedEntity[] = [];
        const allDataFlows: DataFlowPath[] = [];

        for (const entityId of entityIds) {
            // Find callers
            const callers = this.findCallers(entityId);
            allCallers.push(...callers);

            // Find callees
            const callees = this.findCallees(entityId);
            allCallees.push(...callees);

            // Find used types
            const usedTypes = this.findUsedTypes(entityId);
            allUsedTypes.push(...usedTypes);

            // Find implementations (if this is an interface/class)
            const implementations = this.findImplementations(entityId);
            allImplementations.push(...implementations);

            // Find data flows
            const dataFlows = this.traceDataFlow('', entityId);
            allDataFlows.push(...dataFlows);
        }

        const totalRelated = allCallers.length + allCallees.length + 
                            allUsedTypes.length + allImplementations.length;

        return {
            directMatches: [],  // Filled by caller
            callers: this.deduplicate(allCallers),
            callees: this.deduplicate(allCallees),
            usedTypes: this.deduplicate(allUsedTypes),
            implementations: this.deduplicate(allImplementations),
            dataFlows: allDataFlows,
            totalRelatedCount: totalRelated
        };
    }

    /**
     * Helper: Get entity name by ID
     */
    private getEntityName(entityId: string): string {
        const result = this.db.exec(
            'SELECT identifier FROM ast_nodes WHERE id = ?',
            [entityId]
        );
        return result[0]?.values[0]?.[0] as string || entityId;
    }

    /**
     * Helper: Deduplicate related entities by ID
     */
    private deduplicate(entities: RelatedEntity[]): RelatedEntity[] {
        const map = new Map<string, RelatedEntity>();
        for (const entity of entities) {
            if (!map.has(entity.id)) {
                map.set(entity.id, entity);
            }
        }
        return Array.from(map.values());
    }
}
