import Parser from 'tree-sitter';
import * as vscode from 'vscode';

interface ParsedNode {
    type: string;
    name: string;
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
    children?: ParsedNode[];
}

interface Relationship {
    sourceEntity: string;
    targetEntity: string;
    relationType: 'EXTENDS' | 'IMPLEMENTS' | 'CALLS' | 'USES' | 'REFERENCES' | 'DEFINES' | 'RETURNS';
    sourceFile: string;
    sourceLine: number;
    metadata?: Record<string, any>;
}

export class TreeSitterManager {
    private parser: Parser;
    private javaLanguage: any;
    private typescriptLanguage: any;
    private cache: Map<string, { tree: Parser.Tree; version: number }> = new Map();

    constructor() {
        this.parser = new Parser();
    }

    async initialize(): Promise<void> {
        try {
            // Dynamically load language parsers
            // Note: tree-sitter languages are loaded differently in different versions
            // This is a simplified approach - may need adjustment based on actual tree-sitter version
            const JavaLanguage = require('tree-sitter-java');
            const TypeScriptLanguage = require('tree-sitter-typescript').typescript;
            
            this.javaLanguage = JavaLanguage;
            this.typescriptLanguage = TypeScriptLanguage;
        } catch (error) {
            console.error('Failed to load tree-sitter languages:', error);
            throw error;
        }
    }

    /**
     * Parse a file and return the syntax tree
     */
    async parseFile(filePath: string, content: string, language: 'java' | 'typescript'): Promise<Parser.Tree> {
        // Set the appropriate language
        if (language === 'java') {
            this.parser.setLanguage(this.javaLanguage);
        } else {
            this.parser.setLanguage(this.typescriptLanguage);
        }

        // Parse the content
        const tree = this.parser.parse(content);
        
        // Cache the tree
        this.cache.set(filePath, { tree, version: Date.now() });
        
        return tree;
    }

    /**
     * Incrementally update a file's parse tree
     */
    async updateFile(
        filePath: string, 
        content: string, 
        language: 'java' | 'typescript',
        changes?: Array<{ startIndex: number; oldEndIndex: number; newEndIndex: number; startPosition: Parser.Point; oldEndPosition: Parser.Point; newEndPosition: Parser.Point }>
    ): Promise<Parser.Tree> {
        const cached = this.cache.get(filePath);
        
        if (cached && changes) {
            // Apply incremental edits
            for (const change of changes) {
                cached.tree.edit(change);
            }
            
            // Re-parse incrementally
            if (language === 'java') {
                this.parser.setLanguage(this.javaLanguage);
            } else {
                this.parser.setLanguage(this.typescriptLanguage);
            }
            
            const newTree = this.parser.parse(content, cached.tree);
            this.cache.set(filePath, { tree: newTree, version: Date.now() });
            return newTree;
        } else {
            // Full parse if no cache or changes
            return this.parseFile(filePath, content, language);
        }
    }

    /**
     * Extract relationships from a Java file
     */
    async extractJavaRelationships(filePath: string, content: string): Promise<Relationship[]> {
        const tree = await this.parseFile(filePath, content, 'java');
        const relationships: Relationship[] = [];
        const rootNode = tree.rootNode;

        // Find the package and imports first
        let packageName = '';
        const imports: string[] = [];

        this.traverse(rootNode, (node) => {
            if (node.type === 'package_declaration') {
                packageName = this.getNodeText(node, content).replace('package ', '').replace(';', '').trim();
            }
            if (node.type === 'import_declaration') {
                imports.push(this.getNodeText(node, content).replace('import ', '').replace(';', '').trim());
            }
        });

        // Extract class/interface declarations
        const classes = this.findNodes(rootNode, ['class_declaration', 'interface_declaration']);
        
        for (const classNode of classes) {
            const className = this.getClassName(classNode, content);
            const fullClassName = packageName ? `${packageName}.${className}` : className;

            // Extract extends relationships
            const superclassNode = this.findChildByType(classNode, 'superclass');
            if (superclassNode) {
                const superclass = this.getNodeText(superclassNode, content).replace('extends ', '').trim();
                relationships.push({
                    sourceEntity: fullClassName,
                    targetEntity: this.resolveType(superclass, imports, packageName),
                    relationType: 'EXTENDS',
                    sourceFile: filePath,
                    sourceLine: classNode.startPosition.row + 1
                });
            }

            // Extract implements relationships
            const interfacesNode = this.findChildByType(classNode, 'super_interfaces');
            if (interfacesNode) {
                const interfaces = this.getNodeText(interfacesNode, content)
                    .replace('implements ', '')
                    .split(',')
                    .map(i => i.trim());
                
                for (const iface of interfaces) {
                    relationships.push({
                        sourceEntity: fullClassName,
                        targetEntity: this.resolveType(iface, imports, packageName),
                        relationType: 'IMPLEMENTS',
                        sourceFile: filePath,
                        sourceLine: classNode.startPosition.row + 1
                    });
                }
            }

            // Extract method calls and field references
            const methods = this.findNodes(classNode, ['method_declaration']);
            for (const method of methods) {
                const methodName = this.getMethodName(method, content);
                const fullMethodName = `${fullClassName}.${methodName}`;

                // Find method invocations
                const invocations = this.findNodes(method, ['method_invocation']);
                for (const invocation of invocations) {
                    const targetMethod = this.getNodeText(invocation, content);
                    relationships.push({
                        sourceEntity: fullMethodName,
                        targetEntity: this.resolveMethodCall(targetMethod, imports, packageName),
                        relationType: 'CALLS',
                        sourceFile: filePath,
                        sourceLine: invocation.startPosition.row + 1,
                        metadata: { methodCall: targetMethod }
                    });
                }

                // Find field accesses
                const fieldAccesses = this.findNodes(method, ['field_access']);
                for (const field of fieldAccesses) {
                    const fieldName = this.getNodeText(field, content);
                    relationships.push({
                        sourceEntity: fullMethodName,
                        targetEntity: fieldName,
                        relationType: 'USES',
                        sourceFile: filePath,
                        sourceLine: field.startPosition.row + 1,
                        metadata: { fieldAccess: fieldName }
                    });
                }

                // Find object creations (data flow)
                const objectCreations = this.findNodes(method, ['object_creation_expression']);
                for (const creation of objectCreations) {
                    const typeName = this.getCreatedType(creation, content);
                    relationships.push({
                        sourceEntity: fullMethodName,
                        targetEntity: this.resolveType(typeName, imports, packageName),
                        relationType: 'DEFINES',
                        sourceFile: filePath,
                        sourceLine: creation.startPosition.row + 1,
                        metadata: { instantiates: typeName }
                    });
                }
            }
        }

        return relationships;
    }

    /**
     * Extract relationships from a TypeScript file
     */
    async extractTypeScriptRelationships(filePath: string, content: string): Promise<Relationship[]> {
        const tree = await this.parseFile(filePath, content, 'typescript');
        const relationships: Relationship[] = [];
        const rootNode = tree.rootNode;

        // Find imports
        const imports = new Map<string, string>();
        this.traverse(rootNode, (node) => {
            if (node.type === 'import_statement') {
                const importText = this.getNodeText(node, content);
                // Parse import to extract module and symbols
                const match = importText.match(/import\s+(?:{([^}]+)}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/);
                if (match) {
                    const module = match[4];
                    if (match[1]) {
                        // Named imports
                        match[1].split(',').forEach(name => {
                            imports.set(name.trim(), module);
                        });
                    } else if (match[2]) {
                        // Namespace import
                        imports.set(match[2], module);
                    } else if (match[3]) {
                        // Default import
                        imports.set(match[3], module);
                    }
                }
            }
        });

        // Extract class/interface declarations
        const declarations = this.findNodes(rootNode, ['class_declaration', 'interface_declaration']);
        
        for (const declaration of declarations) {
            const name = this.getTypeName(declaration, content);

            // Extract extends/implements
            const heritage = this.findChildByType(declaration, 'class_heritage');
            if (heritage) {
                const heritageText = this.getNodeText(heritage, content);
                
                // Parse extends
                const extendsMatch = heritageText.match(/extends\s+(\w+)/);
                if (extendsMatch) {
                    relationships.push({
                        sourceEntity: name,
                        targetEntity: extendsMatch[1],
                        relationType: 'EXTENDS',
                        sourceFile: filePath,
                        sourceLine: declaration.startPosition.row + 1
                    });
                }

                // Parse implements
                const implementsMatch = heritageText.match(/implements\s+([^{]+)/);
                if (implementsMatch) {
                    const interfaces = implementsMatch[1].split(',').map(i => i.trim());
                    for (const iface of interfaces) {
                        relationships.push({
                            sourceEntity: name,
                            targetEntity: iface,
                            relationType: 'IMPLEMENTS',
                            sourceFile: filePath,
                            sourceLine: declaration.startPosition.row + 1
                        });
                    }
                }
            }

            // Extract method calls
            const methods = this.findNodes(declaration, ['method_definition']);
            for (const method of methods) {
                const methodName = this.getMethodName(method, content);
                const fullMethodName = `${name}.${methodName}`;

                // Find call expressions
                const calls = this.findNodes(method, ['call_expression']);
                for (const call of calls) {
                    const callText = this.getNodeText(call, content);
                    relationships.push({
                        sourceEntity: fullMethodName,
                        targetEntity: callText,
                        relationType: 'CALLS',
                        sourceFile: filePath,
                        sourceLine: call.startPosition.row + 1,
                        metadata: { callExpression: callText }
                    });
                }
            }
        }

        return relationships;
    }

    // Helper methods
    private traverse(node: Parser.SyntaxNode, callback: (node: Parser.SyntaxNode) => void): void {
        callback(node);
        for (let i = 0; i < node.childCount; i++) {
            this.traverse(node.child(i)!, callback);
        }
    }

    private findNodes(node: Parser.SyntaxNode, types: string[]): Parser.SyntaxNode[] {
        const results: Parser.SyntaxNode[] = [];
        this.traverse(node, (n) => {
            if (types.includes(n.type)) {
                results.push(n);
            }
        });
        return results;
    }

    private findChildByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && child.type === type) {
                return child;
            }
        }
        return null;
    }

    private getNodeText(node: Parser.SyntaxNode, content: string): string {
        return content.substring(node.startIndex, node.endIndex);
    }

    private getClassName(node: Parser.SyntaxNode, content: string): string {
        const nameNode = this.findChildByType(node, 'identifier');
        return nameNode ? this.getNodeText(nameNode, content) : 'Unknown';
    }

    private getMethodName(node: Parser.SyntaxNode, content: string): string {
        const nameNode = this.findChildByType(node, 'identifier') || 
                         this.findChildByType(node, 'property_identifier');
        return nameNode ? this.getNodeText(nameNode, content) : 'Unknown';
    }

    private getTypeName(node: Parser.SyntaxNode, content: string): string {
        const nameNode = this.findChildByType(node, 'type_identifier') ||
                         this.findChildByType(node, 'identifier');
        return nameNode ? this.getNodeText(nameNode, content) : 'Unknown';
    }

    private getCreatedType(node: Parser.SyntaxNode, content: string): string {
        const typeNode = this.findChildByType(node, 'type_identifier') ||
                        this.findChildByType(node, 'identifier');
        return typeNode ? this.getNodeText(typeNode, content) : 'Unknown';
    }

    private resolveType(typeName: string, imports: string[], packageName: string): string {
        // Check if it's a fully qualified name
        if (typeName.includes('.')) {
            return typeName;
        }

        // Check imports
        for (const imp of imports) {
            if (imp.endsWith(`.${typeName}`) || imp.endsWith(`.*`)) {
                return imp.replace('.*', `.${typeName}`);
            }
        }

        // Same package
        return packageName ? `${packageName}.${typeName}` : typeName;
    }

    private resolveMethodCall(callText: string, imports: string[], packageName: string): string {
        // Simple resolution - can be enhanced
        return callText;
    }

    clearCache(): void {
        this.cache.clear();
    }

    getCacheSize(): number {
        return this.cache.size;
    }
}
