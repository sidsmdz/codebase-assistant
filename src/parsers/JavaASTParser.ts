/**
 * Java AST Parser using java-parser library
 */

import { parse } from 'java-parser';
import { ASTParser, ASTNode, NodeType, Parameter } from './ASTParser';

export class JavaASTParser extends ASTParser {
    parse(code: string, filePath: string): ASTNode[] {
        try {
            const cst = parse(code);
            const nodes: ASTNode[] = [];

            // Extract different types of nodes
            this.extractFromCST(cst, nodes, filePath, code);

            return nodes;
        } catch (error) {
            console.error(`Failed to parse Java file ${filePath}:`, error);
            return [];
        }
    }

    private extractFromCST(cst: any, nodes: ASTNode[], filePath: string, code: string): void {
        if (!cst) {
            return;
        }

        // java-parser returns a CST (Concrete Syntax Tree)
        // We need to traverse it to find relevant declarations

        // Extract classes
        this.visitNode(cst, 'classDeclaration', (node: any) => {
            const astNode = this.extractClassDeclaration(node, filePath, code);
            if (astNode) {
                nodes.push(astNode);

                // Extract methods within this class
                this.extractMethodsFromClass(node, nodes, filePath, code, astNode.id);
            }
        });

        // Extract interfaces
        this.visitNode(cst, 'interfaceDeclaration', (node: any) => {
            const astNode = this.extractInterfaceDeclaration(node, filePath, code);
            if (astNode) {
                nodes.push(astNode);

                // Extract methods within this interface
                this.extractMethodsFromClass(node, nodes, filePath, code, astNode.id);
            }
        });

        // Extract enums
        this.visitNode(cst, 'enumDeclaration', (node: any) => {
            const astNode = this.extractEnumDeclaration(node, filePath, code);
            if (astNode) {
                nodes.push(astNode);
            }
        });
    }

    private extractClassDeclaration(node: any, filePath: string, code: string): ASTNode | null {
        try {
            const identifier = this.getIdentifier(node, 'typeIdentifier');
            if (!identifier) {
                return null;
            }

            const location = this.getLocation(node);
            const modifiers = this.getModifiers(node);

            return {
                id: this.generateId(filePath, identifier, location.startLine),
                type: 'CLASS' as NodeType,
                identifier,
                signature: `${modifiers.join(' ')} class ${identifier}`.trim(),
                modifiers,
                filePath,
                startLine: location.startLine,
                endLine: location.endLine,
                language: 'java',
                code: this.extractCodeSnippet(code, location.startLine, location.endLine)
            };
        } catch (error) {
            return null;
        }
    }

    private extractInterfaceDeclaration(node: any, filePath: string, code: string): ASTNode | null {
        try {
            const identifier = this.getIdentifier(node, 'typeIdentifier');
            if (!identifier) {
                return null;
            }

            const location = this.getLocation(node);
            const modifiers = this.getModifiers(node);

            return {
                id: this.generateId(filePath, identifier, location.startLine),
                type: 'INTERFACE' as NodeType,
                identifier,
                signature: `${modifiers.join(' ')} interface ${identifier}`.trim(),
                modifiers,
                filePath,
                startLine: location.startLine,
                endLine: location.endLine,
                language: 'java',
                code: this.extractCodeSnippet(code, location.startLine, location.endLine)
            };
        } catch (error) {
            return null;
        }
    }

    private extractEnumDeclaration(node: any, filePath: string, code: string): ASTNode | null {
        try {
            const identifier = this.getIdentifier(node, 'typeIdentifier');
            if (!identifier) {
                return null;
            }

            const location = this.getLocation(node);
            const modifiers = this.getModifiers(node);

            return {
                id: this.generateId(filePath, identifier, location.startLine),
                type: 'ENUM' as NodeType,
                identifier,
                signature: `${modifiers.join(' ')} enum ${identifier}`.trim(),
                modifiers,
                filePath,
                startLine: location.startLine,
                endLine: location.endLine,
                language: 'java',
                code: this.extractCodeSnippet(code, location.startLine, location.endLine)
            };
        } catch (error) {
            return null;
        }
    }

    private extractMethodsFromClass(classNode: any, nodes: ASTNode[], filePath: string, code: string, parentId: string): void {
        this.visitNode(classNode, 'methodDeclaration', (methodNode: any) => {
            const astNode = this.extractMethodDeclaration(methodNode, filePath, code, parentId);
            if (astNode) {
                nodes.push(astNode);
            }
        });
    }

    private extractMethodDeclaration(node: any, filePath: string, code: string, parentId?: string): ASTNode | null {
        try {
            const identifier = this.getIdentifier(node, 'Identifier');
            if (!identifier) {
                return null;
            }

            const location = this.getLocation(node);
            const modifiers = this.getModifiers(node);
            const parameters = this.getParameters(node);
            const returnType = this.getReturnType(node);

            const paramStr = parameters.map(p => `${p.type} ${p.name}`).join(', ');
            const signature = `${modifiers.join(' ')} ${returnType} ${identifier}(${paramStr})`.trim();

            return {
                id: this.generateId(filePath, identifier, location.startLine),
                type: 'METHOD' as NodeType,
                identifier,
                signature,
                parameters,
                returnType,
                modifiers,
                parentId,
                filePath,
                startLine: location.startLine,
                endLine: location.endLine,
                language: 'java',
                code: this.extractCodeSnippet(code, location.startLine, location.endLine)
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Recursively visit nodes of a specific type in the CST
     */
    private visitNode(node: any, nodeType: string, callback: (node: any) => void): void {
        if (!node) {
            return;
        }

        // Check if current node matches the type
        if (node.name === nodeType) {
            callback(node);
        }

        // Recursively visit children
        if (node.children) {
            for (const key in node.children) {
                const children = node.children[key];
                if (Array.isArray(children)) {
                    children.forEach(child => this.visitNode(child, nodeType, callback));
                } else {
                    this.visitNode(children, nodeType, callback);
                }
            }
        }
    }

    /**
     * Extract identifier from a node
     */
    private getIdentifier(node: any, identifierType: string = 'Identifier'): string | null {
        if (!node || !node.children) {
            return null;
        }

        // Try to find the identifier in children
        const identifierNode = this.findNodeByName(node, identifierType);
        if (identifierNode && identifierNode.image) {
            return identifierNode.image;
        }

        return null;
    }

    /**
     * Get location information from a node
     */
    private getLocation(node: any): { startLine: number; endLine: number } {
        let startLine = 1;
        let endLine = 1;

        // Try to get location from the first token
        const firstToken = this.findFirstToken(node);
        if (firstToken && firstToken.startLine) {
            startLine = firstToken.startLine;
        }

        // Try to get end location from the last token
        const lastToken = this.findLastToken(node);
        if (lastToken && lastToken.endLine) {
            endLine = lastToken.endLine;
        }

        return { startLine, endLine };
    }

    /**
     * Extract modifiers (public, private, static, etc.)
     */
    private getModifiers(node: any): string[] {
        const modifiers: string[] = [];

        if (!node || !node.children || !node.children.classModifier) {
            return modifiers;
        }

        const modifierNodes = node.children.classModifier || node.children.methodModifier || [];

        for (const modNode of modifierNodes) {
            if (modNode.children) {
                for (const key in modNode.children) {
                    if (modNode.children[key] && modNode.children[key].length > 0) {
                        modifiers.push(key);
                    }
                }
            }
        }

        return modifiers;
    }

    /**
     * Extract method parameters
     */
    private getParameters(node: any): Parameter[] {
        const parameters: Parameter[] = [];

        if (!node || !node.children || !node.children.formalParameterList) {
            return parameters;
        }

        try {
            const paramList = node.children.formalParameterList[0];
            if (paramList && paramList.children && paramList.children.formalParameter) {
                const params = paramList.children.formalParameter;

                for (const param of params) {
                    const paramType = this.getTypeFromNode(param);
                    const paramName = this.getIdentifier(param, 'Identifier');

                    if (paramType && paramName) {
                        parameters.push({ name: paramName, type: paramType });
                    }
                }
            }
        } catch (error) {
            // Ignore parameter extraction errors
        }

        return parameters;
    }

    /**
     * Extract return type
     */
    private getReturnType(node: any): string {
        if (!node || !node.children) {
            return 'void';
        }

        try {
            if (node.children.result) {
                const resultNode = node.children.result[0];
                return this.getTypeFromNode(resultNode) || 'void';
            }
        } catch (error) {
            // Ignore
        }

        return 'void';
    }

    /**
     * Extract type information from a node
     */
    private getTypeFromNode(node: any): string | null {
        if (!node || !node.children) {
            return null;
        }

        // Try to find unannType (Java type)
        if (node.children.unannType) {
            const typeNode = node.children.unannType[0];
            const identifier = this.getIdentifier(typeNode, 'typeIdentifier');
            if (identifier) {
                return identifier;
            }
        }

        // Try primitive types
        const primitives = ['int', 'boolean', 'void', 'double', 'float', 'long', 'short', 'byte', 'char'];
        for (const prim of primitives) {
            if (node.children[prim]) {
                return prim;
            }
        }

        return null;
    }

    /**
     * Find first token in node tree
     */
    private findFirstToken(node: any): any {
        if (!node) {
            return null;
        }

        // If this is a token (has startLine)
        if (node.startLine !== undefined) {
            return node;
        }

        // Otherwise, search children
        if (node.children) {
            for (const key in node.children) {
                const children = node.children[key];
                if (Array.isArray(children)) {
                    for (const child of children) {
                        const token = this.findFirstToken(child);
                        if (token) {
                            return token;
                        }
                    }
                } else {
                    const token = this.findFirstToken(children);
                    if (token) {
                        return token;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Find last token in node tree
     */
    private findLastToken(node: any): any {
        if (!node) {
            return null;
        }

        let lastToken: any = null;

        if (node.endLine !== undefined) {
            lastToken = node;
        }

        if (node.children) {
            for (const key in node.children) {
                const children = node.children[key];
                if (Array.isArray(children)) {
                    for (let i = children.length - 1; i >= 0; i--) {
                        const token = this.findLastToken(children[i]);
                        if (token && (!lastToken || token.endLine > lastToken.endLine)) {
                            lastToken = token;
                        }
                    }
                } else {
                    const token = this.findLastToken(children);
                    if (token && (!lastToken || token.endLine > lastToken.endLine)) {
                        lastToken = token;
                    }
                }
            }
        }

        return lastToken;
    }

    /**
     * Find a node by its name in the tree
     */
    private findNodeByName(node: any, name: string): any {
        if (!node) {
            return null;
        }

        if (node.name === name) {
            return node;
        }

        if (node.children) {
            for (const key in node.children) {
                const children = node.children[key];
                if (Array.isArray(children)) {
                    for (const child of children) {
                        const found = this.findNodeByName(child, name);
                        if (found) {
                            return found;
                        }
                    }
                } else {
                    const found = this.findNodeByName(children, name);
                    if (found) {
                        return found;
                    }
                }
            }
        }

        return null;
    }
}
