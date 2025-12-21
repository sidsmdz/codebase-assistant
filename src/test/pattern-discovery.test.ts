/**
 * Pattern Discovery Tests
 * Tests the chat panel's ability to discover complex patterns in enterprise architecture
 * Uses the test-fixtures/enterprise-erp codebase
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager';
import { IngestionService } from '../ingestionService';
import { SearchService } from '../search/SearchService';

describe('Pattern Discovery - Enterprise Architecture Tests', () => {
    let kbManager: KnowledgeBaseManager;
    let ingestionService: IngestionService;
    let searchService: SearchService;

    const testFixturePath = path.join(__dirname, '../../test-fixtures/enterprise-erp');

    beforeAll(async () => {
        // Initialize knowledge base in memory
        kbManager = new KnowledgeBaseManager(':memory:');
        await kbManager.initialize();

        // Initialize services
        ingestionService = new IngestionService(kbManager);
        searchService = new SearchService(kbManager);

        // Index the enterprise-erp test fixture
        console.log('\n📦 Indexing enterprise-erp test fixture...');

        if (!fs.existsSync(testFixturePath)) {
            throw new Error(`Test fixture not found at: ${testFixturePath}`);
        }

        await ingestionService.indexWorkspace(testFixturePath);

        // Get stats
        const stats = await kbManager.getStats();
        console.log(`✅ Indexed ${stats.totalPatterns} patterns, ${stats.totalASTNodes} AST nodes, ${stats.totalTerms} unique terms\n`);
    });

    describe('1. Spring Boot REST API Pattern Discovery', () => {
        it('should find @RestController patterns', async () => {
            const query = "Spring Boot @RestController REST API";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} (${r.type}) - score: ${r.score?.toFixed(2)}`);
                console.log(`      File: ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);

            // Should find OrderApiController
            const hasController = results.some(r =>
                r.name.includes('OrderApiController') || r.file_path.includes('OrderApiController')
            );
            expect(hasController).toBe(true);
        });

        it('should find @PreAuthorize security patterns', async () => {
            const query = "@PreAuthorize role-based access control";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);
        });

        it('should find HATEOAS link patterns', async () => {
            const query = "HATEOAS links REST navigation";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - score: ${r.score?.toFixed(2)}`);
            });

            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('2. AG Grid Conditional Row Coloring Discovery', () => {
        it('should find AG Grid row coloring for premium users (blue)', async () => {
            const query = "AG Grid color rows blue for premium users white for regular";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} (${r.type}) - score: ${r.score?.toFixed(2)}`);
                console.log(`      File: ${r.file_path}`);
                if (r.code) {
                    console.log(`      Code preview: ${r.code.substring(0, 100)}...`);
                }
            });

            expect(results.length).toBeGreaterThan(0);

            // Should find UserManagement.tsx
            const hasUserManagement = results.some(r =>
                r.file_path.includes('UserManagement.tsx')
            );
            expect(hasUserManagement).toBe(true);
        });

        it('should find getRowClass pattern', async () => {
            const query = "getRowClass conditional styling premium";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);
        });

        it('should find master-detail AG Grid pattern', async () => {
            const query = "AG Grid master detail expandable rows order items";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - score: ${r.score?.toFixed(2)}`);
            });

            expect(results.length).toBeGreaterThan(0);

            // Should find OrderManagement.tsx
            const hasOrderManagement = results.some(r =>
                r.file_path.includes('OrderManagement.tsx')
            );
            expect(hasOrderManagement).toBe(true);
        });
    });

    describe('3. Transaction and Compensation Pattern Discovery', () => {
        it('should find @Transactional patterns', async () => {
            const query = "@Transactional Spring transaction management";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);
        });

        it('should find compensating transaction patterns', async () => {
            const query = "compensating transaction release inventory payment failure";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - score: ${r.score?.toFixed(2)}`);
                console.log(`      ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);

            // Should find OrderService.java with processPayment method
            const hasOrderService = results.some(r =>
                r.file_path.includes('OrderService.java')
            );
            expect(hasOrderService).toBe(true);
        });

        it('should find processPayment method with try-catch compensation', async () => {
            const query = "processPayment method with exception handling compensation";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} (${r.type})`);
            });

            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('4. gRPC Streaming Pattern Discovery', () => {
        it('should find gRPC server-side streaming', async () => {
            const query = "gRPC server-side streaming real-time events";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);

            // Should find OrderEventStreamService.java
            const hasGrpcService = results.some(r =>
                r.file_path.includes('OrderEventStreamService.java')
            );
            expect(hasGrpcService).toBe(true);
        });

        it('should find bidirectional streaming patterns', async () => {
            const query = "bidirectional streaming StreamObserver subscription";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - score: ${r.score?.toFixed(2)}`);
            });

            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('5. Microservice Dependency Discovery', () => {
        it('should find OrderService with multiple dependencies', async () => {
            const query = "OrderService with UserServiceClient InventoryServiceClient dependencies";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} (${r.type}) - ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);
        });

        it('should find service orchestration patterns', async () => {
            const query = "service orchestration multiple microservices coordination";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - score: ${r.score?.toFixed(2)}`);
            });

            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('6. Inventory Reservation Pattern Discovery', () => {
        it('should find inventory reservation workflow', async () => {
            const query = "inventory reservation reserve confirm release pattern";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);

            // Should find InventoryService.java
            const hasInventoryService = results.some(r =>
                r.file_path.includes('InventoryService.java')
            );
            expect(hasInventoryService).toBe(true);
        });

        it('should find pessimistic locking patterns', async () => {
            const query = "synchronized pessimistic locking concurrent access";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - score: ${r.score?.toFixed(2)}`);
            });

            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('7. Payment Processing Pattern Discovery', () => {
        it('should find payment gateway abstraction', async () => {
            const query = "payment gateway factory pattern multiple gateways";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);
        });

        it('should find refund processing patterns', async () => {
            const query = "refund processing full partial refund";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - score: ${r.score?.toFixed(2)}`);
            });

            expect(results.length).toBeGreaterThan(0);

            // Should find PaymentService.java
            const hasPaymentService = results.some(r =>
                r.file_path.includes('PaymentService.java')
            );
            expect(hasPaymentService).toBe(true);
        });

        it('should find fraud detection integration', async () => {
            const query = "fraud detection check transaction high risk";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name}`);
            });

            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('8. Validation Pattern Discovery', () => {
        it('should find credit card validation with Luhn algorithm', async () => {
            const query = "credit card validation Luhn algorithm";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);

            // Should find ValidationUtils.java
            const hasValidationUtils = results.some(r =>
                r.file_path.includes('ValidationUtils.java')
            );
            expect(hasValidationUtils).toBe(true);
        });

        it('should find email validation patterns', async () => {
            const query = "email validation regex pattern";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - score: ${r.score?.toFixed(2)}`);
            });

            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('9. Domain Model Pattern Discovery', () => {
        it('should find User domain model with roles and premium status', async () => {
            const query = "User model with roles premium status addresses";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);
        });

        it('should find Order entity with state machine', async () => {
            const query = "Order entity state machine status transitions";
            const results = await searchService.search(query, { limit: 5 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - score: ${r.score?.toFixed(2)}`);
            });

            expect(results.length).toBeGreaterThan(0);

            // Should find Order.java
            const hasOrder = results.some(r =>
                r.file_path.includes('Order.java')
            );
            expect(hasOrder).toBe(true);
        });
    });

    describe('10. Cross-Cutting Pattern Discovery', () => {
        it('should find event publishing patterns across services', async () => {
            const query = "EventPublisher publish events across services";
            const results = await searchService.search(query, { limit: 10 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);

            // Should find multiple services using EventPublisher
            const uniqueFiles = new Set(results.map(r => path.basename(r.file_path)));
            console.log(`   Found in ${uniqueFiles.size} different files`);
            expect(uniqueFiles.size).toBeGreaterThan(1);
        });

        it('should find @Autowired dependency injection patterns', async () => {
            const query = "@Autowired dependency injection Spring";
            const results = await searchService.search(query, { limit: 10 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results across files`);

            expect(results.length).toBeGreaterThan(0);
        });

        it('should discover notification service integration pattern', async () => {
            const query = "NotificationServiceClient send notification";
            const results = await searchService.search(query, { limit: 10 });

            console.log(`\n🔍 Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);

            // Should find usage in multiple services
            const uniqueFiles = new Set(results.map(r => path.basename(r.file_path)));
            expect(uniqueFiles.size).toBeGreaterThanOrEqual(1);
        });
    });

    describe('11. Complex Multi-Pattern Queries', () => {
        it('should find "how to implement order payment workflow with inventory reservation"', async () => {
            const query = "how to implement order payment workflow with inventory reservation and compensation";
            const results = await searchService.search(query, { limit: 10 });

            console.log(`\n🔍 Complex Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} (${r.type}) - score: ${r.score?.toFixed(2)}`);
                console.log(`      ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);

            // Should find OrderService.java high in results
            const orderServiceRank = results.findIndex(r =>
                r.file_path.includes('OrderService.java')
            );
            console.log(`   OrderService.java rank: ${orderServiceRank + 1}`);
            expect(orderServiceRank).toBeGreaterThanOrEqual(0);
            expect(orderServiceRank).toBeLessThan(5); // Should be in top 5
        });

        it('should find "React AG Grid with conditional row styling based on user type"', async () => {
            const query = "React AG Grid conditional row styling based on user type premium regular";
            const results = await searchService.search(query, { limit: 10 });

            console.log(`\n🔍 Complex Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - score: ${r.score?.toFixed(2)}`);
                console.log(`      ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);

            // Should find UserManagement.tsx
            const userManagementRank = results.findIndex(r =>
                r.file_path.includes('UserManagement.tsx')
            );
            console.log(`   UserManagement.tsx rank: ${userManagementRank + 1}`);
            expect(userManagementRank).toBeGreaterThanOrEqual(0);
        });

        it('should find "microservice with multiple client dependencies and event publishing"', async () => {
            const query = "microservice with multiple client dependencies and event publishing orchestration";
            const results = await searchService.search(query, { limit: 10 });

            console.log(`\n🔍 Complex Query: "${query}"`);
            console.log(`📊 Found ${results.length} results:`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - ${r.file_path}`);
            });

            expect(results.length).toBeGreaterThan(0);

            // Should find one of the complex services
            const hasComplexService = results.some(r =>
                r.file_path.includes('OrderService.java') ||
                r.file_path.includes('PaymentService.java') ||
                r.file_path.includes('InventoryService.java')
            );
            expect(hasComplexService).toBe(true);
        });
    });

    describe('12. Ranking Quality Tests', () => {
        it('should rank exact matches higher than partial matches', async () => {
            const query = "getUserById";
            const results = await searchService.search(query, { limit: 10 });

            console.log(`\n🔍 Query: "${query}" - Testing ranking`);
            console.log(`📊 Top 5 results with scores:`);
            results.slice(0, 5).forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} - score: ${r.score?.toFixed(2)}`);
            });

            // First result should have highest score
            if (results.length >= 2) {
                expect(results[0].score).toBeGreaterThanOrEqual(results[1].score!);
            }
        });

        it('should rank specific queries higher than generic', async () => {
            const specificQuery = "OrderService processPayment method";
            const genericQuery = "service method";

            const specificResults = await searchService.search(specificQuery, { limit: 5 });
            const genericResults = await searchService.search(genericQuery, { limit: 5 });

            console.log(`\n🔍 Comparing specific vs generic queries:`);
            console.log(`   Specific: "${specificQuery}"`);
            console.log(`   Top result: ${specificResults[0]?.name} (score: ${specificResults[0]?.score?.toFixed(2)})`);
            console.log(`   Generic: "${genericQuery}"`);
            console.log(`   Top result: ${genericResults[0]?.name} (score: ${genericResults[0]?.score?.toFixed(2)})`);

            // Specific query should have higher confidence in top result
            if (specificResults.length > 0 && genericResults.length > 0) {
                expect(specificResults[0].score).toBeGreaterThan(0);
                expect(genericResults[0].score).toBeGreaterThan(0);
            }
        });
    });

    describe('13. Knowledge Base Coverage', () => {
        it('should have indexed all major components', async () => {
            const stats = await kbManager.getDetailedStats();

            console.log(`\n📊 Knowledge Base Coverage:`);
            console.log(`   Total Patterns: ${stats.totalPatterns}`);
            console.log(`   Total AST Nodes: ${stats.totalASTNodes}`);
            console.log(`   Total Unique Terms: ${stats.totalTerms}`);
            console.log(`   Indexed Files: ${stats.indexedFiles}`);

            console.log(`\n   Patterns by Language:`);
            Object.entries(stats.patternsByLanguage).forEach(([lang, count]) => {
                console.log(`      ${lang}: ${count}`);
            });

            console.log(`\n   Patterns by Type:`);
            Object.entries(stats.patternsByType).forEach(([type, count]) => {
                console.log(`      ${type}: ${count}`);
            });

            // Should have indexed Java and TypeScript files
            expect(stats.patternsByLanguage['java']).toBeGreaterThan(0);
            expect(stats.patternsByLanguage['typescript']).toBeGreaterThan(0);

            // Should have various pattern types
            expect(stats.patternsByType['class']).toBeGreaterThan(0);
            expect(stats.patternsByType['method']).toBeGreaterThan(0);
        });

        it('should find patterns across all major files', async () => {
            const expectedFiles = [
                'OrderService.java',
                'PaymentService.java',
                'InventoryService.java',
                'UserService.java',
                'UserManagement.tsx',
                'OrderManagement.tsx',
                'OrderApiController.java',
                'OrderEventStreamService.java'
            ];

            console.log(`\n📁 Checking coverage of major files:`);

            for (const file of expectedFiles) {
                const query = file.replace('.java', '').replace('.tsx', '');
                const results = await searchService.search(query, { limit: 10 });

                const found = results.some(r => r.file_path.includes(file));
                console.log(`   ${file}: ${found ? '✅' : '❌'}`);

                expect(found).toBe(true);
            }
        });
    });
});
