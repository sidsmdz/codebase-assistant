/**
 * Query Parser for extracting search intent from user queries
 * Analyzes natural language queries to determine what the user is looking for
 */

import { NodeType } from '../parsers/ASTParser';
import { tokenizer } from './Tokenizer';

export interface QueryIntent {
    // What type of code construct is the user looking for?
    nodeType?: NodeType;

    // Specific identifier the user mentioned (e.g., "getUserById")
    identifier?: string;

    // Keywords extracted from the query
    keywords: string[];

    // Original query text
    originalQuery: string;

    // Detected patterns
    patterns: QueryPattern[];

    // Language hint if detected (e.g., "java class", "typescript function")
    language?: 'java' | 'typescript' | 'javascript';
}

export type QueryPattern =
    | 'exact_match'      // Looking for exact identifier (e.g., "getUserById")
    | 'fuzzy_match'      // Might have typos
    | 'semantic'         // Conceptual search (e.g., "authentication logic")
    | 'signature'        // Looking for specific signature (e.g., "method that takes string and returns user")
    | 'contains';        // Looking for code containing specific patterns

/**
 * Parser for extracting intent from user queries
 */
export class QueryParser {
    // Type keywords that indicate what kind of construct the user wants
    private readonly typeKeywords: Map<NodeType, string[]> = new Map([
        ['CLASS', ['class', 'classes']],
        ['FUNCTION', ['function', 'functions', 'func', 'arrow', 'lambda']],
        ['METHOD', ['method', 'methods', 'procedure']],
        ['INTERFACE', ['interface', 'interfaces', 'contract']],
        ['ENUM', ['enum', 'enums', 'enumeration']],
        ['VARIABLE', ['variable', 'var', 'const', 'let', 'field']]
    ]);

    // Language keywords
    private readonly languageKeywords: Map<string, string[]> = new Map([
        ['java', ['java']],
        ['typescript', ['typescript', 'ts']],
        ['javascript', ['javascript', 'js']]
    ]);

    // Action keywords that indicate search patterns
    private readonly actionKeywords = {
        exact: ['find', 'get', 'show', 'display', 'locate'],
        contains: ['contains', 'includes', 'has', 'with', 'using'],
        semantic: ['related', 'similar', 'like', 'about', 'for', 'handles', 'manages', 'logic', 'authentication', 'processing', 'validation']
    };

    /**
     * Parse a user query and extract search intent
     */
    parse(query: string): QueryIntent {
        const originalQuery = query;
        const normalizedQuery = query.toLowerCase();

        // Extract node type
        const nodeType = this.extractNodeType(normalizedQuery);

        // Extract language hint
        const language = this.extractLanguage(normalizedQuery);

        // Extract identifier (camelCase or specific names)
        const identifier = this.extractIdentifier(query);

        // Extract keywords
        const keywords = tokenizer.tokenize(query, {
            removeStopwords: true,
            minLength: 2,
            splitCamelCase: false
        });

        // Detect query patterns
        const patterns = this.detectPatterns(normalizedQuery, identifier);

        return {
            nodeType,
            identifier,
            keywords,
            originalQuery,
            patterns,
            language
        };
    }

    /**
     * Extract node type from query
     * Examples:
     *   "getUserById method" -> METHOD
     *   "UserService class" -> CLASS
     *   "Authentication interface" -> INTERFACE
     */
    private extractNodeType(query: string): NodeType | undefined {
        for (const [nodeType, keywords] of this.typeKeywords.entries()) {
            for (const keyword of keywords) {
                const regex = new RegExp(`\\b${keyword}\\b`, 'i');
                if (regex.test(query)) {
                    return nodeType;
                }
            }
        }
        return undefined;
    }

    /**
     * Extract language from query
     * Examples:
     *   "java class UserService" -> java
     *   "typescript function getData" -> typescript
     */
    private extractLanguage(query: string): 'java' | 'typescript' | 'javascript' | undefined {
        for (const [lang, keywords] of this.languageKeywords.entries()) {
            for (const keyword of keywords) {
                const regex = new RegExp(`\\b${keyword}\\b`, 'i');
                if (regex.test(query)) {
                    return lang as 'java' | 'typescript' | 'javascript';
                }
            }
        }
        return undefined;
    }

    /**
     * Extract identifier from query
     * Looks for camelCase or PascalCase identifiers
     * Examples:
     *   "find getUserById method" -> "getUserById"
     *   "UserService class" -> "UserService"
     *   "show me the OrderController" -> "OrderController"
     */
    private extractIdentifier(query: string): string | undefined {
        // Look for camelCase or PascalCase patterns
        const camelCaseRegex = /\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b|\b[A-Z][a-zA-Z0-9]*\b/g;
        const matches = query.match(camelCaseRegex);

        if (matches && matches.length > 0) {
            // Return the first camelCase identifier found
            // Filter out common words that might match (like "I", "A")
            const filtered = matches.filter(m => m.length > 1);
            if (filtered.length > 0) {
                return filtered[0];
            }
        }

        // Look for quoted strings as exact identifiers
        const quotedRegex = /["']([^"']+)["']/;
        const quotedMatch = query.match(quotedRegex);
        if (quotedMatch && quotedMatch[1]) {
            return quotedMatch[1];
        }

        return undefined;
    }

    /**
     * Detect query patterns
     */
    private detectPatterns(query: string, identifier?: string): QueryPattern[] {
        const patterns: QueryPattern[] = [];

        // If we have a clear identifier, it's likely an exact match query
        if (identifier) {
            patterns.push('exact_match');
        }

        // Check for "contains" pattern
        for (const keyword of this.actionKeywords.contains) {
            if (query.includes(keyword)) {
                patterns.push('contains');
                break;
            }
        }

        // Check for semantic pattern
        for (const keyword of this.actionKeywords.semantic) {
            if (query.includes(keyword)) {
                patterns.push('semantic');
                break;
            }
        }

        // Check for signature pattern (mentions types or parameters)
        const hasSignature = this.hasSignatureHints(query);
        if (hasSignature) {
            patterns.push('signature');
            // Signature queries are also semantic (describing what a function does)
            if (!patterns.includes('semantic')) {
                patterns.push('semantic');
            }
        }

        // If no specific patterns detected, assume semantic search
        if (patterns.length === 0) {
            patterns.push('semantic');
        }

        // Always add fuzzy match as a fallback
        patterns.push('fuzzy_match');

        return patterns;
    }

    /**
     * Check if query contains signature hints
     * Examples:
     *   "method that takes string and returns user"
     *   "function with id parameter"
     */
    private hasSignatureHints(query: string): boolean {
        const signatureKeywords = [
            'takes', 'accepts', 'receives', 'parameter', 'param', 'argument', 'arg',
            'returns', 'return', 'gives', 'outputs',
            'string', 'number', 'boolean', 'int', 'void', 'object', 'array'
        ];

        return signatureKeywords.some(keyword =>
            new RegExp(`\\b${keyword}\\b`, 'i').test(query)
        );
    }

    /**
     * Extract parameter types from query
     * Examples:
     *   "method that takes string id" -> ["string"]
     *   "function with int count and boolean flag" -> ["int", "boolean"]
     */
    extractParameterTypes(query: string): string[] {
        const types: string[] = [];
        const typeKeywords = [
            'string', 'number', 'boolean', 'int', 'void', 'object', 'array',
            'double', 'float', 'long', 'short', 'byte', 'char',
            'any', 'unknown', 'never'
        ];

        for (const type of typeKeywords) {
            const regex = new RegExp(`\\b${type}\\b`, 'gi');
            if (regex.test(query)) {
                types.push(type);
            }
        }

        return types;
    }

    /**
     * Check if query is asking for a specific identifier
     */
    isExactSearch(intent: QueryIntent): boolean {
        return intent.patterns.includes('exact_match') && !!intent.identifier;
    }

    /**
     * Check if query is semantic/conceptual
     */
    isSemanticSearch(intent: QueryIntent): boolean {
        return intent.patterns.includes('semantic') && !intent.identifier;
    }

    /**
     * Generate search variations for fuzzy matching
     * Examples:
     *   "getUserById" -> ["getuserbyid", "get user by id", "getuser", "userbyid"]
     */
    generateSearchVariations(identifier: string): string[] {
        const variations = new Set<string>();

        // Original
        variations.add(identifier.toLowerCase());

        // Split camelCase
        const parts = tokenizer.splitCamelCase(identifier);
        variations.add(parts.join(' '));
        variations.add(parts.join(''));

        // Partial matches (first 2+ words)
        if (parts.length > 2) {
            variations.add(parts.slice(0, 2).join(''));
            variations.add(parts.slice(-2).join(''));
        }

        return Array.from(variations);
    }
}

/**
 * Singleton query parser instance
 */
export const queryParser = new QueryParser();
