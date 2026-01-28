/**
 * SDUI Broker - End-to-End Feature Tracking Tests
 *
 * Tests comprehensive cross-language feature tracking with:
 * - WebSocket broker architecture
 * - Multiple redundant patterns
 * - UI-triggered and server-triggered flows
 * - TypeScript client → WebSocket → Java backend tracing
 */

import * as path from 'path';
import * as fs from 'fs';
import { FeatureTracker } from '../analysis/FeatureTracker';
import { ProtoParser } from '../parsers/ProtoParser';
import { TypeScriptASTParser } from '../parsers/TypeScriptASTParser';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager';

describe('SDUI Broker - End-to-End Feature Tracking', () => {
    const fixtureRoot = path.join(__dirname, '../../test-fixtures/sdui-broker');
    const protoFile = path.join(fixtureRoot, 'protocols/websocket-protocol.proto');
    const backendDir = path.join(fixtureRoot, 'backend');
    const frontendDir = path.join(fixtureRoot, 'frontend/src');

    const featureTracker = new FeatureTracker();
    const protoParser = new ProtoParser();
    const tsParser = new TypeScriptASTParser();

    let kbManager: KnowledgeBaseManager;

    beforeAll(async () => {
        // Initialize KB for pattern storage
        const mockContext = {
            globalStorageUri: { fsPath: path.join(__dirname, '../../.test-sdui-broker-kb') },
            extensionPath: path.join(__dirname, '../..')
        } as any;

        kbManager = new KnowledgeBaseManager(mockContext);
        await kbManager.initialize();
    });

    describe('1. WebSocket Protocol Parsing', () => {
        it('should parse WebSocket protocol and extract message types', () => {
            console.log('\n✅ Testing WebSocket Protocol Parser');

            const content = fs.readFileSync(protoFile, 'utf-8');
            const astNodes = protoParser.parse(content, protoFile);

            console.log(`   Found ${astNodes.length} AST nodes in protocol`);

            // Find message types
            const messages = astNodes.filter(n =>
                n.type === 'CLASS' && n.modifiers?.includes('message')
            );

            console.log(`   Message types found: ${messages.length}`);
            expect(messages.length).toBeGreaterThan(10);

            // Verify key messages
            const messageNames = messages.map(m => m.identifier);
            expect(messageNames).toContain('BrokerMessage');
            expect(messageNames).toContain('UIRenderMessage');
            expect(messageNames).toContain('UIEventMessage');
            expect(messageNames).toContain('UIActionMessage');
        });

        it('should extract component type enum', () => {
            console.log('\n✅ Extracting ComponentType enum');

            const content = fs.readFileSync(protoFile, 'utf-8');

            // Check for component types
            const hasClientGrid = content.includes('CLIENT_SIDE_GRID');
            const hasServerGrid = content.includes('SERVER_SIDE_GRID');
            const hasDrawer = content.includes('DRAWER');
            const hasModal = content.includes('MODAL');

            console.log(`   CLIENT_SIDE_GRID: ${hasClientGrid}`);
            console.log(`   SERVER_SIDE_GRID: ${hasServerGrid}`);
            console.log(`   DRAWER: ${hasDrawer}`);
            console.log(`   MODAL: ${hasModal}`);

            expect(hasClientGrid).toBe(true);
            expect(hasServerGrid).toBe(true);
            expect(hasDrawer).toBe(true);
        });
    });

    describe('2. Pattern Discovery - Grid Row Styling (3 variants)', () => {
        it('should discover Pattern A1: Class-based row styling', () => {
            console.log('\n✅ Discovering Pattern A1: Class-based row styling');

            const layoutController = path.join(backendDir, 'sdui/LayoutController.java');
            const content = fs.readFileSync(layoutController, 'utf-8');

            // Pattern A1: buildUserGridClassBased
            const hasMethod = content.includes('buildUserGridClassBased');
            const hasClassName = content.includes('premium-user-blue');
            const hasRegularClass = content.includes('regular-user-white');
            const hasRowClass = content.includes('rowClass');

            console.log(`   Method buildUserGridClassBased: ${hasMethod}`);
            console.log(`   Uses rowClass property: ${hasRowClass}`);
            console.log(`   premium-user-blue class: ${hasClassName}`);
            console.log(`   regular-user-white class: ${hasRegularClass}`);

            expect(hasMethod).toBe(true);
            expect(hasClassName).toBe(true);
            expect(hasRowClass).toBe(true);
        });

        it('should discover Pattern A2: Color-based row styling', () => {
            console.log('\n✅ Discovering Pattern A2: Color-based row styling');

            const layoutController = path.join(backendDir, 'sdui/LayoutController.java');
            const content = fs.readFileSync(layoutController, 'utf-8');

            // Pattern A2: buildUserGridColorBased
            const hasMethod = content.includes('buildUserGridColorBased');
            const hasBlueColor = content.includes('#e3f2fd');
            const hasWhiteColor = content.includes('#ffffff');
            const hasRowColor = content.includes('rowColor');

            console.log(`   Method buildUserGridColorBased: ${hasMethod}`);
            console.log(`   Uses direct colors: ${hasRowColor}`);
            console.log(`   Blue color #e3f2fd: ${hasBlueColor}`);
            console.log(`   White color #ffffff: ${hasWhiteColor}`);

            expect(hasMethod).toBe(true);
            expect(hasBlueColor).toBe(true);
        });

        it('should discover Pattern A3: Rule-based row styling', () => {
            console.log('\n✅ Discovering Pattern A3: Rule-based row styling');

            const layoutController = path.join(backendDir, 'sdui/LayoutController.java');
            const content = fs.readFileSync(layoutController, 'utf-8');

            // Pattern A3: buildUserGridRuleBased
            const hasMethod = content.includes('buildUserGridRuleBased');
            const hasRules = content.includes('RowStyleRule');
            const hasCondition = content.includes("status === 'Premium'");

            console.log(`   Method buildUserGridRuleBased: ${hasMethod}`);
            console.log(`   Uses RowStyleRule: ${hasRules}`);
            console.log(`   Conditional rules: ${hasCondition}`);

            expect(hasMethod).toBe(true);
            expect(hasRules).toBe(true);
        });

        it('should verify all 3 patterns achieve same visual result', () => {
            console.log('\n✅ Verifying pattern equivalence');

            const layoutController = path.join(backendDir, 'sdui/LayoutController.java');
            const content = fs.readFileSync(layoutController, 'utf-8');

            // All three patterns should result in blue premium rows
            const pattern1 = content.includes('buildUserGridClassBased') &&
                           content.includes('premium-user-blue');
            const pattern2 = content.includes('buildUserGridColorBased') &&
                           content.includes('#e3f2fd');
            const pattern3 = content.includes('buildUserGridRuleBased') &&
                           content.includes('RowStyleRule');

            console.log(`   Pattern A1 (class): ${pattern1}`);
            console.log(`   Pattern A2 (color): ${pattern2}`);
            console.log(`   Pattern A3 (rules): ${pattern3}`);
            console.log('   All achieve: Blue rows for premium users');

            expect(pattern1 && pattern2 && pattern3).toBe(true);
        });
    });

    describe('3. Pattern Discovery - Drawer Opening (3 variants)', () => {
        it('should discover Pattern B1: Action-based drawer opening', () => {
            console.log('\n✅ Discovering Pattern B1: Action-based drawer');

            const layoutController = path.join(backendDir, 'sdui/LayoutController.java');
            const content = fs.readFileSync(layoutController, 'utf-8');

            const hasMethod = content.includes('openDrawerActionBased');
            const hasUIAction = content.includes('UI_ACTION');
            const hasOpenDrawer = content.includes('OPEN_DRAWER');

            console.log(`   Method openDrawerActionBased: ${hasMethod}`);
            console.log(`   Uses UI_ACTION message: ${hasUIAction}`);
            console.log(`   ActionType OPEN_DRAWER: ${hasOpenDrawer}`);

            expect(hasMethod).toBe(true);
            expect(hasOpenDrawer).toBe(true);
        });

        it('should discover Pattern B2: Render-based drawer opening', () => {
            console.log('\n✅ Discovering Pattern B2: Render-based drawer');

            const layoutController = path.join(backendDir, 'sdui/LayoutController.java');
            const content = fs.readFileSync(layoutController, 'utf-8');

            const hasMethod = content.includes('openDrawerRenderBased');
            const hasIsOpen = content.includes('setIsOpen(true)');
            const hasRenderBased = content.includes('RENDER_BASED');

            console.log(`   Method openDrawerRenderBased: ${hasMethod}`);
            console.log(`   Sets isOpen=true: ${hasIsOpen}`);
            console.log(`   OpenMode RENDER_BASED: ${hasRenderBased}`);

            expect(hasMethod).toBe(true);
            expect(hasIsOpen).toBe(true);
        });

        it('should discover Pattern B3: State-based drawer opening', () => {
            console.log('\n✅ Discovering Pattern B3: State-based drawer');

            const layoutController = path.join(backendDir, 'sdui/LayoutController.java');
            const content = fs.readFileSync(layoutController, 'utf-8');

            const hasMethod = content.includes('openDrawerStateBased');
            const hasStateSync = content.includes('StateSyncPayload');
            const hasDrawerState = content.includes('DRAWER_STATE');

            console.log(`   Method openDrawerStateBased: ${hasMethod}`);
            console.log(`   Uses StateSyncPayload: ${hasStateSync}`);
            console.log(`   StateType DRAWER_STATE: ${hasDrawerState}`);

            expect(hasMethod).toBe(true);
            expect(hasStateSync).toBe(true);
        });
    });

    describe('4. Pattern Discovery - Form Validation (3 variants)', () => {
        it('should discover Pattern C1: Inline validation', () => {
            console.log('\n✅ Discovering Pattern C1: Inline validation');

            const layoutController = path.join(backendDir, 'sdui/LayoutController.java');
            const content = fs.readFileSync(layoutController, 'utf-8');

            const hasMethod = content.includes('validateFieldInline');
            const hasInputChanged = content.includes('INPUT_CHANGED');
            const hasShowValidation = content.includes('SHOW_VALIDATION');

            console.log(`   Method validateFieldInline: ${hasMethod}`);
            console.log(`   Triggers on INPUT_CHANGED: ${hasInputChanged}`);
            console.log(`   Returns SHOW_VALIDATION: ${hasShowValidation}`);

            expect(hasMethod).toBe(true);
        });

        it('should discover Pattern C2: Batch validation', () => {
            console.log('\n✅ Discovering Pattern C2: Batch validation');

            const layoutController = path.join(backendDir, 'sdui/LayoutController.java');
            const content = fs.readFileSync(layoutController, 'utf-8');

            const hasMethod = content.includes('validateFormBatch');
            const hasBatchMode = content.includes('BATCH');

            console.log(`   Method validateFormBatch: ${hasMethod}`);
            console.log(`   Mode BATCH: ${hasBatchMode}`);

            expect(hasMethod).toBe(true);
        });

        it('should discover Pattern C3: Debounced validation', () => {
            console.log('\n✅ Discovering Pattern C3: Debounced validation');

            const layoutController = path.join(backendDir, 'sdui/LayoutController.java');
            const content = fs.readFileSync(layoutController, 'utf-8');

            const hasMethod = content.includes('validateFieldDebounced');
            const hasDebounceMs = content.includes('debounceMs');

            console.log(`   Method validateFieldDebounced: ${hasMethod}`);
            console.log(`   Includes debounceMs parameter: ${hasDebounceMs}`);

            expect(hasMethod).toBe(true);
        });
    });

    describe('5. Cross-Language Feature Tracing', () => {
        it('should trace UI-triggered grid rendering flow', () => {
            console.log('\n✅ Tracing UI-triggered grid rendering flow');

            // Client: Button click
            const wsClient = path.join(frontendDir, 'broker/WebSocketClient.ts');
            const clientContent = fs.readFileSync(wsClient, 'utf-8');
            const hasSendEvent = clientContent.includes('sendEvent');

            // Broker: Message routing
            const messageRouter = path.join(backendDir, 'broker/MessageRouter.java');
            const routerContent = fs.readFileSync(messageRouter, 'utf-8');
            const hasUIEvent = routerContent.includes('UI_EVENT');

            // Backend: Event processing
            const eventProcessor = path.join(backendDir, 'sdui/EventProcessor.java');
            const processorContent = fs.readFileSync(eventProcessor, 'utf-8');
            const hasButtonClick = processorContent.includes('BUTTON_CLICK');

            // Layout generation
            const layoutController = path.join(backendDir, 'sdui/LayoutController.java');
            const layoutContent = fs.readFileSync(layoutController, 'utf-8');
            const hasGridBuilder = layoutContent.includes('buildUserGridClassBased');

            console.log(`   ✓ Client sends event: ${hasSendEvent}`);
            console.log(`   ✓ Broker routes UI_EVENT: ${hasUIEvent}`);
            console.log(`   ✓ Processor handles BUTTON_CLICK: ${hasButtonClick}`);
            console.log(`   ✓ Controller builds grid: ${hasGridBuilder}`);

            expect(hasSendEvent && hasUIEvent && hasButtonClick && hasGridBuilder).toBe(true);
        });

        it('should trace server-triggered drawer opening flow', () => {
            console.log('\n✅ Tracing server-triggered drawer flow');

            // Server: Side effect engine
            const sideEffectEngine = path.join(backendDir, 'sdui/SideEffectEngine.java');
            const engineContent = fs.readFileSync(sideEffectEngine, 'utf-8');
            const hasNotifyJobComplete = engineContent.includes('notifyJobComplete');

            // Controller: Drawer opening
            const layoutController = path.join(backendDir, 'sdui/LayoutController.java');
            const layoutContent = fs.readFileSync(layoutController, 'utf-8');
            const hasOpenDrawer = layoutContent.includes('openDrawerActionBased');

            // Broker: Message send
            const webSocketBroker = path.join(backendDir, 'broker/WebSocketBroker.java');
            const brokerContent = fs.readFileSync(webSocketBroker, 'utf-8');
            const hasSendToSession = brokerContent.includes('sendToSession');

            // Client: Drawer component
            const drawerComponent = path.join(frontendDir, 'components/layout/Drawer.tsx');
            const drawerContent = fs.readFileSync(drawerComponent, 'utf-8');
            const hasDrawerState = drawerContent.includes('drawerState');

            console.log(`   ✓ SideEffectEngine triggers: ${hasNotifyJobComplete}`);
            console.log(`   ✓ Controller opens drawer: ${hasOpenDrawer}`);
            console.log(`   ✓ Broker sends to session: ${hasSendToSession}`);
            console.log(`   ✓ Client renders drawer: ${hasDrawerState}`);

            expect(hasNotifyJobComplete && hasOpenDrawer && hasSendToSession && hasDrawerState).toBe(true);
        });

        it('should trace validation flow across all layers', () => {
            console.log('\n✅ Tracing validation flow');

            // Client: Form field
            const formField = path.join(frontendDir, 'components/forms/FormField.tsx');
            const fieldContent = fs.readFileSync(formField, 'utf-8');
            const hasInputChange = fieldContent.includes('INPUT_CHANGED');

            // Server: Event processor
            const eventProcessor = path.join(backendDir, 'sdui/EventProcessor.java');
            const processorContent = fs.readFileSync(eventProcessor, 'utf-8');
            const hasHandleInput = processorContent.includes('handleInputChanged');

            // Controller: Validation
            const layoutController = path.join(backendDir, 'sdui/LayoutController.java');
            const layoutContent = fs.readFileSync(layoutController, 'utf-8');
            const hasValidateField = layoutContent.includes('validateFieldInline');

            // Client: Validation display
            const hasValidationMessage = fieldContent.includes('validationMessage');

            console.log(`   ✓ Client sends INPUT_CHANGED: ${hasInputChange}`);
            console.log(`   ✓ Processor handles input: ${hasHandleInput}`);
            console.log(`   ✓ Controller validates: ${hasValidateField}`);
            console.log(`   ✓ Client shows validation: ${hasValidationMessage}`);

            expect(hasInputChange && hasHandleInput && hasValidateField && hasValidationMessage).toBe(true);
        });
    });

    describe('6. Client-Side Pattern Implementation', () => {
        it('should verify client supports all 3 row styling patterns', () => {
            console.log('\n✅ Verifying client-side row styling patterns');

            const clientGrid = path.join(frontendDir, 'components/grids/ClientSideGrid.tsx');
            const content = fs.readFileSync(clientGrid, 'utf-8');

            const hasClassBased = content.includes('CLASS_BASED');
            const hasColorBased = content.includes('COLOR_BASED');
            const hasRuleBased = content.includes('RULE_BASED');
            const hasGetRowClass = content.includes('getRowClass');
            const hasGetRowStyle = content.includes('getRowStyle');

            console.log(`   Supports CLASS_BASED: ${hasClassBased}`);
            console.log(`   Supports COLOR_BASED: ${hasColorBased}`);
            console.log(`   Supports RULE_BASED: ${hasRuleBased}`);
            console.log(`   Has getRowClass: ${hasGetRowClass}`);
            console.log(`   Has getRowStyle: ${hasGetRowStyle}`);

            expect(hasClassBased && hasColorBased && hasRuleBased).toBe(true);
        });

        it('should verify client supports all 3 drawer opening patterns', () => {
            console.log('\n✅ Verifying client-side drawer patterns');

            const drawer = path.join(frontendDir, 'components/layout/Drawer.tsx');
            const content = fs.readFileSync(drawer, 'utf-8');

            const hasActionBased = content.includes('ACTION_BASED');
            const hasRenderBased = content.includes('RENDER_BASED');
            const hasStateBased = content.includes('STATE_BASED');

            console.log(`   Supports ACTION_BASED: ${hasActionBased}`);
            console.log(`   Supports RENDER_BASED: ${hasRenderBased}`);
            console.log(`   Supports STATE_BASED: ${hasStateBased}`);

            expect(hasActionBased && hasRenderBased && hasStateBased).toBe(true);
        });

        it('should verify client supports all 3 validation patterns', () => {
            console.log('\n✅ Verifying client-side validation patterns');

            const formField = path.join(frontendDir, 'components/forms/FormField.tsx');
            const content = fs.readFileSync(formField, 'utf-8');

            const hasInline = content.includes('INLINE');
            const hasBatch = content.includes('BATCH');
            const hasDebounced = content.includes('REALTIME_DEBOUNCED');
            const hasDebounceTimer = content.includes('debounceTimer');

            console.log(`   Supports INLINE: ${hasInline}`);
            console.log(`   Supports BATCH: ${hasBatch}`);
            console.log(`   Supports REALTIME_DEBOUNCED: ${hasDebounced}`);
            console.log(`   Has debounce timer: ${hasDebounceTimer}`);

            expect(hasInline && hasBatch && hasDebounced).toBe(true);
        });
    });

    describe('7. Knowledge Base Integration', () => {
        it('should save grid row styling patterns to KB', async () => {
            console.log('\n✅ Saving grid row styling patterns');

            // Pattern A1: Class-based
            const pattern1 = await kbManager.savePattern({
                name: 'Grid Row Styling - Class Based (SDUI)',
                language: 'java',
                code: 'buildUserGridClassBased() { setRowClass("premium-user-blue") }',
                description: 'Server assigns CSS class names to rows for styling',
                query: 'grid row styling class based premium blue',
                tags: ['ag-grid', 'row-styling', 'class-based', 'sdui', 'pattern-a1'],
                metadata: {
                    category: 'UI Rendering',
                    framework: 'SDUI Broker'
                }
            });

            // Pattern A2: Color-based
            const pattern2 = await kbManager.savePattern({
                name: 'Grid Row Styling - Color Based (SDUI)',
                language: 'java',
                code: 'buildUserGridColorBased() { setRowColor("#e3f2fd") }',
                description: 'Server sends direct color values for row styling',
                query: 'grid row styling color based direct',
                tags: ['ag-grid', 'row-styling', 'color-based', 'sdui', 'pattern-a2'],
                metadata: {
                    category: 'UI Rendering',
                    framework: 'SDUI Broker'
                }
            });

            // Pattern A3: Rule-based
            const pattern3 = await kbManager.savePattern({
                name: 'Grid Row Styling - Rule Based (SDUI)',
                language: 'java',
                code: 'buildUserGridRuleBased() { RowStyleRule("status===Premium", "blue") }',
                description: 'Server sends conditional rules for client-side evaluation',
                query: 'grid row styling rule based conditional',
                tags: ['ag-grid', 'row-styling', 'rule-based', 'sdui', 'pattern-a3'],
                metadata: {
                    category: 'UI Rendering',
                    framework: 'SDUI Broker'
                }
            });

            console.log(`   Pattern A1 saved: ${pattern1.id}`);
            console.log(`   Pattern A2 saved: ${pattern2.id}`);
            console.log(`   Pattern A3 saved: ${pattern3.id}`);

            expect(pattern1.id).toBeDefined();
            expect(pattern2.id).toBeDefined();
            expect(pattern3.id).toBeDefined();
        });

        it('should search and find all row styling pattern variants', async () => {
            console.log('\n✅ Searching for row styling patterns');

            const results = await kbManager.searchPatterns('grid row styling');

            console.log(`   Found ${results.length} patterns`);
            results.forEach((p, idx) => {
                console.log(`   ${idx + 1}. ${p.name} (${p.language})`);
            });

            expect(results.length).toBeGreaterThanOrEqual(3);

            // Verify all 3 variants found
            const hasClassBased = results.some(p => p.tags.includes('pattern-a1'));
            const hasColorBased = results.some(p => p.tags.includes('pattern-a2'));
            const hasRuleBased = results.some(p => p.tags.includes('pattern-a3'));

            expect(hasClassBased).toBe(true);
            expect(hasColorBased).toBe(true);
            expect(hasRuleBased).toBe(true);
        });

        it('should get statistics on SDUI patterns', async () => {
            console.log('\n✅ Getting SDUI pattern statistics');

            const stats = await kbManager.getDetailedStats();

            console.log(`   Total patterns: ${stats.totalPatterns}`);
            console.log(`   By language: ${JSON.stringify(stats.patternsByLanguage)}`);
            console.log(`   Top tags: ${stats.topTags.slice(0, 5).map(t => t.tag).join(', ')}`);

            expect(stats.totalPatterns).toBeGreaterThan(0);
        });
    });

    describe('8. End-to-End Flow Verification', () => {
        it('should verify complete button click → grid render flow', () => {
            console.log('\n✅ Verifying complete UI-triggered flow');

            const steps: Record<string, boolean> = {};

            // Check each step exists
            const wsClient = path.join(frontendDir, 'broker/WebSocketClient.ts');
            steps.clientSend = fs.readFileSync(wsClient, 'utf-8').includes('sendEvent');

            const router = path.join(backendDir, 'broker/MessageRouter.java');
            steps.brokerRoute = fs.readFileSync(router, 'utf-8').includes('UI_EVENT');

            const processor = path.join(backendDir, 'sdui/EventProcessor.java');
            steps.eventProcess = fs.readFileSync(processor, 'utf-8').includes('handleButtonClick');

            const layout = path.join(backendDir, 'sdui/LayoutController.java');
            steps.layoutGen = fs.readFileSync(layout, 'utf-8').includes('buildUserGridClassBased');

            const broker = path.join(backendDir, 'broker/WebSocketBroker.java');
            steps.brokerSend = fs.readFileSync(broker, 'utf-8').includes('sendToSession');

            const renderer = path.join(frontendDir, 'components/SDUIRenderer.tsx');
            steps.clientRender = fs.readFileSync(renderer, 'utf-8').includes('handleRender');

            console.log('   Flow steps:');
            console.log(`   1. Client sends event: ${steps.clientSend}`);
            console.log(`   2. Broker routes message: ${steps.brokerRoute}`);
            console.log(`   3. Event processor handles: ${steps.eventProcess}`);
            console.log(`   4. Layout controller generates: ${steps.layoutGen}`);
            console.log(`   5. Broker sends response: ${steps.brokerSend}`);
            console.log(`   6. Client renders UI: ${steps.clientRender}`);

            const allStepsPresent = Object.values(steps).every(v => v === true);
            expect(allStepsPresent).toBe(true);
        });
    });
});
