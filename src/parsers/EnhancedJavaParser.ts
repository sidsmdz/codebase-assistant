/**
 * Enhanced Java AST Parser - Extracts relationships
 * 
 * Extracts not just entities, but their relationships:
 * - Method calls (CALLS)
 * - Type usage (USES, PARAMETERS, RETURNS)
 * - Class hierarchy (EXTENDS, IMPLEMENTS)
 * - Data flow (variable definitions and usages)
 */

import { ASTNode, Parameter } from './ASTParser';
import { MethodCall, DataFlowNode, TypeRelationship } from '../indexing/RelationshipIndexer';

export interface EnhancedParseResult {
    nodes: ASTNode[];
    relationships: {
        methodCalls: MethodCall[];
        dataFlows: DataFlowNode[];
        typeHierarchies: TypeRelationship[];
    };
}

/**
 * Enhanced Java parser with relationship extraction
 */
export class EnhancedJavaParser {
    
    /**
     * Parse Java source and extract entities + relationships
     */
    parse(code: string, filePath: string): EnhancedParseResult {
        const nodes: ASTNode[] = [];
        const methodCalls: MethodCall[] = [];
        const dataFlows: DataFlowNode[] = [];
        const typeHierarchies: TypeRelationship[] = [];

        // Step 1: Extract classes and interfaces
        const classMatches = this.extractClasses(code, filePath);
        for (const classInfo of classMatches) {
            nodes.push(classInfo.node);
            
            // Extract type hierarchy
            if (classInfo.extends) {
                typeHierarchies.push({
                    childType: classInfo.node.identifier,
                    parentType: classInfo.extends,
                    hierarchyType: 'EXTENDS',
                    filePath
                });
            }
            
            if (classInfo.implements) {
                for (const iface of classInfo.implements) {
                    typeHierarchies.push({
                        childType: classInfo.node.identifier,
                        parentType: iface,
                        hierarchyType: 'IMPLEMENTS',
                        filePath
                    });
                }
            }
        }

        // Step 2: Extract methods and their calls
        const methodMatches = this.extractMethods(code, filePath);
        for (const methodInfo of methodMatches) {
            nodes.push(methodInfo.node);
            
            // Extract method calls within this method
            const calls = this.extractMethodCallsFromBody(
                methodInfo.body,
                methodInfo.node.id,
                filePath,
                methodInfo.node.startLine
            );
            methodCalls.push(...calls);
            
            // Extract data flows
            const flows = this.extractDataFlowFromMethod(
                methodInfo.body,
                methodInfo.node.id,
                methodInfo.node.parameters || [],
                filePath,
                methodInfo.node.startLine
            );
            dataFlows.push(...flows);
        }

        return {
            nodes,
            relationships: {
                methodCalls,
                dataFlows,
                typeHierarchies
            }
        };
    }

    /**
     * Extract classes with extends/implements info
     */
    private extractClasses(code: string, filePath: string): Array<{
        node: ASTNode;
        extends?: string;
        implements?: string[];
    }> {
        const results: Array<{node: ASTNode; extends?: string; implements?: string[]}> = [];
        
        // Match: public class ClassName extends ParentClass implements Interface1, Interface2 {
        const classRegex = /(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?class\s+(\w+)(?:\s+extends\s+([\w.]+))?(?:\s+implements\s+([\w\s,.<>]+))?\s*\{/g;
        
        let match;
        const lines = code.split('\n');
        
        while ((match = classRegex.exec(code)) !== null) {
            const className = match[1];
            const extendsClass = match[2];
            const implementsStr = match[3];
            
            const lineNumber = this.getLineNumber(code, match.index);
            const endLine = this.findClosingBrace(code, match.index, lines);
            
            const node: ASTNode = {
                id: this.generateId(filePath, className, lineNumber),
                type: 'CLASS',
                identifier: className,
                signature: match[0].trim(),
                modifiers: this.extractModifiers(match[0]),
                filePath,
                startLine: lineNumber,
                endLine,
                language: 'java'
            };
            
            results.push({
                node,
                extends: extendsClass,
                implements: implementsStr ? implementsStr.split(',').map(s => s.trim()) : undefined
            });
        }
        
        return results;
    }

    /**
     * Extract methods with their body content
     */
    private extractMethods(code: string, filePath: string): Array<{
        node: ASTNode;
        body: string;
    }> {
        const results: Array<{node: ASTNode; body: string}> = [];
        
        // Match: public ReturnType methodName(ParamType param) {
        const methodRegex = /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?([\w<>[\].,\s]+)\s+(\w+)\s*\((.*?)\)\s*(?:throws\s+[\w\s,]+)?\s*\{/g;
        
        let match;
        const lines = code.split('\n');
        
        while ((match = methodRegex.exec(code)) !== null) {
            const returnType = match[1].trim();
            const methodName = match[2];
            const paramsStr = match[3];
            
            // Skip constructors (return type matches class name)
            if (returnType.split(/\s+/).pop() === methodName) {
                continue;
            }
            
            const lineNumber = this.getLineNumber(code, match.index);
            const endLine = this.findClosingBrace(code, match.index, lines);
            
            // Extract method body
            const bodyStart = match.index + match[0].length;
            const bodyEnd = this.findClosingBraceIndex(code, match.index);
            const body = code.substring(bodyStart, bodyEnd);
            
            const parameters = this.parseParameters(paramsStr);
            
            const node: ASTNode = {
                id: this.generateId(filePath, methodName, lineNumber),
                type: 'METHOD',
                identifier: methodName,
                signature: match[0].trim(),
                parameters,
                returnType,
                modifiers: this.extractModifiers(match[0]),
                filePath,
                startLine: lineNumber,
                endLine,
                language: 'java'
            };
            
            results.push({ node, body });
        }
        
        return results;
    }

    /**
     * Extract method calls from method body
     */
    private extractMethodCallsFromBody(
        body: string,
        callerId: string,
        filePath: string,
        methodStartLine: number
    ): MethodCall[] {
        const calls: MethodCall[] = [];
        
        // Match: object.methodName(args) or ClassName.staticMethod(args) or methodName(args)
        const callRegex = /(?:([\w.]+)\.)?(\w+)\s*\(/g;
        
        let match;
        while ((match = callRegex.exec(body)) !== null) {
            const qualifier = match[1];  // object or class name
            const methodName = match[2];
            
            // Skip common keywords
            if (['if', 'while', 'for', 'switch', 'catch'].includes(methodName)) {
                continue;
            }
            
            const lineNumber = methodStartLine + this.getLineNumber(body, match.index);
            
            calls.push({
                callerId,
                calleeId: '',  // Will be resolved later
                calleeIdentifier: methodName,
                calleeClass: qualifier,
                callType: qualifier ? (qualifier[0].toUpperCase() === qualifier[0] ? 'static' : 'virtual') : 'direct',
                filePath,
                lineNumber
            });
        }
        
        return calls;
    }

    /**
     * Extract data flow from method
     */
    private extractDataFlowFromMethod(
        body: string,
        methodId: string,
        parameters: Parameter[],
        filePath: string,
        methodStartLine: number
    ): DataFlowNode[] {
        const flows: DataFlowNode[] = [];
        const bodyLines = body.split('\n');
        
        // Track parameter usage
        for (const param of parameters) {
            const usages = this.findVariableUsages(body, param.name);
            for (const usage of usages) {
                flows.push({
                    variableName: param.name,
                    variableType: param.type,
                    sourceLocation: `${methodId}:parameter`,
                    usageLocation: `${methodId}:${usage.line}`,
                    flowType: 'parameter',
                    methodId,
                    lineNumber: methodStartLine + usage.line
                });
            }
        }
        
        // Track local variable definitions and usages
        const varRegex = /^\s*([\w<>[\].,\s]+)\s+(\w+)\s*=\s*(.+);/gm;
        let match;
        
        while ((match = varRegex.exec(body)) !== null) {
            const varType = match[1].trim();
            const varName = match[2];
            const defLine = this.getLineNumber(body, match.index);
            
            // Find where this variable is used
            const usages = this.findVariableUsages(body, varName, defLine);
            for (const usage of usages) {
                flows.push({
                    variableName: varName,
                    variableType: varType,
                    sourceLocation: `${methodId}:${defLine}`,
                    usageLocation: `${methodId}:${usage.line}`,
                    flowType: usage.context,
                    methodId,
                    lineNumber: methodStartLine + usage.line
                });
            }
        }
        
        return flows;
    }

    /**
     * Find all usages of a variable in code
     */
    private findVariableUsages(
        code: string,
        variableName: string,
        afterLine: number = 0
    ): Array<{line: number, context: 'argument' | 'return' | 'assignment' | 'field_access'}> {
        const usages: Array<{line: number, context: any}> = [];
        const lines = code.split('\n');
        
        for (let i = afterLine; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes(variableName)) {
                let context: any = 'argument';
                if (line.includes('return') && line.includes(variableName)) {
                    context = 'return';
                } else if (line.includes('=') && line.indexOf(variableName) < line.indexOf('=')) {
                    context = 'assignment';
                } else if (line.includes(variableName + '.')) {
                    context = 'field_access';
                }
                usages.push({ line: i, context });
            }
        }
        
        return usages;
    }

    /**
     * Parse method parameters
     */
    private parseParameters(paramsStr: string): Parameter[] {
        if (!paramsStr.trim()) {
            return [];
        }
        
        const params = paramsStr.split(',').map(p => p.trim());
        return params.map(param => {
            const parts = param.split(/\s+/);
            return {
                type: parts.slice(0, -1).join(' '),
                name: parts[parts.length - 1]
            };
        });
    }

    /**
     * Extract modifiers from signature
     */
    private extractModifiers(signature: string): string[] {
        const modifiers: string[] = [];
        const keywords = ['public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized'];
        
        for (const keyword of keywords) {
            if (signature.includes(keyword)) {
                modifiers.push(keyword);
            }
        }
        
        return modifiers;
    }

    /**
     * Get line number from string position
     */
    private getLineNumber(code: string, position: number): number {
        return code.substring(0, position).split('\n').length;
    }

    /**
     * Find closing brace for a block
     */
    private findClosingBrace(code: string, startPos: number, lines: string[]): number {
        let braceCount = 0;
        let inBlock = false;
        let lineNum = this.getLineNumber(code, startPos);
        
        for (let i = startPos; i < code.length; i++) {
            if (code[i] === '{') {
                braceCount++;
                inBlock = true;
            } else if (code[i] === '}') {
                braceCount--;
                if (inBlock && braceCount === 0) {
                    return this.getLineNumber(code, i);
                }
            }
        }
        
        return lineNum + 10;  // Fallback
    }

    /**
     * Find closing brace index
     */
    private findClosingBraceIndex(code: string, startPos: number): number {
        let braceCount = 0;
        let inBlock = false;
        
        for (let i = startPos; i < code.length; i++) {
            if (code[i] === '{') {
                braceCount++;
                inBlock = true;
            } else if (code[i] === '}') {
                braceCount--;
                if (inBlock && braceCount === 0) {
                    return i;
                }
            }
        }
        
        return code.length;
    }

    /**
     * Generate unique ID for node
     */
    private generateId(filePath: string, identifier: string, startLine: number): string {
        const base = `${filePath}:${identifier}:${startLine}`;
        let hash = 0;
        for (let i = 0; i < base.length; i++) {
            const char = base.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `java_${Math.abs(hash).toString(16)}`;
    }
}
