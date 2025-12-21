/**
 * Knowledge Base Tests
 * Tests pattern storage, retrieval, and search functionality
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager';
import { IngestionService } from '../ingestionService';

describe('Knowledge Base - Storage and Retrieval', () => {
    let kbManager: KnowledgeBaseManager;
    let ingestionService: IngestionService;
    const testDbPath = path.join(__dirname, '../../.test-kb-unit.db');

    beforeEach(async () => {
        // Clean up any existing test DB
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        kbManager = new KnowledgeBaseManager(testDbPath);
        await kbManager.initialize();
        ingestionService = new IngestionService(kbManager);
    });

    afterEach(() => {
        // Clean up test DB
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    describe('1. Pattern Storage', () => {
        it('should store and retrieve a saved pattern', async () => {
            const pattern = {
                name: 'getUserById',
                language: 'java',
                code: 'public User getUserById(Long id) { return userRepository.findById(id); }',
                description: 'Retrieves user by ID from repository',
                query: 'get user by id',
                tags: ['service', 'user', 'repository']
            };

            console.log('\n✅ Storing pattern:', pattern.name);

            await kbManager.savePattern(
                pattern.name,
                pattern.language,
                pattern.code,
                pattern.description,
                pattern.query,
                pattern.tags
            );

            const savedPatterns = await kbManager.getSavedPatterns();

            console.log(`   Retrieved ${savedPatterns.length} patterns`);

            expect(savedPatterns.length).toBe(1);
            expect(savedPatterns[0].name).toBe(pattern.name);
            expect(savedPatterns[0].language).toBe(pattern.language);
            expect(savedPatterns[0].tags).toEqual(pattern.tags);
        });

        it('should store multiple patterns and retrieve all', async () => {
            const patterns = [
                {
                    name: 'createOrder',
                    language: 'java',
                    code: 'public Order createOrder(OrderRequest req) { }',
                    description: 'Creates a new order',
                    query: 'create order',
                    tags: ['service', 'order', 'create']
                },
                {
                    name: 'processPayment',
                    language: 'java',
                    code: 'public PaymentResult processPayment(Long orderId) { }',
                    description: 'Processes payment for order',
                    query: 'process payment',
                    tags: ['service', 'payment', 'transaction']
                },
                {
                    name: 'UserGrid',
                    language: 'typescript',
                    code: 'const UserGrid: React.FC = () => { }',
                    description: 'React component for user grid',
                    query: 'user grid component',
                    tags: ['react', 'component', 'grid']
                }
            ];

            console.log(`\n✅ Storing ${patterns.length} patterns...`);

            for (const p of patterns) {
                await kbManager.savePattern(p.name, p.language, p.code, p.description, p.query, p.tags);
            }

            const savedPatterns = await kbManager.getSavedPatterns();

            console.log(`   Retrieved ${savedPatterns.length} patterns:`);
            savedPatterns.forEach((p, i) => {
                console.log(`   ${i + 1}. ${p.name} (${p.language})`);
            });

            expect(savedPatterns.length).toBe(3);

            const javaPatterns = savedPatterns.filter(p => p.language === 'java');
            const tsPatterns = savedPatterns.filter(p => p.language === 'typescript');

            expect(javaPatterns.length).toBe(2);
            expect(tsPatterns.length).toBe(1);
        });
    });

    describe('2. Pattern Search', () => {
        beforeEach(async () => {
            // Seed some patterns
            await kbManager.savePattern(
                'getUserById',
                'java',
                'public User getUserById(Long id) { return userRepository.findById(id); }',
                'Retrieves user by ID',
                'get user by id',
                ['service', 'user', 'repository', 'crud']
            );

            await kbManager.savePattern(
                'createUser',
                'java',
                'public User createUser(UserRequest req) { return userRepository.save(new User(req)); }',
                'Creates a new user',
                'create user',
                ['service', 'user', 'repository', 'crud', 'create']
            );

            await kbManager.savePattern(
                'processPayment',
                'java',
                'public PaymentResult processPayment(PaymentRequest req) { }',
                'Processes payment transaction',
                'payment processing',
                ['payment', 'transaction', 'service']
            );
        });

        it('should search patterns by query term', async () => {
            console.log('\n✅ Searching for "user"...');

            const results = await kbManager.searchPatterns('user');

            console.log(`   Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name}`);
            });

            expect(results.length).toBeGreaterThanOrEqual(2);

            const hasGetUser = results.some(r => r.name === 'getUserById');
            const hasCreateUser = results.some(r => r.name === 'createUser');

            expect(hasGetUser).toBe(true);
            expect(hasCreateUser).toBe(true);
        });

        it('should search patterns by tag', async () => {
            console.log('\n✅ Searching for patterns with "payment" tag...');

            const results = await kbManager.searchPatterns('payment');

            console.log(`   Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - tags: [${r.tags.join(', ')}]`);
            });

            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results[0].name).toBe('processPayment');
        });

        it('should find patterns by partial name match', async () => {
            console.log('\n✅ Searching for "create"...');

            const results = await kbManager.searchPatterns('create');

            console.log(`   Found ${results.length} results`);

            const hasCreateUser = results.some(r => r.name === 'createUser');
            expect(hasCreateUser).toBe(true);
        });
    });

    describe('3. Pattern Deletion', () => {
        it('should delete a pattern by ID', async () => {
            await kbManager.savePattern(
                'tempPattern',
                'java',
                'public void temp() {}',
                'Temporary pattern',
                'temp',
                ['temp']
            );

            let patterns = await kbManager.getSavedPatterns();
            expect(patterns.length).toBe(1);

            const patternId = patterns[0].id;

            console.log(`\n✅ Deleting pattern ID: ${patternId}`);

            await kbManager.deletePattern(patternId);

            patterns = await kbManager.getSavedPatterns();

            console.log(`   Remaining patterns: ${patterns.length}`);

            expect(patterns.length).toBe(0);
        });
    });

    describe('4. Statistics', () => {
        it('should return accurate statistics', async () => {
            await kbManager.savePattern('p1', 'java', 'code1', 'desc1', 'q1', ['tag1', 'tag2']);
            await kbManager.savePattern('p2', 'typescript', 'code2', 'desc2', 'q2', ['tag2', 'tag3']);
            await kbManager.savePattern('p3', 'java', 'code3', 'desc3', 'q3', ['tag1', 'tag3']);

            const stats = await kbManager.getStats();

            console.log('\n✅ Knowledge Base Statistics:');
            console.log(`   Total Patterns: ${stats.patternCount}`);
            console.log(`   AST Nodes: ${stats.astNodeCount}`);
            console.log(`   Terms: ${stats.termCount}`);

            expect(stats.patternCount).toBe(3);
        });

        it('should return detailed statistics with breakdowns', async () => {
            await kbManager.savePattern('p1', 'java', 'code1', 'desc1', 'q1', ['service', 'user']);
            await kbManager.savePattern('p2', 'typescript', 'code2', 'desc2', 'q2', ['component', 'react']);
            await kbManager.savePattern('p3', 'java', 'code3', 'desc3', 'q3', ['service', 'payment']);

            const detailedStats = await kbManager.getDetailedStats();

            console.log('\n✅ Detailed Statistics:');
            console.log(`   Total Patterns: ${detailedStats.totalPatterns}`);
            console.log(`   Languages:`, detailedStats.patternsByLanguage);
            console.log(`   Top Tags:`, detailedStats.topTags.slice(0, 5));

            expect(detailedStats.totalPatterns).toBe(3);
            expect(detailedStats.patternsByLanguage['java']).toBe(2);
            expect(detailedStats.patternsByLanguage['typescript']).toBe(1);
        });
    });

    describe('5. File Indexing Integration', () => {
        it('should index a Java file and store patterns', async () => {
            const testJavaFile = path.join(__dirname, '../../test-fixtures/enterprise-erp/shared-libs/domain-models/User.java');

            if (!fs.existsSync(testJavaFile)) {
                console.log(`⚠️  Test file not found: ${testJavaFile}`);
                return;
            }

            console.log(`\n✅ Indexing Java file: ${path.basename(testJavaFile)}`);

            await ingestionService.ingestFile(testJavaFile);

            const stats = await kbManager.getStats();

            console.log(`   Indexed patterns: ${stats.patternCount}`);
            console.log(`   AST nodes: ${stats.astNodeCount}`);

            expect(stats.patternCount).toBeGreaterThan(0);
            expect(stats.astNodeCount).toBeGreaterThan(0);

            // Search for specific pattern
            const results = await kbManager.searchPatterns('User');

            console.log(`   Search "User" found: ${results.length} results`);

            expect(results.length).toBeGreaterThan(0);
        });

        it('should index a TypeScript file and store patterns', async () => {
            const testTsFile = path.join(__dirname, '../../test-fixtures/enterprise-erp/frontend/admin-portal/components/UserManagement.tsx');

            if (!fs.existsSync(testTsFile)) {
                console.log(`⚠️  Test file not found: ${testTsFile}`);
                return;
            }

            console.log(`\n✅ Indexing TypeScript file: ${path.basename(testTsFile)}`);

            await ingestionService.ingestFile(testTsFile);

            const stats = await kbManager.getStats();

            console.log(`   Indexed patterns: ${stats.patternCount}`);
            console.log(`   AST nodes: ${stats.astNodeCount}`);

            expect(stats.patternCount).toBeGreaterThan(0);

            // Search for React component patterns
            const results = await kbManager.searchPatterns('UserManagement');

            console.log(`   Search "UserManagement" found: ${results.length} results`);

            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('6. Incremental Indexing', () => {
        it('should track indexed files and skip unchanged files', async () => {
            const testFile = path.join(__dirname, '../../test-fixtures/enterprise-erp/shared-libs/utils/ValidationUtils.java');

            if (!fs.existsSync(testFile)) {
                console.log(`⚠️  Test file not found: ${testFile}`);
                return;
            }

            console.log(`\n✅ Testing incremental indexing...`);

            // First index
            await ingestionService.ingestFile(testFile);

            const stats1 = await kbManager.getStats();
            console.log(`   First index: ${stats1.patternCount} patterns`);

            // Get file stats
            const fileStats = fs.statSync(testFile);
            const content = fs.readFileSync(testFile, 'utf-8');
            const crypto = require('crypto');
            const fileHash = crypto.createHash('sha256').update(content).digest('hex');

            // Check if file should be reindexed (it shouldn't)
            const shouldReindex = await kbManager.shouldIndexFile(
                testFile,
                fileStats.mtimeMs,
                fileHash
            );

            console.log(`   Should reindex unchanged file: ${shouldReindex}`);

            expect(shouldReindex).toBe(false);

            // Simulate file change by using different hash
            const shouldReindexModified = await kbManager.shouldIndexFile(
                testFile,
                fileStats.mtimeMs + 1000,
                'different-hash'
            );

            console.log(`   Should reindex modified file: ${shouldReindexModified}`);

            expect(shouldReindexModified).toBe(true);
        });
    });

    describe('7. Pattern Metadata', () => {
        it('should store and retrieve pattern metadata', async () => {
            const metadata = {
                filePath: '/path/to/file.java',
                lineNumber: 42,
                framework: 'Spring Boot',
                category: 'Service'
            };

            await kbManager.savePattern(
                'getUserById',
                'java',
                'public User getUserById(Long id) {}',
                'Get user by ID',
                'get user',
                ['service', 'user'],
                metadata
            );

            const patterns = await kbManager.getSavedPatterns();

            console.log('\n✅ Pattern with metadata:');
            console.log(`   Name: ${patterns[0].name}`);
            console.log(`   Metadata:`, patterns[0].metadata);

            expect(patterns[0].metadata).toBeDefined();
            expect(patterns[0].metadata?.filePath).toBe(metadata.filePath);
            expect(patterns[0].metadata?.lineNumber).toBe(metadata.lineNumber);
        });
    });
});
