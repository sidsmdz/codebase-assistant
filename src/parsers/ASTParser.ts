/**
 * Base AST Parser interface and types
 * Provides a unified structure for parsing different languages
 */

export type NodeType = 'CLASS' | 'METHOD' | 'FUNCTION' | 'INTERFACE' | 'VARIABLE' | 'ENUM';

export type Language = 'java' | 'typescript' | 'javascript';

export interface Parameter {
    name: string;
    type: string;
}

export interface ASTNode {
    id: string;                    // Unique identifier (UUID or hash)
    type: NodeType;                // Type of AST node
    identifier: string;            // Name (e.g., "getUserById", "UserService")
    signature?: string;            // Full signature (e.g., "public User getUserById(String id)")
    parameters?: Parameter[];      // Method/function parameters
    returnType?: string;           // Return type
    modifiers?: string[];          // public, static, async, private, etc.
    parentId?: string;             // Parent node ID (for methods inside classes)
    filePath: string;              // Source file path
    startLine: number;             // Starting line number
    endLine: number;               // Ending line number
    language: Language;            // Programming language
    code?: string;                 // The actual code snippet (optional)
}

/**
 * Abstract base class for AST parsers
 */
export abstract class ASTParser {
    /**
     * Parse source code and extract AST nodes
     * @param code Source code to parse
     * @param filePath Path to the source file
     * @returns Array of extracted AST nodes
     */
    abstract parse(code: string, filePath: string): ASTNode[];

    /**
     * Generate a unique ID for an AST node
     */
    protected generateId(filePath: string, identifier: string, startLine: number): string {
        const base = `${filePath}:${identifier}:${startLine}`;
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < base.length; i++) {
            const char = base.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `ast_${Math.abs(hash).toString(36)}`;
    }

    /**
     * Extract code snippet from source
     */
    protected extractCodeSnippet(code: string, startLine: number, endLine: number): string {
        const lines = code.split('\n');
        return lines.slice(startLine - 1, endLine).join('\n');
    }
}
