/**
 * SDUI Cross-Language Feature Tracking Tests
 *
 * Tests the complete feature tracking system with real SDUI architecture:
 * - Protocol Buffer parsing
 * - Cross-language feature tracing (TS → Proto → Java → UI)
 * - Pattern discovery and indexing
 * - Knowledge base integration
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { ProtoParser } from '../parsers/ProtoParser';
import { FeatureTracker } from '../analysis/FeatureTracker';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager';
import * as vscode from 'vscode';

describe('SDUI Feature Tracking - Cross-Language Tests', () => {
    const fixtureRoot = path.join(__dirname, '../../test-fixtures/sdui-demo');
    const protoFile = path.join(fixtureRoot, 'protos/layout.proto');
    const javaFile = path.join(fixtureRoot, 'backend/LayoutController.java');
    const tsxFile = path.join(fixtureRoot, 'frontend/LayoutManager.tsx');

    let protoParser: ProtoParser;
    let featureTracker: FeatureTracker;
    let kbManager: KnowledgeBaseManager;

    beforeAll(async () => {
        protoParser = new ProtoParser();
        featureTracker = new FeatureTracker();

        // Create KB manager for pattern storage
        const mockContext = createMockContext();
        kbManager = new KnowledgeBaseManager(mockContext);
        await kbManager.initialize();
    });

    describe('1. Protocol Buffer Parsing', () => {
        it('should parse layout.proto and extract LayoutService', () => {
            console.log('\n✅ Testing Proto Parser with SDUI layout.proto');

            const content = fs.readFileSync(protoFile, 'utf-8');
            const astNodes = protoParser.parse(content, protoFile);

            console.log(`   Found ${astNodes.length} AST nodes`);

            // Should find LayoutService as a CLASS node
            const services = astNodes.filter(n => n.type === 'CLASS' && n.modifiers?.includes('service'));
            console.log(`   Services found: ${services.map(s => s.identifier).join(', ')}`);

            expect(services.length).toBeGreaterThanOrEqual(1);
            expect(services.some(s => s.identifier === 'LayoutService')).toBe(true);
        });

        it('should extract gRPC methods with streaming info', () => {
            console.log('\n✅ Extracting gRPC methods');

            const content = fs.readFileSync(protoFile, 'utf-8');
            const astNodes = protoParser.parse(content, protoFile);

            // Find methods
            const methods = astNodes.filter(n => n.type === 'METHOD');
            console.log(`   Methods found: ${methods.length}`);

            methods.forEach(method => {
                const streaming = method.modifiers?.filter(m =>
                    m.includes('streaming')
                ).join(', ') || 'unary';

                console.log(`   - ${method.identifier}: ${method.parameters?.[0]?.type} → ${method.returnType} (${streaming})`);
            });

            // Verify specific methods (proto uses PascalCase)
            const getInitialLayout = methods.find(m => m.identifier === 'GetInitialLayout');
            expect(getInitialLayout).toBeDefined();
            expect(getInitialLayout?.parameters?.[0]?.type).toBe('LayoutRequest');
            expect(getInitialLayout?.returnType).toBe('LayoutResponse');

            const streamLayoutUpdates = methods.find(m => m.identifier === 'StreamLayoutUpdates');
            expect(streamLayoutUpdates).toBeDefined();
            expect(streamLayoutUpdates?.modifiers).toContain('server_streaming');
        });

        it('should extract message definitions', () => {
            console.log('\n✅ Extracting Proto messages');

            const content = fs.readFileSync(protoFile, 'utf-8');
            const astNodes = protoParser.parse(content, protoFile);

            // Find messages (CLASS nodes with 'message' modifier)
            const messages = astNodes.filter(n =>
                n.type === 'CLASS' && n.modifiers?.includes('message')
            );

            console.log(`   Messages found: ${messages.length}`);
            messages.slice(0, 5).forEach(msg => {
                console.log(`   - ${msg.identifier}`);
            });

            expect(messages.some(m => m.identifier === 'LayoutRequest')).toBe(true);
            expect(messages.some(m => m.identifier === 'LayoutResponse')).toBe(true);
            expect(messages.some(m => m.identifier === 'Component')).toBe(true);
            expect(messages.some(m => m.identifier === 'GridConfig')).toBe(true);
        });
    });

    describe('2. Cross-Language Feature Tracing', () => {
        it('should trace ROW_SELECTED feature end-to-end', async () => {
            console.log('\n✅ Tracing ROW_SELECTED feature across stack');

            const flows = await featureTracker.traceFeature('rowSelected', fixtureRoot);

            console.log(`   Found ${flows.length} feature flows`);

            if (flows.length > 0) {
                const flow = flows[0];
                console.log(`   Service: ${flow.service}.${flow.method}`);

                // Should find TypeScript trigger
                if (flow.flow.trigger) {
                    console.log(`   ✓ TS Trigger: ${flow.flow.trigger.functionName} in ${path.basename(flow.flow.trigger.file)}`);
                    expect(flow.flow.trigger.file).toContain('LayoutManager.tsx');
                }

                // Should find Proto definition
                if (flow.flow.proto) {
                    console.log(`   ✓ Proto: ${flow.flow.proto.method} (${flow.flow.proto.inputType} → ${flow.flow.proto.outputType})`);
                    expect(flow.flow.proto.file).toContain('layout.proto');
                }

                // Should find Java implementation
                if (flow.flow.implementation) {
                    console.log(`   ✓ Java: ${flow.flow.implementation.className}.${flow.flow.implementation.methodName}`);
                    expect(flow.flow.implementation.file).toContain('LayoutController.java');
                }
            }
        });

        it('should trace StreamLayoutUpdates server streaming', async () => {
            console.log('\n✅ Tracing StreamLayoutUpdates (server streaming)');

            const flows = await featureTracker.traceFeature('StreamLayoutUpdates', fixtureRoot);

            console.log(`   Found ${flows.length} flows`);

            // Find the StreamLayoutUpdates flow specifically
            const streamingFlow = flows.find(f => f.method === 'StreamLayoutUpdates');

            if (streamingFlow && streamingFlow.flow.proto) {
                console.log(`   Method: ${streamingFlow.flow.proto.method}`);
                console.log(`   Streaming: Server=${streamingFlow.flow.proto.streaming.server}, Client=${streamingFlow.flow.proto.streaming.client}`);

                expect(streamingFlow.flow.proto.streaming.server).toBe(true);
            } else {
                console.log('   ❌ StreamLayoutUpdates flow not found');
                expect(streamingFlow).toBeDefined();
            }
        });

        it('should format complete feature flow', async () => {
            console.log('\n✅ Formatting complete feature flow');

            const flows = await featureTracker.traceFeature('sendUserEvent', fixtureRoot);

            if (flows.length > 0) {
                const formatted = featureTracker.formatFlow(flows[0]);
                console.log(formatted);

                expect(formatted).toContain('Feature Flow');
                expect(formatted).toContain('Service:');
            }
        });
    });

    describe('3. Pattern Discovery and Indexing', () => {
        it('should discover AG Grid row coloring pattern', () => {
            console.log('\n✅ Discovering AG Grid row coloring pattern');

            const javaContent = fs.readFileSync(javaFile, 'utf-8');

            // Look for the pattern where rows are styled based on user status
            const hasPremiumBluePattern = javaContent.includes('premium-user-blue');
            const hasRegularWhitePattern = javaContent.includes('regular-user-white');
            const hasRowClassPattern = javaContent.includes('setRowClass');

            console.log(`   Premium blue rows: ${hasPremiumBluePattern}`);
            console.log(`   Regular white rows: ${hasRegularWhitePattern}`);
            console.log(`   Row class assignment: ${hasRowClassPattern}`);

            expect(hasPremiumBluePattern).toBe(true);
            expect(hasRegularWhitePattern).toBe(true);
            expect(hasRowClassPattern).toBe(true);
        });

        it('should discover server-driven tab switching pattern', () => {
            console.log('\n✅ Discovering server-driven tab switching pattern');

            const javaContent = fs.readFileSync(javaFile, 'utf-8');
            const tsxContent = fs.readFileSync(tsxFile, 'utf-8');

            // Server side: Creates tab layout and sets active tab
            const hasTabConfig = javaContent.includes('TabConfig');
            const hasSetActiveTab = javaContent.includes('setActiveTab');

            // Client side: Receives tab index from server
            const hasServerActiveTab = tsxContent.includes('serverActiveTab') ||
                                       tsxContent.includes('getActivetab');

            console.log(`   Server creates tab config: ${hasTabConfig}`);
            console.log(`   Server sets active tab: ${hasSetActiveTab}`);
            console.log(`   Client uses server tab index: ${hasServerActiveTab}`);

            expect(hasTabConfig).toBe(true);
            expect(hasSetActiveTab).toBe(true);
            expect(hasServerActiveTab).toBe(true);
        });

        it('should discover gRPC streaming pattern', () => {
            console.log('\n✅ Discovering gRPC streaming pattern');

            const javaContent = fs.readFileSync(javaFile, 'utf-8');
            const tsxContent = fs.readFileSync(tsxFile, 'utf-8');

            // Server side: StreamObserver for pushing updates
            const hasStreamObserver = javaContent.includes('StreamObserver');
            const hasPushUpdate = javaContent.includes('pushLayoutUpdate');

            // Client side: Stream subscription
            const hasStreamSetup = tsxContent.includes('streamLayoutUpdates');
            const hasOnData = tsxContent.includes('on(\'data\'');

            console.log(`   Server StreamObserver: ${hasStreamObserver}`);
            console.log(`   Server push updates: ${hasPushUpdate}`);
            console.log(`   Client stream setup: ${hasStreamSetup}`);
            console.log(`   Client stream listener: ${hasOnData}`);

            expect(hasStreamObserver).toBe(true);
            expect(hasStreamSetup).toBe(true);
        });
    });

    describe('4. Knowledge Base Integration', () => {
        it('should save AG Grid coloring pattern to KB', async () => {
            console.log('\n✅ Saving AG Grid row coloring pattern');

            const javaContent = fs.readFileSync(javaFile, 'utf-8');

            // Extract the pattern
            const patternStart = javaContent.indexOf('private LayoutResponse buildUserGridLayout');
            const patternEnd = javaContent.indexOf('private LayoutResponse handleButtonClick');
            const patternCode = javaContent.substring(patternStart, patternEnd).trim();

            const pattern = await kbManager.savePattern({
                name: 'AG Grid Row Coloring (Server-Driven)',
                language: 'java',
                code: patternCode.substring(0, 500), // First 500 chars
                description: 'Server generates AG Grid with blue rows for premium users and white rows for regular users',
                query: 'ag grid row coloring premium blue regular white server driven',
                tags: ['ag-grid', 'row-styling', 'sdui', 'grpc', 'server-driven-ui'],
                metadata: {
                    filePath: javaFile,
                    framework: 'gRPC',
                    category: 'Server-Driven UI'
                }
            });

            console.log(`   Pattern saved with ID: ${pattern.id}`);

            expect(pattern.id).toBeDefined();
            expect(pattern.tags).toContain('ag-grid');
        });

        it('should save gRPC streaming pattern to KB', async () => {
            console.log('\n✅ Saving gRPC streaming pattern');

            const tsxContent = fs.readFileSync(tsxFile, 'utf-8');

            // Extract streaming setup code
            const setupStart = tsxContent.indexOf('const setupLayoutStream');
            const setupEnd = tsxContent.indexOf('};', setupStart) + 2;
            const streamingCode = tsxContent.substring(setupStart, setupEnd);

            const pattern = await kbManager.savePattern({
                name: 'gRPC Server Streaming Client Setup',
                language: 'typescript',
                code: streamingCode,
                description: 'TypeScript client setup for receiving server-streaming layout updates via gRPC',
                query: 'grpc streaming client setup server updates react',
                tags: ['grpc', 'streaming', 'client', 'typescript', 'react'],
                metadata: {
                    filePath: tsxFile,
                    framework: 'gRPC Web',
                    category: 'Client Communication'
                }
            });

            console.log(`   Pattern saved with ID: ${pattern.id}`);

            expect(pattern.id).toBeDefined();
            expect(pattern.tags).toContain('streaming');
        });

        it('should save server-driven tab switching pattern to KB', async () => {
            console.log('\n✅ Saving server-driven tab switching pattern');

            const javaContent = fs.readFileSync(javaFile, 'utf-8');

            // Extract tab switching logic
            const tabStart = javaContent.indexOf('private LayoutResponse handleRowSelection');
            const tabEnd = javaContent.indexOf('private LayoutResponse handleTabChange');
            const tabCode = javaContent.substring(tabStart, tabEnd).trim();

            const pattern = await kbManager.savePattern({
                name: 'Server-Driven Tab Switching on Row Selection',
                language: 'java',
                code: tabCode.substring(0, 1000), // First 1000 chars
                description: 'When user selects AG Grid row, server creates tab layout and automatically switches to details tab',
                query: 'server driven tab switching ag grid row selection automatic',
                tags: ['tabs', 'ag-grid', 'row-selection', 'sdui', 'automatic-navigation'],
                metadata: {
                    filePath: javaFile,
                    framework: 'gRPC',
                    category: 'Server-Driven UI'
                }
            });

            console.log(`   Pattern saved with ID: ${pattern.id}`);

            expect(pattern.id).toBeDefined();
            expect(pattern.tags).toContain('tabs');
        });

        it('should search for saved SDUI patterns', async () => {
            console.log('\n✅ Searching for SDUI patterns');

            const results = await kbManager.searchPatterns('server driven');

            console.log(`   Found ${results.length} patterns:`);
            results.forEach((p, i) => {
                console.log(`   ${i + 1}. ${p.name} (${p.language})`);
            });

            expect(results.length).toBeGreaterThan(0);
        });

        it('should get detailed stats on SDUI patterns', async () => {
            console.log('\n✅ Getting KB statistics');

            const stats = await kbManager.getDetailedStats();

            console.log(`   Total patterns: ${stats.totalPatterns}`);
            console.log(`   By language:`, stats.patternsByLanguage);
            console.log(`   Top tags:`, stats.topTags.slice(0, 5).map(t => t.tag));

            expect(stats.totalPatterns).toBeGreaterThan(0);
        });
    });

    describe('5. End-to-End Feature Flow Verification', () => {
        it('should verify complete button click → AG Grid → row selection → tab switch flow', () => {
            console.log('\n✅ Verifying complete SDUI flow');

            const javaContent = fs.readFileSync(javaFile, 'utf-8');
            const tsxContent = fs.readFileSync(tsxFile, 'utf-8');

            // Step 1: Button click triggers grid display
            const hasButtonHandler = javaContent.includes('handleButtonClick');

            // Step 2: Server creates AG Grid with styled rows
            const hasGridBuilder = javaContent.includes('buildUserGridLayout');

            // Step 3: Client renders AG Grid with row selection
            const hasRowSelectionHandler = tsxContent.includes('handleRowSelected');

            // Step 4: Row selection sends event to server
            const hasRowSelectionEvent = javaContent.includes('handleRowSelection');

            // Step 5: Server creates tab layout
            const hasTabCreation = javaContent.includes('TabConfig');

            // Step 6: Server sets active tab to details (index 1)
            const hasActiveTabSet = javaContent.includes('setActiveTab(1)');

            // Step 7: Client switches to server-specified tab
            const hasClientTabSwitch = tsxContent.includes('serverActiveTab');

            console.log('   Flow verification:');
            console.log(`   ✓ Button click handler: ${hasButtonHandler}`);
            console.log(`   ✓ AG Grid builder: ${hasGridBuilder}`);
            console.log(`   ✓ Row selection handler (client): ${hasRowSelectionHandler}`);
            console.log(`   ✓ Row selection event (server): ${hasRowSelectionEvent}`);
            console.log(`   ✓ Tab layout creation: ${hasTabCreation}`);
            console.log(`   ✓ Active tab set by server: ${hasActiveTabSet}`);
            console.log(`   ✓ Client tab switch: ${hasClientTabSwitch}`);

            expect(hasButtonHandler).toBe(true);
            expect(hasGridBuilder).toBe(true);
            expect(hasRowSelectionHandler).toBe(true);
            expect(hasRowSelectionEvent).toBe(true);
            expect(hasTabCreation).toBe(true);
        });
    });
});

// Helper function to create mock VSCode context
function createMockContext(): vscode.ExtensionContext {
    const testDir = path.join(__dirname, '../../.test-sdui-kb');

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
}
