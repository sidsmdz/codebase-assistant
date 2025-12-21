/**
 * TypeScript/JavaScript AST Parser using @babel/parser
 */

import { parse, ParserOptions } from '@babel/parser';
import { ASTParser, ASTNode, NodeType, Parameter } from './ASTParser';

type BabelNode = any; // Babel AST node types

export class TypeScriptASTParser extends ASTParser {
    private isTypeScript: boolean = true;

    constructor(isTypeScript: boolean = true) {
        super();
        this.isTypeScript = isTypeScript;
    }

    parse(code: string, filePath: string): ASTNode[] {
        try {
            const plugins: ParserOptions['plugins'] = this.isTypeScript
                ? ['typescript', 'jsx', 'decorators']
                : ['jsx', 'decorators'];

            const ast = parse(code, {
                sourceType: 'module',
                plugins,
                errorRecovery: true
            });

            const nodes: ASTNode[] = [];
            this.extractNodes(ast.program.body, nodes, filePath, code);

            return nodes;
        } catch (error) {
            console.error(`Failed to parse ${this.isTypeScript ? 'TypeScript' : 'JavaScript'} file ${filePath}:`, error);
            return [];
        }
    }

    private extractNodes(body: BabelNode[], nodes: ASTNode[], filePath: string, code: string, parentId?: string): void {
        for (const node of body) {
            // Class declarations
            if (node.type === 'ClassDeclaration') {
                const classNode = this.extractClassDeclaration(node, filePath, code);
                if (classNode) {
                    nodes.push(classNode);

                    // Extract methods from the class
                    if (node.body && node.body.body) {
                        this.extractClassMembers(node.body.body, nodes, filePath, code, classNode.id);
                    }
                }
            }

            // Function declarations
            else if (node.type === 'FunctionDeclaration') {
                const funcNode = this.extractFunctionDeclaration(node, filePath, code, parentId);
                if (funcNode) {
                    nodes.push(funcNode);
                }
            }

            // Interface declarations (TypeScript)
            else if (node.type === 'TSInterfaceDeclaration') {
                const interfaceNode = this.extractInterfaceDeclaration(node, filePath, code);
                if (interfaceNode) {
                    nodes.push(interfaceNode);
                }
            }

            // Enum declarations (TypeScript)
            else if (node.type === 'TSEnumDeclaration') {
                const enumNode = this.extractEnumDeclaration(node, filePath, code);
                if (enumNode) {
                    nodes.push(enumNode);
                }
            }

            // Export declarations
            else if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
                if (node.declaration) {
                    this.extractNodes([node.declaration], nodes, filePath, code, parentId);
                }
            }

            // Variable declarations with arrow functions
            else if (node.type === 'VariableDeclaration') {
                for (const declarator of node.declarations) {
                    if (declarator.init && (declarator.init.type === 'ArrowFunctionExpression' || declarator.init.type === 'FunctionExpression')) {
                        const funcNode = this.extractArrowFunction(declarator, filePath, code, parentId);
                        if (funcNode) {
                            nodes.push(funcNode);
                        }
                    }
                }
            }
        }
    }

    private extractClassDeclaration(node: BabelNode, filePath: string, code: string): ASTNode | null {
        if (!node.id || !node.id.name) {
            return null;
        }

        const identifier = node.id.name;
        const location = this.getLocationFromNode(node);
        const modifiers: string[] = [];

        if (node.abstract) {
            modifiers.push('abstract');
        }

        const extendsClause = node.superClass ? ` extends ${this.getIdentifierFromNode(node.superClass)}` : '';
        const signature = `class ${identifier}${extendsClause}`;

        return {
            id: this.generateId(filePath, identifier, location.startLine),
            type: 'CLASS',
            identifier,
            signature,
            modifiers,
            filePath,
            startLine: location.startLine,
            endLine: location.endLine,
            language: this.isTypeScript ? 'typescript' : 'javascript',
            code: this.extractCodeSnippet(code, location.startLine, location.endLine)
        };
    }

    private extractClassMembers(members: BabelNode[], nodes: ASTNode[], filePath: string, code: string, parentId: string): void {
        for (const member of members) {
            if (member.type === 'ClassMethod' || member.type === 'ClassProperty') {
                const methodNode = this.extractClassMethod(member, filePath, code, parentId);
                if (methodNode) {
                    nodes.push(methodNode);
                }
            }
        }
    }

    private extractClassMethod(node: BabelNode, filePath: string, code: string, parentId: string): ASTNode | null {
        const identifier = this.getIdentifierFromNode(node.key);
        if (!identifier) {
            return null;
        }

        const location = this.getLocationFromNode(node);
        const modifiers: string[] = [];

        if (node.static) {
            modifiers.push('static');
        }
        if (node.async) {
            modifiers.push('async');
        }
        if (node.kind === 'constructor') {
            modifiers.push('constructor');
        }

        const parameters = node.params ? this.extractParameters(node.params) : [];
        const returnType = this.getReturnType(node);

        const paramStr = parameters.map(p => `${p.name}: ${p.type}`).join(', ');
        const signature = `${modifiers.join(' ')} ${identifier}(${paramStr}): ${returnType}`.trim();

        return {
            id: this.generateId(filePath, identifier, location.startLine),
            type: 'METHOD',
            identifier,
            signature,
            parameters,
            returnType,
            modifiers,
            parentId,
            filePath,
            startLine: location.startLine,
            endLine: location.endLine,
            language: this.isTypeScript ? 'typescript' : 'javascript',
            code: this.extractCodeSnippet(code, location.startLine, location.endLine)
        };
    }

    private extractFunctionDeclaration(node: BabelNode, filePath: string, code: string, parentId?: string): ASTNode | null {
        if (!node.id || !node.id.name) {
            return null;
        }

        const identifier = node.id.name;
        const location = this.getLocationFromNode(node);
        const modifiers: string[] = [];

        if (node.async) {
            modifiers.push('async');
        }
        if (node.generator) {
            modifiers.push('generator');
        }

        const parameters = this.extractParameters(node.params);
        const returnType = this.getReturnType(node);

        const paramStr = parameters.map(p => `${p.name}: ${p.type}`).join(', ');
        const signature = `${modifiers.join(' ')} function ${identifier}(${paramStr}): ${returnType}`.trim();

        return {
            id: this.generateId(filePath, identifier, location.startLine),
            type: 'FUNCTION',
            identifier,
            signature,
            parameters,
            returnType,
            modifiers,
            parentId,
            filePath,
            startLine: location.startLine,
            endLine: location.endLine,
            language: this.isTypeScript ? 'typescript' : 'javascript',
            code: this.extractCodeSnippet(code, location.startLine, location.endLine)
        };
    }

    private extractArrowFunction(declarator: BabelNode, filePath: string, code: string, parentId?: string): ASTNode | null {
        if (!declarator.id || !declarator.id.name) {
            return null;
        }

        const identifier = declarator.id.name;
        const node = declarator.init;
        const location = this.getLocationFromNode(declarator);
        const modifiers: string[] = ['const'];

        if (node.async) {
            modifiers.push('async');
        }

        const parameters = this.extractParameters(node.params);
        const returnType = this.getReturnType(node);

        const paramStr = parameters.map(p => `${p.name}: ${p.type}`).join(', ');
        const signature = `${modifiers.join(' ')} ${identifier} = (${paramStr}): ${returnType} => {...}`.trim();

        return {
            id: this.generateId(filePath, identifier, location.startLine),
            type: 'FUNCTION',
            identifier,
            signature,
            parameters,
            returnType,
            modifiers,
            parentId,
            filePath,
            startLine: location.startLine,
            endLine: location.endLine,
            language: this.isTypeScript ? 'typescript' : 'javascript',
            code: this.extractCodeSnippet(code, location.startLine, location.endLine)
        };
    }

    private extractInterfaceDeclaration(node: BabelNode, filePath: string, code: string): ASTNode | null {
        if (!node.id || !node.id.name) {
            return null;
        }

        const identifier = node.id.name;
        const location = this.getLocationFromNode(node);

        const extendsClause = node.extends && node.extends.length > 0
            ? ` extends ${node.extends.map((e: any) => this.getIdentifierFromNode(e)).join(', ')}`
            : '';
        const signature = `interface ${identifier}${extendsClause}`;

        return {
            id: this.generateId(filePath, identifier, location.startLine),
            type: 'INTERFACE',
            identifier,
            signature,
            filePath,
            startLine: location.startLine,
            endLine: location.endLine,
            language: 'typescript',
            code: this.extractCodeSnippet(code, location.startLine, location.endLine)
        };
    }

    private extractEnumDeclaration(node: BabelNode, filePath: string, code: string): ASTNode | null {
        if (!node.id || !node.id.name) {
            return null;
        }

        const identifier = node.id.name;
        const location = this.getLocationFromNode(node);
        const modifiers: string[] = [];

        if (node.const) {
            modifiers.push('const');
        }

        const signature = `${modifiers.join(' ')} enum ${identifier}`.trim();

        return {
            id: this.generateId(filePath, identifier, location.startLine),
            type: 'ENUM',
            identifier,
            signature,
            modifiers,
            filePath,
            startLine: location.startLine,
            endLine: location.endLine,
            language: 'typescript',
            code: this.extractCodeSnippet(code, location.startLine, location.endLine)
        };
    }

    private extractParameters(params: BabelNode[]): Parameter[] {
        const parameters: Parameter[] = [];

        for (const param of params) {
            let name = '';
            let type = 'any';

            // Identifier
            if (param.type === 'Identifier') {
                name = param.name;
                type = this.getTypeAnnotation(param);
            }
            // Rest parameter
            else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
                name = `...${param.argument.name}`;
                type = this.getTypeAnnotation(param.argument);
            }
            // Assignment pattern (default parameters)
            else if (param.type === 'AssignmentPattern' && param.left.type === 'Identifier') {
                name = param.left.name;
                type = this.getTypeAnnotation(param.left);
            }
            // Object pattern
            else if (param.type === 'ObjectPattern') {
                name = '{...}';
                type = this.getTypeAnnotation(param);
            }
            // Array pattern
            else if (param.type === 'ArrayPattern') {
                name = '[...]';
                type = this.getTypeAnnotation(param);
            }

            if (name) {
                parameters.push({ name, type });
            }
        }

        return parameters;
    }

    private getTypeAnnotation(node: BabelNode): string {
        if (node.typeAnnotation && node.typeAnnotation.typeAnnotation) {
            return this.getTypeFromAnnotation(node.typeAnnotation.typeAnnotation);
        }
        return 'any';
    }

    private getTypeFromAnnotation(typeNode: BabelNode): string {
        if (!typeNode) {
            return 'any';
        }

        switch (typeNode.type) {
            case 'TSStringKeyword':
                return 'string';
            case 'TSNumberKeyword':
                return 'number';
            case 'TSBooleanKeyword':
                return 'boolean';
            case 'TSVoidKeyword':
                return 'void';
            case 'TSAnyKeyword':
                return 'any';
            case 'TSTypeReference':
                return this.getIdentifierFromNode(typeNode.typeName) || 'any';
            case 'TSArrayType':
                return `${this.getTypeFromAnnotation(typeNode.elementType)}[]`;
            case 'TSUnionType':
                return typeNode.types.map((t: any) => this.getTypeFromAnnotation(t)).join(' | ');
            default:
                return 'any';
        }
    }

    private getReturnType(node: BabelNode): string {
        if (node.returnType && node.returnType.typeAnnotation) {
            return this.getTypeFromAnnotation(node.returnType.typeAnnotation);
        }
        return 'any';
    }

    private getLocationFromNode(node: BabelNode): { startLine: number; endLine: number } {
        return {
            startLine: node.loc?.start.line || 1,
            endLine: node.loc?.end.line || 1
        };
    }

    private getIdentifierFromNode(node: BabelNode): string | null {
        if (!node) {
            return null;
        }

        if (node.type === 'Identifier') {
            return node.name;
        }

        if (node.type === 'StringLiteral') {
            return node.value;
        }

        if (node.type === 'MemberExpression') {
            const obj = this.getIdentifierFromNode(node.object);
            const prop = this.getIdentifierFromNode(node.property);
            return obj && prop ? `${obj}.${prop}` : null;
        }

        return null;
    }
}
