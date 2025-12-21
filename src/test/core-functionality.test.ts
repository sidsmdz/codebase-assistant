/**
 * Core Functionality Tests - No External Module Dependencies
 * Tests the search components that power the AST + BM25 system
 */

import { describe, it, expect } from '@jest/globals';
import { tokenizer } from '../search/Tokenizer';
import { BM25 } from '../search/BM25';
import { QueryParser } from '../search/QueryParser';

describe('Core Search System - Unit Tests', () => {

    describe('1. Tokenizer', () => {
        it('should tokenize simple text', () => {
            const text = "getUserById method with parameters";
            const tokens = tokenizer.tokenize(text);

            console.log(`\n✅ Tokenized: "${text}"`);
            console.log(`   Tokens: [${tokens.join(', ')}]`);

            expect(tokens).toContain('getuserbyid');
            expect(tokens).toContain('method');
            expect(tokens).toContain('parameters');
            expect(tokens.length).toBeGreaterThan(0);
        });

        it('should split camelCase identifiers correctly', () => {
            const identifier = "getUserById";
            const parts = tokenizer.splitCamelCase(identifier);

            console.log(`\n✅ Split camelCase: "${identifier}" → [${parts.join(', ')}]`);

            expect(parts).toEqual(['get', 'user', 'by', 'id']);
        });

        it('should handle complex camelCase', () => {
            const cases = [
                { input: "OrderStatistics", expected: ['order', 'statistics'] },
                { input: "PaymentServiceImpl", expected: ['payment', 'service', 'impl'] },
                { input: "UserGrid", expected: ['user', 'grid'] },
            ];

            console.log(`\n✅ Complex camelCase splitting:`);
            cases.forEach(({ input, expected }) => {
                const result = tokenizer.splitCamelCase(input);
                console.log(`   ${input} → [${result.join(', ')}]`);
                expect(result).toEqual(expected);
            });
        });

        it('should tokenize identifiers with stopword removal', () => {
            const identifier = "getUserById";
            const tokens = tokenizer.tokenizeIdentifier(identifier);

            console.log(`\n✅ Tokenized identifier: "${identifier}" → [${tokens.join(', ')}]`);

            expect(tokens).toContain('user');
            expect(tokens).toContain('id');
            expect(tokens).not.toContain('get'); // 'get' is a stopword
        });

        it('should calculate term frequency correctly', () => {
            const text = "user user service service service method";
            const termFreq = tokenizer.calculateTermFrequency(text);

            console.log(`\n✅ Term frequency for: "${text}"`);
            console.log(`   user: ${termFreq.get('user')}`);
            console.log(`   service: ${termFreq.get('service')}`);
            console.log(`   method: ${termFreq.get('method')}`);

            expect(termFreq.get('user')).toBe(2);
            expect(termFreq.get('service')).toBe(3);
            expect(termFreq.get('method')).toBe(1);
        });

        it('should remove stopwords', () => {
            const text = "the user is a good example";
            const tokens = tokenizer.tokenize(text, { removeStopwords: true });

            console.log(`\n✅ Stopword removal: "${text}"`);
            console.log(`   Tokens: [${tokens.join(', ')}]`);

            expect(tokens).toContain('user');
            expect(tokens).toContain('good');
            expect(tokens).toContain('example');
            expect(tokens).not.toContain('the');
            expect(tokens).not.toContain('is');
            expect(tokens).not.toContain('a');
        });
    });

    describe('2. BM25 Algorithm', () => {
        it('should calculate IDF correctly', () => {
            const bm25 = new BM25();

            const testCases = [
                { totalDocs: 100, docFreq: 10, description: "common term" },
                { totalDocs: 100, docFreq: 1, description: "rare term" },
                { totalDocs: 100, docFreq: 50, description: "medium frequency" },
            ];

            console.log(`\n✅ BM25 IDF Calculation:`);
            testCases.forEach(({ totalDocs, docFreq, description }) => {
                const idf = bm25.calculateIDF(totalDocs, docFreq);
                console.log(`   ${description} (df=${docFreq}/${totalDocs}): IDF = ${idf.toFixed(4)}`);
                expect(idf).toBeGreaterThan(0);
            });
        });

        it('should score terms with BM25 formula', () => {
            const bm25 = new BM25();

            const testCases = [
                { tf: 1, idf: 2.0, docLen: 100, avgLen: 100, desc: "single occurrence, avg length" },
                { tf: 5, idf: 2.0, docLen: 100, avgLen: 100, desc: "multiple occurrences" },
                { tf: 3, idf: 4.0, docLen: 50, avgLen: 100, desc: "short doc, rare term" },
            ];

            console.log(`\n✅ BM25 Term Scoring:`);
            testCases.forEach(({ tf, idf, docLen, avgLen, desc }) => {
                const score = bm25.scoreTerm(tf, idf, docLen, avgLen);
                console.log(`   ${desc}: score = ${score.toFixed(4)}`);
                expect(score).toBeGreaterThan(0);
            });
        });

        it('should score documents with multiple query terms', () => {
            const bm25 = new BM25();

            const queryTerms = ['user', 'service', 'method'];
            const docTermFreqs = new Map([
                ['user', 5],
                ['service', 3],
                ['method', 2],
                ['other', 10] // not in query
            ]);
            const termIDFs = new Map([
                ['user', 2.0],
                ['service', 2.5],
                ['method', 1.8],
            ]);

            const score = bm25.scoreDocument(
                queryTerms,
                docTermFreqs,
                termIDFs,
                100, // doc length
                80   // avg length
            );

            console.log(`\n✅ BM25 Document Scoring:`);
            console.log(`   Query: [${queryTerms.join(', ')}]`);
            console.log(`   Document has: user:5, service:3, method:2`);
            console.log(`   Total score: ${score.toFixed(4)}`);

            expect(score).toBeGreaterThan(0);
            expect(score).toBeLessThan(100); // Reasonable upper bound
        });

        it('should use configurable k1 and b parameters', () => {
            const bm25Default = new BM25();
            const bm25Custom = new BM25({ k1: 2.0, b: 0.5 });

            const params1 = bm25Default.getParams();
            const params2 = bm25Custom.getParams();

            console.log(`\n✅ BM25 Parameters:`);
            console.log(`   Default: k1=${params1.k1}, b=${params1.b}`);
            console.log(`   Custom: k1=${params2.k1}, b=${params2.b}`);

            expect(params1.k1).toBe(1.5);
            expect(params1.b).toBe(0.75);
            expect(params2.k1).toBe(2.0);
            expect(params2.b).toBe(0.5);
        });
    });

    describe('3. Query Parser', () => {
        it('should parse method search queries', () => {
            const parser = new QueryParser();
            const testCases = [
                { query: "getUserById method", expectedType: "METHOD", expectedId: "getUserById" },
                { query: "createOrder function", expectedType: "FUNCTION", expectedId: "createOrder" },
                { query: "processPayment method", expectedType: "METHOD", expectedId: "processPayment" },
            ];

            console.log(`\n✅ Method Query Parsing:`);
            testCases.forEach(({ query, expectedType, expectedId }) => {
                const intent = parser.parse(query);
                console.log(`   "${query}" → type:${intent.nodeType}, id:${intent.identifier}`);
                expect(intent.nodeType).toBe(expectedType);
                expect(intent.identifier).toBe(expectedId);
            });
        });

        it('should parse class search queries', () => {
            const parser = new QueryParser();
            const queries = [
                "UserService class",
                "OrderService class",
                "PaymentServiceImpl class"
            ];

            console.log(`\n✅ Class Query Parsing:`);
            queries.forEach(query => {
                const intent = parser.parse(query);
                console.log(`   "${query}" → type:${intent.nodeType}, keywords:[${intent.keywords.join(', ')}]`);
                expect(intent.nodeType).toBe('CLASS');
            });
        });

        it('should extract keywords from natural language queries', () => {
            const parser = new QueryParser();
            const query = "how to color AG Grid rows blue and white";

            const intent = parser.parse(query);

            console.log(`\n✅ Natural Language Query:`);
            console.log(`   Query: "${query}"`);
            console.log(`   Keywords: [${intent.keywords.join(', ')}]`);
            console.log(`   Patterns: [${intent.patterns.join(', ')}]`);

            expect(intent.keywords.length).toBeGreaterThan(3);
            expect(intent.keywords).toContain('color');
            expect(intent.keywords).toContain('grid');
            expect(intent.keywords).toContain('rows');
        });

        it('should detect query patterns', () => {
            const parser = new QueryParser();
            const testCases = [
                { query: "getUserById", patterns: ['exact_match', 'fuzzy_match'] },
                { query: "find user authentication logic", patterns: ['semantic', 'fuzzy_match'] },
                { query: "method that takes string and returns user", patterns: ['signature', 'semantic', 'fuzzy_match'] },
            ];

            console.log(`\n✅ Query Pattern Detection:`);
            testCases.forEach(({ query, patterns }) => {
                const intent = parser.parse(query);
                console.log(`   "${query}"`);
                console.log(`      Patterns: [${intent.patterns.join(', ')}]`);

                patterns.forEach(p => {
                    expect(intent.patterns).toContain(p);
                });
            });
        });

        it('should generate search variations for fuzzy matching', () => {
            const parser = new QueryParser();
            const identifiers = [
                "getUserById",
                "OrderStatistics",
                "processPayment"
            ];

            console.log(`\n✅ Search Variations for Fuzzy Matching:`);
            identifiers.forEach(id => {
                const variations = parser.generateSearchVariations(id);
                console.log(`   ${id} → [${variations.join(', ')}]`);
                expect(variations.length).toBeGreaterThan(1);
            });
        });

        it('should detect language hints in queries', () => {
            const parser = new QueryParser();
            const testCases = [
                { query: "java getUserById method", expectedLang: "java" },
                { query: "typescript UserGrid component", expectedLang: "typescript" },
                { query: "javascript arrow function", expectedLang: "javascript" },
            ];

            console.log(`\n✅ Language Detection:`);
            testCases.forEach(({ query, expectedLang }) => {
                const intent = parser.parse(query);
                console.log(`   "${query}" → language:${intent.language}`);
                expect(intent.language).toBe(expectedLang);
            });
        });
    });

    describe('4. System Integration', () => {
        it('should handle AG Grid coloring query workflow', () => {
            const parser = new QueryParser();
            const query = "how to color AG Grid rows blue for premium users and white for regular users";

            const intent = parser.parse(query);
            const queryTerms = tokenizer.tokenize(query);

            console.log(`\n✅ AG Grid Query Workflow:`);
            console.log(`   Original: "${query}"`);
            console.log(`   Keywords: [${intent.keywords.join(', ')}]`);
            console.log(`   Query terms: [${queryTerms.join(', ')}]`);
            console.log(`   Patterns: [${intent.patterns.join(', ')}]`);

            expect(intent.keywords).toContain('color');
            expect(intent.keywords).toContain('grid');
            expect(queryTerms.length).toBeGreaterThan(5);
        });

        it('should handle Spring Boot service query workflow', () => {
            const parser = new QueryParser();
            const query = "Spring @Service class with @Autowired dependencies";

            const intent = parser.parse(query);

            console.log(`\n✅ Spring Boot Query Workflow:`);
            console.log(`   Original: "${query}"`);
            console.log(`   Node Type: ${intent.nodeType}`);
            console.log(`   Keywords: [${intent.keywords.join(', ')}]`);

            expect(intent.nodeType).toBe('CLASS');
            expect(intent.keywords).toContain('spring');
        });

        it('should process complete search pipeline', () => {
            const parser = new QueryParser();
            const bm25 = new BM25();

            // 1. Parse query
            const query = "getUserById method implementation";
            const intent = parser.parse(query);

            // 2. Tokenize
            const queryTerms = tokenizer.tokenize(query);

            // 3. Simulate document matching
            const docTermFreqs = new Map([
                ['getuserbyid', 3],
                ['method', 2],
                ['implementation', 1],
                ['user', 5],
            ]);

            const termIDFs = new Map([
                ['getuserbyid', 4.0], // Rare, specific
                ['method', 1.5],      // Common
                ['implementation', 2.0],
                ['user', 1.0],
            ]);

            // 4. Calculate BM25 score
            const score = bm25.scoreDocument(
                queryTerms,
                docTermFreqs,
                termIDFs,
                100,
                80
            );

            console.log(`\n✅ Complete Search Pipeline:`);
            console.log(`   1. Query: "${query}"`);
            console.log(`   2. Intent: type=${intent.nodeType}, id=${intent.identifier}`);
            console.log(`   3. Terms: [${queryTerms.join(', ')}]`);
            console.log(`   4. BM25 Score: ${score.toFixed(4)}`);

            expect(score).toBeGreaterThan(0);
        });
    });

    describe('5. Performance', () => {
        it('should tokenize large text efficiently', () => {
            const largeText = 'getUserById processPayment createOrder updateUser deleteOrder validateInput sanitizeData '.repeat(1000);

            const startTime = Date.now();
            const tokens = tokenizer.tokenize(largeText);
            const duration = Date.now() - startTime;

            console.log(`\n✅ Tokenization Performance:`);
            console.log(`   Text size: ${largeText.length} characters`);
            console.log(`   Tokens: ${tokens.length}`);
            console.log(`   Time: ${duration}ms`);
            console.log(`   Rate: ${(largeText.length / duration).toFixed(0)} chars/ms`);

            expect(duration).toBeLessThan(100); // Should be very fast
            expect(tokens.length).toBeGreaterThan(0);
        });

        it('should calculate BM25 scores efficiently', () => {
            const bm25 = new BM25();

            // Simulate 1000 document scorings
            const startTime = Date.now();

            for (let i = 0; i < 1000; i++) {
                const score = bm25.scoreDocument(
                    ['user', 'service', 'method'],
                    new Map([['user', 2], ['service', 3], ['method', 1]]),
                    new Map([['user', 2.0], ['service', 2.5], ['method', 1.8]]),
                    100,
                    80
                );
                expect(score).toBeGreaterThan(0);
            }

            const duration = Date.now() - startTime;

            console.log(`\n✅ BM25 Scoring Performance:`);
            console.log(`   Documents scored: 1000`);
            console.log(`   Total time: ${duration}ms`);
            console.log(`   Average: ${(duration / 1000).toFixed(2)}ms per document`);

            expect(duration).toBeLessThan(1000); // Should score 1000 docs in < 1 second
        });
    });
});
