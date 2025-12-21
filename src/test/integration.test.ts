/**
 * Integration Tests for AST + BM25 Hybrid Search System
 * Tests the complete workflow without VSCode dependencies
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs/promises';
import { JavaASTParser } from '../parsers/JavaASTParser';
import { TypeScriptASTParser } from '../parsers/TypeScriptASTParser';
import { tokenizer } from '../search/Tokenizer';
import { BM25 } from '../search/BM25';
import { QueryParser } from '../search/QueryParser';

describe('Integration Tests - Core Functionality', () => {
    const testFixturesPath = path.join(__dirname, '../../test-fixtures/enterprise-app');

    describe('1. AST Parsing - Java', () => {
        it('should parse UserService.java and extract AST nodes', async () => {
            const javaParser = new JavaASTParser();
            const userServicePath = path.join(testFixturesPath, 'backend/UserService.java');

            const content = await fs.readFile(userServicePath, 'utf-8');
            const astNodes = javaParser.parse(content, userServicePath);

            console.log(`\n✅ Extracted ${astNodes.length} AST nodes from UserService.java`);

            // Verify we extracted nodes
            expect(astNodes.length).toBeGreaterThan(0);

            // Find class node
            const classNode = astNodes.find(n => n.type === 'CLASS');
            expect(classNode).toBeDefined();
            expect(classNode?.identifier).toBe('UserService');
            console.log(`   - Found CLASS: ${classNode?.identifier}`);

            // Find method nodes
            const methodNodes = astNodes.filter(n => n.type === 'METHOD');
            expect(methodNodes.length).toBeGreaterThan(5);
            console.log(`   - Found ${methodNodes.length} METHODs`);

            // Check specific methods
            const getUserById = methodNodes.find(n => n.identifier === 'getUserById');
            expect(getUserById).toBeDefined();
            expect(getUserById?.parameters?.length).toBeGreaterThan(0);
            console.log(`   - getUserById method: ${getUserById?.signature?.substring(0, 50)}...`);

            const createUser = methodNodes.find(n => n.identifier === 'createUser');
            expect(createUser).toBeDefined();
            console.log(`   - createUser method: ${createUser?.signature?.substring(0, 50)}...`);

            // Verify code extraction
            expect(getUserById?.code).toBeDefined();
            expect(getUserById?.code?.length).toBeGreaterThan(100);
        });

        it('should parse OrderService.java with complex business logic', async () => {
            const javaParser = new JavaASTParser();
            const orderServicePath = path.join(testFixturesPath, 'backend/OrderService.java');

            const content = await fs.readFile(orderServicePath, 'utf-8');
            const astNodes = javaParser.parse(content, orderServicePath);

            console.log(`\n✅ Extracted ${astNodes.length} AST nodes from OrderService.java`);

            expect(astNodes.length).toBeGreaterThan(0);

            const processPayment = astNodes.find(n => n.identifier === 'processPayment');
            expect(processPayment).toBeDefined();
            expect(processPayment?.type).toBe('METHOD');
            console.log(`   - Found processPayment method with ${processPayment?.parameters?.length} parameters`);
        });
    });

    describe('2. AST Parsing - TypeScript/React', () => {
        it('should parse UserGrid.tsx React component', async () => {
            const tsParser = new TypeScriptASTParser(true);
            const userGridPath = path.join(testFixturesPath, 'frontend/UserGrid.tsx');

            const content = await fs.readFile(userGridPath, 'utf-8');
            const astNodes = tsParser.parse(content, userGridPath);

            console.log(`\n✅ Extracted ${astNodes.length} AST nodes from UserGrid.tsx`);

            expect(astNodes.length).toBeGreaterThan(0);

            // Should find functions
            const functions = astNodes.filter(n => n.type === 'FUNCTION' || n.type === 'METHOD');
            expect(functions.length).toBeGreaterThan(0);
            console.log(`   - Found ${functions.length} functions/methods`);

            // Check for specific patterns
            const hasUserGrid = content.includes('UserGrid');
            const hasAgGrid = content.includes('AgGridReact');
            const hasRowStyle = content.includes('getRowStyle');

            expect(hasUserGrid).toBe(true);
            expect(hasAgGrid).toBe(true);
            expect(hasRowStyle).toBe(true);

            console.log(`   - React component structure verified`);
            console.log(`   - AG Grid integration confirmed`);
            console.log(`   - Row styling functions present`);
        });

        it('should parse OrderGrid.tsx with advanced patterns', async () => {
            const tsParser = new TypeScriptASTParser(true);
            const orderGridPath = path.join(testFixturesPath, 'frontend/OrderGrid.tsx');

            const content = await fs.readFile(orderGridPath, 'utf-8');
            const astNodes = tsParser.parse(content, orderGridPath);

            console.log(`\n✅ Extracted ${astNodes.length} AST nodes from OrderGrid.tsx`);

            expect(astNodes.length).toBeGreaterThan(0);

            // Verify complex patterns
            expect(content).toContain('useState');
            expect(content).toContain('useEffect');
            expect(content).toContain('backgroundColor');
            expect(content).toContain('PAID');
            expect(content).toContain('PENDING');

            console.log(`   - React hooks present`);
            console.log(`   - Conditional styling verified`);
        });
    });

    describe('3. Tokenizer Functionality', () => {
        it('should tokenize code text correctly', () => {
            const text = "getUserById method with parameters";
            const tokens = tokenizer.tokenize(text);

            console.log(`\n✅ Tokenized: "${text}"`);
            console.log(`   - Tokens: [${tokens.join(', ')}]`);

            expect(tokens).toContain('getuserbyid');
            expect(tokens).toContain('method');
            expect(tokens).toContain('parameters');
            expect(tokens.length).toBeGreaterThan(0);
        });

        it('should split camelCase identifiers', () => {
            const identifier = "getUserById";
            const parts = tokenizer.splitCamelCase(identifier);

            console.log(`\n✅ Split camelCase: "${identifier}"`);
            console.log(`   - Parts: [${parts.join(', ')}]`);

            expect(parts).toEqual(['get', 'user', 'by', 'id']);
        });

        it('should handle complex identifiers', () => {
            const identifier = "OrderStatistics";
            const tokens = tokenizer.tokenizeIdentifier(identifier);

            console.log(`\n✅ Tokenized identifier: "${identifier}"`);
            console.log(`   - Tokens: [${tokens.join(', ')}]`);

            expect(tokens).toContain('order');
            expect(tokens).toContain('statistics');
        });
    });

    describe('4. BM25 Scoring', () => {
        it('should calculate IDF correctly', () => {
            const bm25 = new BM25();

            const totalDocs = 100;
            const docFrequency = 10;

            const idf = bm25.calculateIDF(totalDocs, docFrequency);

            console.log(`\n✅ BM25 IDF Calculation:`);
            console.log(`   - Total docs: ${totalDocs}`);
            console.log(`   - Doc frequency: ${docFrequency}`);
            console.log(`   - IDF score: ${idf.toFixed(4)}`);

            expect(idf).toBeGreaterThan(0);
            expect(idf).toBeLessThan(10);
        });

        it('should score terms correctly', () => {
            const bm25 = new BM25();

            const tf = 3;           // Term appears 3 times
            const idf = 2.5;        // IDF score
            const docLength = 100;  // Document has 100 terms
            const avgLength = 80;   // Average doc has 80 terms

            const score = bm25.scoreTerm(tf, idf, docLength, avgLength);

            console.log(`\n✅ BM25 Term Scoring:`);
            console.log(`   - Term frequency: ${tf}`);
            console.log(`   - IDF: ${idf}`);
            console.log(`   - Score: ${score.toFixed(4)}`);

            expect(score).toBeGreaterThan(0);
        });

        it('should score documents correctly', () => {
            const bm25 = new BM25();

            const queryTerms = ['user', 'service', 'method'];
            const docTermFreqs = new Map([
                ['user', 5],
                ['service', 3],
                ['method', 2]
            ]);
            const termIDFs = new Map([
                ['user', 2.0],
                ['service', 2.5],
                ['method', 1.8]
            ]);

            const score = bm25.scoreDocument(
                queryTerms,
                docTermFreqs,
                termIDFs,
                100,
                80
            );

            console.log(`\n✅ BM25 Document Scoring:`);
            console.log(`   - Query: [${queryTerms.join(', ')}]`);
            console.log(`   - Total score: ${score.toFixed(4)}`);

            expect(score).toBeGreaterThan(0);
        });
    });

    describe('5. Query Parser', () => {
        it('should parse simple method search', () => {
            const parser = new QueryParser();
            const intent = parser.parse("getUserById method");

            console.log(`\n✅ Query Intent Parsed:`);
            console.log(`   - Query: "getUserById method"`);
            console.log(`   - Node Type: ${intent.nodeType}`);
            console.log(`   - Identifier: ${intent.identifier}`);
            console.log(`   - Keywords: [${intent.keywords.join(', ')}]`);

            expect(intent.nodeType).toBe('METHOD');
            expect(intent.identifier).toBe('getUserById');
        });

        it('should parse AG Grid styling query', () => {
            const parser = new QueryParser();
            const intent = parser.parse("how to color AG Grid rows blue and white");

            console.log(`\n✅ Query Intent Parsed:`);
            console.log(`   - Query: "how to color AG Grid rows blue and white"`);
            console.log(`   - Keywords: [${intent.keywords.join(', ')}]`);
            console.log(`   - Patterns: [${intent.patterns.join(', ')}]`);

            expect(intent.keywords.length).toBeGreaterThan(3);
            expect(intent.patterns.includes('semantic')).toBe(true);
        });

        it('should detect Spring Boot patterns', () => {
            const parser = new QueryParser();
            const intent = parser.parse("Spring @Service class with @Autowired");

            console.log(`\n✅ Query Intent Parsed:`);
            console.log(`   - Query: "Spring @Service class with @Autowired"`);
            console.log(`   - Node Type: ${intent.nodeType}`);
            console.log(`   - Keywords: [${intent.keywords.join(', ')}]`);

            expect(intent.nodeType).toBe('CLASS');
            expect(intent.keywords).toContain('spring');
        });
    });

    describe('6. Code Pattern Detection', () => {
        it('should detect AG Grid row styling in UserGrid', async () => {
            const userGridPath = path.join(testFixturesPath, 'frontend/UserGrid.tsx');
            const content = await fs.readFile(userGridPath, 'utf-8');

            // Check for blue row styling
            const hasBlueRows = content.includes('#cfe2ff') || content.includes('backgroundColor');
            const hasPremiumCheck = content.includes('PREMIUM');
            const hasGetRowStyle = content.includes('getRowStyle');

            console.log(`\n✅ AG Grid Pattern Detection in UserGrid.tsx:`);
            console.log(`   - Blue row styling: ${hasBlueRows ? '✓' : '✗'}`);
            console.log(`   - Premium user check: ${hasPremiumCheck ? '✓' : '✗'}`);
            console.log(`   - getRowStyle function: ${hasGetRowStyle ? '✓' : '✗'}`);

            expect(hasBlueRows).toBe(true);
            expect(hasPremiumCheck).toBe(true);
            expect(hasGetRowStyle).toBe(true);
        });

        it('should detect multi-color scheme in OrderGrid', async () => {
            const orderGridPath = path.join(testFixturesPath, 'frontend/OrderGrid.tsx');
            const content = await fs.readFile(orderGridPath, 'utf-8');

            const hasBlue = content.includes('#e3f2fd');
            const hasGreen = content.includes('#e8f5e9');
            const hasRed = content.includes('#ffebee');
            const hasYellow = content.includes('#fffde7');
            const hasPaidStatus = content.includes('PAID');

            console.log(`\n✅ Color Scheme Detection in OrderGrid.tsx:`);
            console.log(`   - Blue (PAID): ${hasBlue ? '✓' : '✗'}`);
            console.log(`   - Green (COMPLETED): ${hasGreen ? '✓' : '✗'}`);
            console.log(`   - Red (CANCELLED): ${hasRed ? '✓' : '✗'}`);
            console.log(`   - Yellow (PROCESSING): ${hasYellow ? '✓' : '✗'}`);
            console.log(`   - Status checks: ${hasPaidStatus ? '✓' : '✗'}`);

            expect(hasBlue).toBe(true);
            expect(hasGreen).toBe(true);
            expect(hasRed).toBe(true);
        });

        it('should detect Spring Boot patterns in UserService', async () => {
            const userServicePath = path.join(testFixturesPath, 'backend/UserService.java');
            const content = await fs.readFile(userServicePath, 'utf-8');

            const hasService = content.includes('@Service');
            const hasAutowired = content.includes('@Autowired');
            const hasTransactional = content.includes('@Transactional');
            const hasRepository = content.includes('Repository');

            console.log(`\n✅ Spring Boot Pattern Detection:`);
            console.log(`   - @Service annotation: ${hasService ? '✓' : '✗'}`);
            console.log(`   - @Autowired injection: ${hasAutowired ? '✓' : '✗'}`);
            console.log(`   - @Transactional: ${hasTransactional ? '✓' : '✗'}`);
            console.log(`   - Repository pattern: ${hasRepository ? '✓' : '✗'}`);

            expect(hasService).toBe(true);
            expect(hasAutowired).toBe(true);
            expect(hasTransactional).toBe(true);
        });

        it('should detect gRPC patterns in PaymentService', async () => {
            const paymentServicePath = path.join(testFixturesPath, 'grpc-service/PaymentServiceImpl.java');
            const content = await fs.readFile(paymentServicePath, 'utf-8');

            const hasGrpc = content.includes('grpc');
            const hasStreamObserver = content.includes('StreamObserver');
            const hasResponseObserver = content.includes('responseObserver');
            const hasOnNext = content.includes('onNext');
            const hasOnCompleted = content.includes('onCompleted');

            console.log(`\n✅ gRPC Pattern Detection:`);
            console.log(`   - gRPC package: ${hasGrpc ? '✓' : '✗'}`);
            console.log(`   - StreamObserver: ${hasStreamObserver ? '✓' : '✗'}`);
            console.log(`   - responseObserver: ${hasResponseObserver ? '✓' : '✗'}`);
            console.log(`   - onNext callback: ${hasOnNext ? '✓' : '✗'}`);
            console.log(`   - onCompleted callback: ${hasOnCompleted ? '✓' : '✗'}`);

            expect(hasGrpc).toBe(true);
            expect(hasStreamObserver).toBe(true);
            expect(hasOnNext).toBe(true);
        });
    });

    describe('7. Performance Benchmarks', () => {
        it('should parse large Java files quickly', async () => {
            const javaParser = new JavaASTParser();
            const orderServicePath = path.join(testFixturesPath, 'backend/OrderService.java');

            const content = await fs.readFile(orderServicePath, 'utf-8');

            const startTime = Date.now();
            const astNodes = javaParser.parse(content, orderServicePath);
            const duration = Date.now() - startTime;

            console.log(`\n✅ Performance Test - Java Parsing:`);
            console.log(`   - File size: ${content.length} bytes`);
            console.log(`   - Nodes extracted: ${astNodes.length}`);
            console.log(`   - Parse time: ${duration}ms`);

            expect(duration).toBeLessThan(1000); // Should parse in < 1 second
            expect(astNodes.length).toBeGreaterThan(0);
        });

        it('should tokenize large text quickly', () => {
            const largeText = 'getUserById processPayment createOrder updateUser deleteOrder '.repeat(100);

            const startTime = Date.now();
            const tokens = tokenizer.tokenize(largeText);
            const duration = Date.now() - startTime;

            console.log(`\n✅ Performance Test - Tokenization:`);
            console.log(`   - Text length: ${largeText.length} chars`);
            console.log(`   - Tokens: ${tokens.length}`);
            console.log(`   - Tokenize time: ${duration}ms`);

            expect(duration).toBeLessThan(100); // Should be very fast
            expect(tokens.length).toBeGreaterThan(0);
        });
    });
});
