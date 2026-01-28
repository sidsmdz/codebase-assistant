/**
 * Knowledge Base Integration Tests
 * Tests pattern storage, retrieval, search, and deletion functionality
 * with the correct API signatures
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager';

describe('Knowledge Base - Integration Tests', () => {
    let kbManager: KnowledgeBaseManager;
    const testDbPath = path.join(__dirname, '../../.test-kb-integration.db');

    // Mock vscode.ExtensionContext
    const createMockContext = (): vscode.ExtensionContext => {
        const testDir = path.join(__dirname, '../../.test-kb-storage');

        // Clean up test directory
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        fs.mkdirSync(testDir, { recursive: true });

        return {
            globalStorageUri: vscode.Uri.file(testDir),
            extensionPath: path.join(__dirname, '../../'),
            subscriptions: [],
            workspaceState: {} as any,
            globalState: {} as any,
            secrets: {} as any,
            extensionUri: vscode.Uri.file(path.join(__dirname, '../../')),
            environmentVariableCollection: {} as any,
            extensionMode: 3,
            storageUri: vscode.Uri.file(testDir),
            logUri: vscode.Uri.file(testDir),
            asAbsolutePath: (relativePath: string) => path.join(__dirname, '../../', relativePath),
            storagePath: testDir,
            globalStoragePath: testDir,
            logPath: testDir,
            extension: {} as any,
            languageModelAccessInformation: {} as any
        } as vscode.ExtensionContext;
    };

    beforeEach(async () => {
        const mockContext = createMockContext();
        kbManager = new KnowledgeBaseManager(mockContext);
        await kbManager.initialize();
    });

    afterEach(() => {
        // Clean up test files
        const testDir = path.join(__dirname, '../../.test-kb-storage');
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
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

            const saved = await kbManager.savePattern(pattern);

            expect(saved.id).toBeDefined();
            expect(saved.savedAt).toBeDefined();
            expect(saved.name).toBe(pattern.name);

            const allPatterns = await kbManager.getAllPatterns();

            console.log(`   Retrieved ${allPatterns.length} patterns`);

            expect(allPatterns.length).toBe(1);
            expect(allPatterns[0].name).toBe(pattern.name);
            expect(allPatterns[0].language).toBe(pattern.language);
            expect(allPatterns[0].tags).toEqual(pattern.tags);
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
                await kbManager.savePattern(p);
            }

            const allPatterns = await kbManager.getAllPatterns();

            console.log(`   Retrieved ${allPatterns.length} patterns:`);
            allPatterns.forEach((p, i) => {
                console.log(`   ${i + 1}. ${p.name} (${p.language})`);
            });

            expect(allPatterns.length).toBe(3);

            const javaPatterns = allPatterns.filter(p => p.language === 'java');
            const tsPatterns = allPatterns.filter(p => p.language === 'typescript');

            expect(javaPatterns.length).toBe(2);
            expect(tsPatterns.length).toBe(1);
        });

        it('should store pattern with metadata', async () => {
            const pattern = {
                name: 'OrderService',
                language: 'java',
                code: 'public class OrderService { }',
                description: 'Order service implementation',
                query: 'order service',
                tags: ['service', 'order'],
                metadata: {
                    filePath: '/path/to/OrderService.java',
                    framework: 'Spring Boot',
                    category: 'Service'
                }
            };

            console.log('\n✅ Storing pattern with metadata:', pattern.name);

            const saved = await kbManager.savePattern(pattern);

            // Retrieve through getAllPatterns since getPatternById is private
            const allPatterns = await kbManager.getAllPatterns();
            const retrieved = allPatterns.find(p => p.id === saved.id);

            console.log('   Metadata:', retrieved?.metadata);

            expect(retrieved).toBeDefined();
            expect(retrieved?.metadata).toBeDefined();
            expect(retrieved?.metadata?.filePath).toBe(pattern.metadata.filePath);
            expect(retrieved?.metadata?.framework).toBe(pattern.metadata.framework);
        });
    });

    describe('2. Pattern Search', () => {
        beforeEach(async () => {
            // Seed some patterns
            await kbManager.savePattern({
                name: 'getUserById',
                language: 'java',
                code: 'public User getUserById(Long id) { return userRepository.findById(id); }',
                description: 'Retrieves user by ID',
                query: 'get user by id',
                tags: ['service', 'user', 'repository', 'crud']
            });

            await kbManager.savePattern({
                name: 'createUser',
                language: 'java',
                code: 'public User createUser(UserRequest req) { return userRepository.save(new User(req)); }',
                description: 'Creates a new user',
                query: 'create user',
                tags: ['service', 'user', 'repository', 'crud', 'create']
            });

            await kbManager.savePattern({
                name: 'processPayment',
                language: 'java',
                code: 'public PaymentResult processPayment(PaymentRequest req) { }',
                description: 'Processes payment transaction',
                query: 'payment processing',
                tags: ['payment', 'transaction', 'service']
            });
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
            expect(results.some(r => r.name === 'processPayment')).toBe(true);
        });

        it('should find patterns using compound queries', async () => {
            console.log('\n✅ Searching for "create user"...');

            const results = await kbManager.searchPatterns('create user');

            console.log(`   Found ${results.length} results`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name}`);
            });

            // With compound query "create user", should find createUser
            const hasCreateUser = results.some(r => r.name === 'createUser');
            expect(hasCreateUser).toBe(true);
        });
    });

    describe('3. Pattern Deletion', () => {
        it('should delete a pattern by ID', async () => {
            const pattern = await kbManager.savePattern({
                name: 'tempPattern',
                language: 'java',
                code: 'public void temp() {}',
                description: 'Temporary pattern',
                query: 'temp',
                tags: ['temp']
            });

            let patterns = await kbManager.getAllPatterns();
            expect(patterns.length).toBe(1);

            const patternId = pattern.id;

            console.log(`\n✅ Deleting pattern ID: ${patternId}`);

            await kbManager.deletePattern(patternId);

            patterns = await kbManager.getAllPatterns();

            console.log(`   Remaining patterns: ${patterns.length}`);

            expect(patterns.length).toBe(0);
        });

        it('should delete multiple patterns', async () => {
            const p1 = await kbManager.savePattern({
                name: 'pattern1',
                language: 'java',
                code: 'code1',
                description: 'desc1',
                query: 'q1',
                tags: ['tag1']
            });

            const p2 = await kbManager.savePattern({
                name: 'pattern2',
                language: 'java',
                code: 'code2',
                description: 'desc2',
                query: 'q2',
                tags: ['tag2']
            });

            let patterns = await kbManager.getAllPatterns();
            expect(patterns.length).toBe(2);

            console.log('\n✅ Deleting two patterns...');

            await kbManager.deletePattern(p1.id);
            await kbManager.deletePattern(p2.id);

            patterns = await kbManager.getAllPatterns();

            console.log(`   Remaining patterns: ${patterns.length}`);

            expect(patterns.length).toBe(0);
        });
    });

    describe('4. Statistics', () => {
        it('should return accurate statistics', async () => {
            await kbManager.savePattern({
                name: 'p1',
                language: 'java',
                code: 'public void method1() {}',
                description: 'desc1',
                query: 'q1',
                tags: ['tag1', 'tag2']
            });

            await kbManager.savePattern({
                name: 'p2',
                language: 'typescript',
                code: 'function method2() {}',
                description: 'desc2',
                query: 'q2',
                tags: ['tag2', 'tag3']
            });

            await kbManager.savePattern({
                name: 'p3',
                language: 'java',
                code: 'public void method3() {}',
                description: 'desc3',
                query: 'q3',
                tags: ['tag1', 'tag3']
            });

            const stats = await kbManager.getStats();

            console.log('\n✅ Knowledge Base Statistics:');
            console.log(`   Total Patterns: ${stats.patternCount}`);
            console.log(`   AST Nodes: ${stats.astNodeCount}`);
            console.log(`   Terms: ${stats.termCount}`);

            expect(stats.patternCount).toBe(3);
        });

        it('should return detailed statistics with breakdowns', async () => {
            await kbManager.savePattern({
                name: 'p1',
                language: 'java',
                code: 'code1',
                description: 'desc1',
                query: 'q1',
                tags: ['service', 'user']
            });

            await kbManager.savePattern({
                name: 'p2',
                language: 'typescript',
                code: 'code2',
                description: 'desc2',
                query: 'q2',
                tags: ['component', 'react']
            });

            await kbManager.savePattern({
                name: 'p3',
                language: 'java',
                code: 'code3',
                description: 'desc3',
                query: 'q3',
                tags: ['service', 'payment']
            });

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

    describe('5. Incremental Indexing', () => {
        it('should track file indexing state', async () => {
            const testFilePath = '/test/path/TestFile.java';
            const fileHash = 'abc123hash';
            const modifiedTime = Date.now();

            console.log('\n✅ Testing incremental indexing...');

            // First check - should index
            let shouldIndex = await kbManager.shouldIndexFile(testFilePath, modifiedTime, fileHash);
            console.log(`   Should index new file: ${shouldIndex}`);
            expect(shouldIndex).toBe(true);

            // Mark as indexed (with 0 patterns found)
            await kbManager.markFileAsIndexed(testFilePath, modifiedTime, fileHash, 0);

            // Second check - should skip (unchanged)
            shouldIndex = await kbManager.shouldIndexFile(testFilePath, modifiedTime, fileHash);
            console.log(`   Should reindex unchanged file: ${shouldIndex}`);
            expect(shouldIndex).toBe(false);

            // Modified file - should reindex
            const newModifiedTime = modifiedTime + 1000;
            const newHash = 'xyz789newhash';
            shouldIndex = await kbManager.shouldIndexFile(testFilePath, newModifiedTime, newHash);
            console.log(`   Should reindex modified file: ${shouldIndex}`);
            expect(shouldIndex).toBe(true);
        });
    });

    describe('6. Empty Knowledge Base', () => {
        it('should handle empty knowledge base gracefully', async () => {
            console.log('\n✅ Testing empty knowledge base...');

            const patterns = await kbManager.getAllPatterns();
            const stats = await kbManager.getStats();

            console.log(`   Patterns: ${patterns.length}`);
            console.log(`   Stats:`, stats);

            expect(patterns.length).toBe(0);
            expect(stats.patternCount).toBe(0);
        });

        it('should return empty array for search in empty KB', async () => {
            console.log('\n✅ Searching empty knowledge base...');

            const results = await kbManager.searchPatterns('anything');

            console.log(`   Results: ${results.length}`);

            expect(results.length).toBe(0);
        });
    });
});
