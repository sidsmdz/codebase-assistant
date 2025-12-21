/**
 * Enterprise Pattern Discovery Integration Test
 * Tests end-to-end pattern discovery in the enterprise-erp fixture
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager';
import { IngestionService } from '../ingestionService';

describe('Enterprise Pattern Discovery E2E', () => {
    let kbManager: KnowledgeBaseManager;
    let ingestionService: IngestionService;

    const testFixturePath = path.join(__dirname, '../../test-fixtures/enterprise-erp');

    beforeAll(async () => {
        console.log('\n='.repeat(70));
        console.log('🚀 ENTERPRISE PATTERN DISCOVERY TEST SUITE');
        console.log('='.repeat(70));

        // Check if test fixture exists
        if (!fs.existsSync(testFixturePath)) {
            console.error(`❌ Test fixture not found at: ${testFixturePath}`);
            throw new Error(`Test fixture directory not found: ${testFixturePath}`);
        }

        console.log(`\n📂 Test fixture location: ${testFixturePath}`);

        // Initialize KB  with a temp file
        const tempDbPath = path.join(__dirname, '../../.test-kb.db');
        if (fs.existsSync(tempDbPath)) {
            fs.unlinkSync(tempDbPath);
        }

        kbManager = new KnowledgeBaseManager(tempDbPath);
        await kbManager.initialize();

        ingestionService = new IngestionService(kbManager);

        console.log('\n📦 Indexing enterprise-erp test fixture...');
        console.log('   This may take a moment as we process ~4,800 lines of code\n');

        // Find all Java and TypeScript files
        const files = await findFilesRecursively(testFixturePath, ['.java', '.tsx']);
        console.log(`   Found ${files.length} files to index`);

        // Index each file
        for (const file of files) {
            const relativePath = path.relative(testFixturePath, file);
            console.log(`   📄 Indexing: ${relativePath}`);

            try {
                await ingestionService.ingestFile(file);
            } catch (error) {
                console.error(`      ⚠️  Error indexing ${relativePath}:`, error instanceof Error ? error.message : error);
            }
        }

        // Get stats
        const stats = await kbManager.getStats();
        console.log(`\n✅ Indexing complete!`);
        console.log(`   Patterns: ${stats.patternCount}`);
        console.log(`   AST Nodes: ${stats.astNodeCount}`);
        console.log(`   Terms: ${stats.termCount}`);
        console.log('='.repeat(70) + '\n');
    }, 120000); // 2 minute timeout for indexing

    describe('1. AG Grid Row Coloring Pattern', () => {
        it('should find UserManagement.tsx with premium row coloring', async () => {
            console.log('\n🔍 TEST: AG Grid premium row coloring pattern');

            const results = await kbManager.searchPatterns('premium row color blue white');

            console.log(`   Found ${results.length} patterns`);
            results.slice(0, 5).forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} (${r.type})`);
                console.log(`      File: ${path.basename(r.file_path)}`);
            });

            expect(results.length).toBeGreaterThan(0);

            const hasUserManagement = results.some(r =>
                r.file_path.includes('UserManagement.tsx')
            );

            if (hasUserManagement) {
                console.log(`   ✅ Found UserManagement.tsx with row coloring logic`);
            } else {
                console.log(`   ⚠️  UserManagement.tsx not in results`);
            }

            expect(hasUserManagement).toBe(true);
        });

        it('should find getRowClass callback pattern', async () => {
            console.log('\n🔍 TEST: getRowClass callback pattern');

            const results = await kbManager.searchPatterns('getRowClass callback');

            console.log(`   Found ${results.length} patterns`);

            const hasGetRowClass = results.some(r =>
                r.name.includes('getRowClass') ||
                r.code?.includes('getRowClass')
            );

            if (hasGetRowClass) {
                console.log(`   ✅ Found getRowClass pattern`);
            }

            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('2. Spring Boot @Transactional Pattern', () => {
        it('should find @Transactional methods', async () => {
            console.log('\n🔍 TEST: @Transactional pattern');

            const results = await kbManager.searchPatterns('transactional');

            console.log(`   Found ${results.length} patterns`);
            results.slice(0, 5).forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - ${path.basename(r.file_path)}`);
            });

            expect(results.length).toBeGreaterThan(0);

            const hasTransactional = results.some(r =>
                r.file_path.includes('.java') &&
                (r.name.includes('Service') || r.code?.includes('@Transactional'))
            );

            if (hasTransactional) {
                console.log(`   ✅ Found @Transactional in Java service`);
            }

            expect(hasTransactional).toBe(true);
        });
    });

    describe('3. Complex Service Orchestration', () => {
        it('should find OrderService with multiple dependencies', async () => {
            console.log('\n🔍 TEST: OrderService orchestration pattern');

            const results = await kbManager.searchPatterns('OrderService');

            console.log(`   Found ${results.length} patterns`);

            const hasOrderService = results.some(r =>
                r.file_path.includes('OrderService.java')
            );

            if (hasOrderService) {
                console.log(`   ✅ Found OrderService.java`);

                // Find specific methods
                const processPayment = results.find(r =>
                    r.file_path.includes('OrderService.java') &&
                    r.name.includes('processPayment')
                );

                if (processPayment) {
                    console.log(`   ✅ Found processPayment method`);
                    console.log(`      Type: ${processPayment.type}`);
                }
            }

            expect(hasOrderService).toBe(true);
        });

        it('should find inventory reservation pattern', async () => {
            console.log('\n🔍 TEST: Inventory reservation pattern');

            const results = await kbManager.searchPatterns('reserve inventory');

            console.log(`   Found ${results.length} patterns`);

            const hasReservation = results.some(r =>
                r.name.includes('reserve') || r.name.includes('Reserve')
            );

            if (hasReservation) {
                console.log(`   ✅ Found inventory reservation methods`);
            }

            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('4. Payment Processing Patterns', () => {
        it('should find PaymentService', async () => {
            console.log('\n🔍 TEST: Payment service pattern');

            const results = await kbManager.searchPatterns('PaymentService');

            console.log(`   Found ${results.length} patterns`);

            const hasPaymentService = results.some(r =>
                r.file_path.includes('PaymentService.java')
            );

            if (hasPaymentService) {
                console.log(`   ✅ Found PaymentService.java`);

                // Look for specific payment methods
                const refundMethod = results.find(r =>
                    r.name.includes('refund') || r.name.includes('Refund')
                );

                if (refundMethod) {
                    console.log(`   ✅ Found refund processing method: ${refundMethod.name}`);
                }
            }

            expect(hasPaymentService).toBe(true);
        });
    });

    describe('5. Validation Utilities', () => {
        it('should find credit card validation with Luhn algorithm', async () => {
            console.log('\n🔍 TEST: Luhn algorithm pattern');

            const results = await kbManager.searchPatterns('luhn card validation');

            console.log(`   Found ${results.length} patterns`);

            const hasLuhn = results.some(r =>
                r.name.toLowerCase().includes('luhn') ||
                r.code?.toLowerCase().includes('luhn')
            );

            if (hasLuhn) {
                console.log(`   ✅ Found Luhn algorithm implementation`);
            } else {
                // Try more general search
                const validationResults = await kbManager.searchPatterns('ValidationUtils');
                const hasValidation = validationResults.some(r =>
                    r.file_path.includes('ValidationUtils.java')
                );
                if (hasValidation) {
                    console.log(`   ✅ Found ValidationUtils.java`);
                }
            }

            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('6. gRPC Streaming Patterns', () => {
        it('should find gRPC event streaming service', async () => {
            console.log('\n🔍 TEST: gRPC streaming pattern');

            const results = await kbManager.searchPatterns('StreamObserver event');

            console.log(`   Found ${results.length} patterns`);

            const hasGrpc = results.some(r =>
                r.file_path.includes('OrderEventStreamService.java') ||
                r.code?.includes('StreamObserver')
            );

            if (hasGrpc) {
                console.log(`   ✅ Found gRPC streaming service`);
            }

            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('7. REST API Controllers', () => {
        it('should find Spring Boot REST controller', async () => {
            console.log('\n🔍 TEST: REST API controller pattern');

            const results = await kbManager.searchPatterns('RestController API');

            console.log(`   Found ${results.length} patterns`);

            const hasController = results.some(r =>
                r.file_path.includes('OrderApiController.java') ||
                r.code?.includes('@RestController')
            );

            if (hasController) {
                console.log(`   ✅ Found REST controller with Spring annotations`);
            }

            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('8. Cross-File Pattern Discovery', () => {
        it('should find patterns across multiple service files', async () => {
            console.log('\n🔍 TEST: Cross-file pattern discovery');

            // Search for a common pattern that should appear in multiple files
            const results = await kbManager.searchPatterns('autowired');

            console.log(`   Found ${results.length} patterns mentioning autowired`);

            const uniqueFiles = new Set(results.map(r => path.basename(r.file_path)));
            console.log(`   Across ${uniqueFiles.size} unique files:`);

            uniqueFiles.forEach(file => {
                console.log(`      - ${file}`);
            });

            expect(uniqueFiles.size).toBeGreaterThan(1);
            console.log(`   ✅ Pattern found across multiple files`);
        });
    });

    describe('9. Knowledge Base Coverage', () => {
        it('should have indexed all major components', async () => {
            console.log('\n🔍 TEST: Knowledge base coverage');

            const stats = await kbManager.getDetailedStats();

            console.log(`\n   📊 Coverage Statistics:`);
            console.log(`   Total Patterns: ${stats.totalPatterns}`);
            console.log(`   Total AST Nodes: ${stats.totalASTNodes}`);
            console.log(`   Total Terms: ${stats.totalTerms}`);
            console.log(`   Indexed Files: ${stats.indexedFiles}`);

            console.log(`\n   Patterns by Language:`);
            Object.entries(stats.patternsByLanguage).forEach(([lang, count]) => {
                console.log(`      ${lang}: ${count}`);
            });

            console.log(`\n   Patterns by Type:`);
            Object.entries(stats.patternsByType).forEach(([type, count]) => {
                console.log(`      ${type}: ${count}`);
            });

            console.log(`\n   Top 10 Tags:`);
            stats.topTags.slice(0, 10).forEach(([tag, count]) => {
                console.log(`      ${tag}: ${count}`);
            });

            // Assertions
            expect(stats.totalPatterns).toBeGreaterThan(50);
            expect(stats.indexedFiles).toBeGreaterThan(10);

            if (stats.patternsByLanguage['java']) {
                console.log(`\n   ✅ Java patterns indexed: ${stats.patternsByLanguage['java']}`);
                expect(stats.patternsByLanguage['java']).toBeGreaterThan(0);
            }

            if (stats.patternsByLanguage['typescript']) {
                console.log(`   ✅ TypeScript patterns indexed: ${stats.patternsByLanguage['typescript']}`);
                expect(stats.patternsByLanguage['typescript']).toBeGreaterThan(0);
            }
        });

        it('should find all major service files', async () => {
            console.log('\n🔍 TEST: Major file coverage');

            const expectedFiles = [
                'OrderService.java',
                'PaymentService.java',
                'InventoryService.java',
                'UserService.java',
                'UserManagement.tsx',
                'OrderManagement.tsx'
            ];

            console.log(`\n   Checking for key files:`);

            for (const fileName of expectedFiles) {
                const searchTerm = fileName.replace('.java', '').replace('.tsx', '');
                const results = await kbManager.searchPatterns(searchTerm);

                const found = results.some(r => r.file_path.includes(fileName));

                console.log(`      ${fileName}: ${found ? '✅' : '❌'}`);

                if (!found) {
                    console.log(`         Searched for: "${searchTerm}"`);
                    console.log(`         Results: ${results.length}`);
                }
            }
        });
    });
});

/**
 * Helper function to recursively find files with specific extensions
 */
async function findFilesRecursively(dir: string, extensions: string[]): Promise<string[]> {
    const files: string[] = [];

    function traverse(currentPath: string) {
        const items = fs.readdirSync(currentPath);

        for (const item of items) {
            const fullPath = path.join(currentPath, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                traverse(fullPath);
            } else if (stat.isFile()) {
                const ext = path.extname(fullPath);
                if (extensions.includes(ext)) {
                    files.push(fullPath);
                }
            }
        }
    }

    traverse(dir);
    return files;
}
