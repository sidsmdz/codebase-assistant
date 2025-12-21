/**
 * Tokenizer for text and code processing
 * Handles tokenization, normalization, and camelCase splitting
 */

export class Tokenizer {
    private stopwords = new Set([
        // Common English stopwords
        'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
        'will', 'would', 'should', 'could', 'may', 'might', 'can', 'must',
        'and', 'or', 'but', 'not', 'nor', 'so', 'yet',
        'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'by',
        'this', 'that', 'these', 'those',
        'it', 'its', 'itself',
        // Code-specific stopwords
        'get', 'set', 'create', 'update', 'delete',
        'if', 'else', 'then', 'return', 'function', 'var', 'let', 'const',
        'new', 'null', 'undefined', 'true', 'false'
    ]);

    /**
     * Tokenize text into terms
     * - Lowercases text
     * - Removes punctuation
     * - Splits on whitespace
     * - Filters out stopwords and short terms
     */
    tokenize(text: string, options: TokenizeOptions = {}): string[] {
        const {
            removeStopwords = true,
            minLength = 2,
            splitCamelCase = false
        } = options;

        let tokens = text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')       // Remove punctuation (keep alphanumeric and whitespace)
            .replace(/\s+/g, ' ')           // Collapse multiple spaces
            .trim()
            .split(' ')
            .filter(t => t.length >= minLength);

        // Split camelCase if requested
        if (splitCamelCase) {
            tokens = tokens.flatMap(t => this.splitCamelCase(t));
        }

        // Remove stopwords if requested
        if (removeStopwords) {
            tokens = tokens.filter(t => !this.stopwords.has(t));
        }

        return tokens;
    }

    /**
     * Tokenize code identifiers (method names, class names, etc.)
     * Automatically splits camelCase and snake_case
     */
    tokenizeIdentifier(identifier: string, options: TokenizeOptions = {}): string[] {
        const {
            removeStopwords = true,
            minLength = 2
        } = options;

        // Split camelCase and snake_case
        const parts = this.splitCamelCase(identifier)
            .flatMap(part => part.split('_'))
            .map(part => part.toLowerCase())
            .filter(part => part.length >= minLength);

        // Remove stopwords if requested
        if (removeStopwords) {
            return parts.filter(p => !this.stopwords.has(p));
        }

        return parts;
    }

    /**
     * Split camelCase string into parts
     * Examples:
     *   getUserById -> [get, user, by, id]
     *   HTTPResponse -> [http, response]
     *   XMLParser -> [xml, parser]
     */
    splitCamelCase(text: string): string[] {
        // Handle consecutive capitals (e.g., HTTPResponse -> HTTP Response)
        // Then handle normal camelCase (e.g., getUserById -> get User By Id)
        return text
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')  // XMLParser -> XML Parser
            .replace(/([a-z\d])([A-Z])/g, '$1 $2')      // getUserById -> get User By Id
            .split(/\s+/)
            .map(s => s.toLowerCase())
            .filter(s => s.length > 0);
    }

    /**
     * Extract unique terms from text
     */
    extractTerms(text: string, options: TokenizeOptions = {}): Set<string> {
        return new Set(this.tokenize(text, options));
    }

    /**
     * Calculate term frequency for a text
     * Returns a map of term -> frequency
     */
    calculateTermFrequency(text: string, options: TokenizeOptions = {}): Map<string, number> {
        const tokens = this.tokenize(text, options);
        const termFreq = new Map<string, number>();

        for (const token of tokens) {
            termFreq.set(token, (termFreq.get(token) || 0) + 1);
        }

        return termFreq;
    }

    /**
     * Check if a term is a stopword
     */
    isStopword(term: string): boolean {
        return this.stopwords.has(term.toLowerCase());
    }

    /**
     * Add custom stopwords
     */
    addStopwords(words: string[]): void {
        words.forEach(word => this.stopwords.add(word.toLowerCase()));
    }

    /**
     * Remove custom stopwords
     */
    removeStopwords(words: string[]): void {
        words.forEach(word => this.stopwords.delete(word.toLowerCase()));
    }

    /**
     * Get all stopwords
     */
    getStopwords(): Set<string> {
        return new Set(this.stopwords);
    }

    /**
     * Normalize text (lowercase, remove extra whitespace)
     */
    normalize(text: string): string {
        return text
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }
}

/**
 * Options for tokenization
 */
export interface TokenizeOptions {
    removeStopwords?: boolean;  // Remove stopwords (default: true)
    minLength?: number;         // Minimum token length (default: 2)
    splitCamelCase?: boolean;   // Split camelCase identifiers (default: false)
}

/**
 * Singleton tokenizer instance
 */
export const tokenizer = new Tokenizer();
