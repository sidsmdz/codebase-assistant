/**
 * Mock JavaASTParser for Jest tests
 * Avoids ESM import issues with java-parser
 */

import { ASTParser, ASTNode } from '../../parsers/ASTParser';

export class JavaASTParser extends ASTParser {
    parse(content: string, filePath: string): ASTNode[] {
        const nodes: ASTNode[] = [];

        // Mock: Extract class definitions
        const classMatches = content.matchAll(/class\s+(\w+)/g);
        for (const match of classMatches) {
            const className = match[1];
            const lineNumber = content.substring(0, match.index).split('\n').length;

            nodes.push({
                id: this.generateId(filePath, className, lineNumber),
                type: 'CLASS',
                identifier: className,
                signature: `class ${className}`,
                filePath,
                startLine: lineNumber,
                endLine: lineNumber + 1,
                language: 'java'
            });
        }

        // Mock: Extract method definitions
        const methodMatches = content.matchAll(/(?:public|private|protected)\s+\w+\s+(\w+)\s*\(/g);
        for (const match of methodMatches) {
            const methodName = match[1];
            const lineNumber = content.substring(0, match.index).split('\n').length;

            nodes.push({
                id: this.generateId(filePath, methodName, lineNumber),
                type: 'METHOD',
                identifier: methodName,
                signature: `method ${methodName}`,
                filePath,
                startLine: lineNumber,
                endLine: lineNumber + 1,
                language: 'java'
            });
        }

        return nodes;
    }
}
