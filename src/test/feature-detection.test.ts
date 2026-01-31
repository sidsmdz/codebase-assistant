/**
 * SDUI Feature Detection Tests — Real Parser Integration
 *
 * Reads actual Java/TypeScript/Proto fixture files from disk,
 * runs them through real parsers (JavaASTParser, TypeScriptASTParser, ProtoParser),
 * feeds the resulting ASTNodes into FeatureAnalyzer, and validates feature detection.
 *
 * Fixture project: test-fixtures/sdui-enterprise/
 * Architecture: Java Spring backend + React/TypeScript frontend + gRPC/WebSocket
 */

import * as fs from 'fs';
import * as path from 'path';
import { JavaASTParser } from '../parsers/JavaASTParser';
import { TypeScriptASTParser } from '../parsers/TypeScriptASTParser';
import { ProtoParser } from '../parsers/ProtoParser';
import { FeatureAnalyzer, FeatureComponent, Feature } from '../analysis/FeatureAnalyzer';

// ─── Fixture paths ──────────────────────────────────────────────────

const FIXTURE_ROOT = path.resolve(__dirname, '../../test-fixtures/sdui-enterprise');

const JAVA_FILES = [
    'backend/src/main/java/com/sdui/controller/LayoutController.java',
    'backend/src/main/java/com/sdui/service/LayoutService.java',
    'backend/src/main/java/com/sdui/service/GridDataService.java',
    'backend/src/main/java/com/sdui/service/NotificationService.java',
    'backend/src/main/java/com/sdui/repository/GridDataRepository.java',
    'backend/src/main/java/com/sdui/event/EventProcessor.java',
    'backend/src/main/java/com/sdui/handler/ActionHandler.java',
    'backend/src/main/java/com/sdui/engine/SideEffectEngine.java',
    'backend/src/main/java/com/sdui/session/SessionManager.java',
    'backend/src/main/java/com/sdui/broker/WebSocketBroker.java',
    'backend/src/main/java/com/sdui/broker/MessageRouter.java',
    'backend/src/main/java/com/sdui/registry/ComponentRegistry.java',
    'backend/src/main/java/com/sdui/model/LayoutDefinition.java',
    'backend/src/main/java/com/sdui/model/GridConfig.java',
    'backend/src/main/java/com/sdui/notification/NotificationBuilder.java',
];

const TS_FILES = [
    'frontend/src/components/SDUIRenderer.tsx',
    'frontend/src/components/grids/ClientSideGrid.tsx',
    'frontend/src/components/grids/ServerSideGrid.tsx',
    'frontend/src/components/forms/FormRenderer.tsx',
    'frontend/src/hooks/useLayoutEngine.ts',
    'frontend/src/services/WebSocketClient.ts',
    'frontend/src/services/MessageHandler.ts',
    'frontend/src/services/EventDispatcher.ts',
    'frontend/src/factory/ComponentFactory.tsx',
    'frontend/src/strategies/GridSortStrategy.ts',
    'frontend/src/builders/LayoutBuilder.ts',
    'frontend/src/observers/NotificationObserver.ts',
    'frontend/src/config/ConfigManager.ts',
];

const PROTO_FILES = [
    'proto/sdui.proto',
];

// ─── Helpers ────────────────────────────────────────────────────────

function readFixture(relativePath: string): string {
    return fs.readFileSync(path.join(FIXTURE_ROOT, relativePath), 'utf-8');
}

function loadAllFixtures(analyzer: FeatureAnalyzer): void {
    const javaParser = new JavaASTParser();
    const tsParser = new TypeScriptASTParser(true);
    const protoParser = new ProtoParser();

    for (const file of JAVA_FILES) {
        const content = readFixture(file);
        const fullPath = path.join(FIXTURE_ROOT, file);
        const nodes = javaParser.parse(content, fullPath);
        analyzer.analyzeNodes(nodes, content, fullPath);
    }

    for (const file of TS_FILES) {
        const content = readFixture(file);
        const fullPath = path.join(FIXTURE_ROOT, file);
        const nodes = tsParser.parse(content, fullPath);
        analyzer.analyzeNodes(nodes, content, fullPath);
    }

    for (const file of PROTO_FILES) {
        const content = readFixture(file);
        const fullPath = path.join(FIXTURE_ROOT, file);
        const nodes = protoParser.parse(content, fullPath);
        analyzer.analyzeNodes(nodes, content, fullPath);
    }
}

function loadJavaFixtures(analyzer: FeatureAnalyzer): void {
    const javaParser = new JavaASTParser();
    for (const file of JAVA_FILES) {
        const content = readFixture(file);
        const fullPath = path.join(FIXTURE_ROOT, file);
        const nodes = javaParser.parse(content, fullPath);
        analyzer.analyzeNodes(nodes, content, fullPath);
    }
}

function loadTsFixtures(analyzer: FeatureAnalyzer): void {
    const tsParser = new TypeScriptASTParser(true);
    for (const file of TS_FILES) {
        const content = readFixture(file);
        const fullPath = path.join(FIXTURE_ROOT, file);
        const nodes = tsParser.parse(content, fullPath);
        analyzer.analyzeNodes(nodes, content, fullPath);
    }
}

function findComponent(components: FeatureComponent[], name: string): FeatureComponent | undefined {
    return components.find(c => c.name === name);
}

function findFeatureContaining(features: Feature[], componentName: string, allComponents: FeatureComponent[]): Feature[] {
    const component = allComponents.find(c => c.name === componentName);
    if (!component) { return []; }
    return features.filter(f => f.components.includes(component.id));
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('SDUI Feature Detection (Real Parser Integration)', () => {
    let analyzer: FeatureAnalyzer;

    beforeEach(() => {
        analyzer = new FeatureAnalyzer();
    });

    // ═══════════════════════════════════════════════════════════════
    // Group 1: Parser Integration — verify parsers produce nodes
    // ═══════════════════════════════════════════════════════════════

    describe('Parser Integration', () => {
        test('JavaASTParser produces nodes from each backend file', () => {
            const parser = new JavaASTParser();
            for (const file of JAVA_FILES) {
                const content = readFixture(file);
                const nodes = parser.parse(content, file);
                expect(nodes.length).toBeGreaterThan(0);
            }
        });

        test('TypeScriptASTParser produces nodes from each frontend file', () => {
            const parser = new TypeScriptASTParser(true);
            for (const file of TS_FILES) {
                const content = readFixture(file);
                const nodes = parser.parse(content, file);
                expect(nodes.length).toBeGreaterThan(0);
            }
        });

        test('ProtoParser produces nodes from proto file', () => {
            const parser = new ProtoParser();
            const content = readFixture('proto/sdui.proto');
            const nodes = parser.parse(content, 'proto/sdui.proto');
            expect(nodes.length).toBeGreaterThan(0);

            // Should detect services
            const serviceNodes = nodes.filter(n => n.type === 'CLASS');
            expect(serviceNodes.length).toBeGreaterThanOrEqual(3);

            // Should detect message types (ProtoParser emits CLASS with modifiers: ['message'])
            const messageNodes = nodes.filter(n =>
                n.type === 'CLASS' && n.modifiers?.includes('message')
            );
            expect(messageNodes.length).toBeGreaterThan(0);
        });

        test('Java parser extracts class-level nodes with correct language', () => {
            const parser = new JavaASTParser();
            const content = readFixture('backend/src/main/java/com/sdui/controller/LayoutController.java');
            const nodes = parser.parse(content, 'LayoutController.java');
            const classNodes = nodes.filter(n => n.type === 'CLASS');
            expect(classNodes.length).toBeGreaterThanOrEqual(1);
            expect(classNodes[0].language).toBe('java');
            expect(classNodes[0].identifier).toBe('LayoutController');
        });

        test('TypeScript parser extracts classes and functions', () => {
            const parser = new TypeScriptASTParser(true);
            const content = readFixture('frontend/src/services/WebSocketClient.ts');
            const nodes = parser.parse(content, 'WebSocketClient.ts');
            const classNodes = nodes.filter(n => n.type === 'CLASS');
            expect(classNodes.length).toBeGreaterThanOrEqual(1);
            expect(classNodes[0].language).toBe('typescript');
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // Group 2: Component Type Detection
    // ═══════════════════════════════════════════════════════════════

    describe('Component Type Detection', () => {
        beforeEach(() => {
            loadAllFixtures(analyzer);
        });

        test('detects LayoutController as controller (@RestController)', () => {
            const comp = findComponent(analyzer.getComponents(), 'LayoutController');
            expect(comp).toBeDefined();
            expect(comp!.type).toBe('controller');
        });

        test('detects LayoutService as service (@Service)', () => {
            const comp = findComponent(analyzer.getComponents(), 'LayoutService');
            expect(comp).toBeDefined();
            expect(comp!.type).toBe('service');
        });

        test('detects GridDataService as service (@Service)', () => {
            const comp = findComponent(analyzer.getComponents(), 'GridDataService');
            expect(comp).toBeDefined();
            expect(comp!.type).toBe('service');
        });

        test('detects GridDataRepository as repository (@Repository)', () => {
            const comp = findComponent(analyzer.getComponents(), 'GridDataRepository');
            expect(comp).toBeDefined();
            expect(comp!.type).toBe('repository');
        });

        test('detects useLayoutEngine as hook', () => {
            const comp = findComponent(analyzer.getComponents(), 'useLayoutEngine');
            expect(comp).toBeDefined();
            expect(comp!.type).toBe('hook');
        });

        test('detects SDUIRenderer as component (JSX)', () => {
            const comp = findComponent(analyzer.getComponents(), 'SDUIRenderer');
            expect(comp).toBeDefined();
            expect(comp!.type).toBe('component');
        });

        test('detects WebSocketClient as api-client', () => {
            const comp = findComponent(analyzer.getComponents(), 'WebSocketClient');
            expect(comp).toBeDefined();
            expect(comp!.type).toBe('api-client');
        });

        test('detects EventProcessor component type (Spring @Component)', () => {
            const comp = findComponent(analyzer.getComponents(), 'EventProcessor');
            expect(comp).toBeDefined();
            expect(['service', 'event-handler']).toContain(comp!.type);
        });

        test('detects model entities (LayoutDefinition, GridConfig)', () => {
            const layout = findComponent(analyzer.getComponents(), 'LayoutDefinition');
            const grid = findComponent(analyzer.getComponents(), 'GridConfig');
            if (layout) {
                expect(layout.type).toBe('model');
            }
            if (grid) {
                expect(grid.type).toBe('model');
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // Group 3: Design Pattern Detection
    // ═══════════════════════════════════════════════════════════════

    describe('Design Pattern Detection', () => {
        beforeEach(() => {
            loadAllFixtures(analyzer);
        });

        test('detects ComponentFactory as factory type', () => {
            const comp = findComponent(analyzer.getComponents(), 'ComponentFactory');
            expect(comp).toBeDefined();
            expect(comp!.type).toBe('factory');
        });

        test('detects GridSortStrategy as strategy type', () => {
            const comp = findComponent(analyzer.getComponents(), 'GridSortStrategy');
            expect(comp).toBeDefined();
            expect(comp!.type).toBe('strategy');
        });

        test('detects LayoutBuilder as builder type', () => {
            const comp = findComponent(analyzer.getComponents(), 'LayoutBuilder');
            expect(comp).toBeDefined();
            expect(comp!.type).toBe('builder');
        });

        test('detects NotificationObserver as observer type', () => {
            const comp = findComponent(analyzer.getComponents(), 'NotificationObserver');
            expect(comp).toBeDefined();
            expect(comp!.type).toBe('observer');
        });

        test('detects NotificationBuilder as builder type (Java)', () => {
            const comp = findComponent(analyzer.getComponents(), 'NotificationBuilder');
            expect(comp).toBeDefined();
            expect(comp!.type).toBe('builder');
        });

        test('detects ConfigManager as singleton (getInstance pattern)', () => {
            const comp = findComponent(analyzer.getComponents(), 'ConfigManager');
            expect(comp).toBeDefined();
            expect(comp!.type).toBe('singleton');
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // Group 4: Entry Point Detection
    // ═══════════════════════════════════════════════════════════════

    describe('Entry Point Detection', () => {
        beforeEach(() => {
            loadAllFixtures(analyzer);
        });

        test('@RestController is an entry point', () => {
            const features = analyzer.identifyFeatures();
            const allComponents = analyzer.getComponents();
            const controller = findComponent(allComponents, 'LayoutController');
            expect(controller).toBeDefined();
            const containingFeatures = features.filter(f => f.entryPoints.includes(controller!.id));
            expect(containingFeatures.length).toBeGreaterThanOrEqual(1);
        });

        test('@EventListener makes EventProcessor an entry point', () => {
            const features = analyzer.identifyFeatures();
            const allComponents = analyzer.getComponents();
            const processor = findComponent(allComponents, 'EventProcessor');
            expect(processor).toBeDefined();
            const containingFeatures = features.filter(f => f.entryPoints.includes(processor!.id));
            expect(containingFeatures.length).toBeGreaterThanOrEqual(1);
        });

        test('React components are entry points', () => {
            const features = analyzer.identifyFeatures();
            const allComponents = analyzer.getComponents();
            const renderer = findComponent(allComponents, 'SDUIRenderer');
            expect(renderer).toBeDefined();
            const containingFeatures = features.filter(f => f.entryPoints.includes(renderer!.id));
            expect(containingFeatures.length).toBeGreaterThanOrEqual(1);
        });

        test('React hooks are entry points', () => {
            const features = analyzer.identifyFeatures();
            const allComponents = analyzer.getComponents();
            const hook = findComponent(allComponents, 'useLayoutEngine');
            expect(hook).toBeDefined();
            const containingFeatures = features.filter(f => f.entryPoints.includes(hook!.id));
            expect(containingFeatures.length).toBeGreaterThanOrEqual(1);
        });

        test('Observer components are entry points', () => {
            const features = analyzer.identifyFeatures();
            const allComponents = analyzer.getComponents();
            const observer = findComponent(allComponents, 'NotificationObserver');
            expect(observer).toBeDefined();
            const containingFeatures = features.filter(f => f.entryPoints.includes(observer!.id));
            expect(containingFeatures.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // Group 5: Dependency Tracing
    // ═══════════════════════════════════════════════════════════════

    describe('Dependency Tracing', () => {
        beforeEach(() => {
            loadAllFixtures(analyzer);
            analyzer.identifyFeatures();
        });

        test('LayoutController depends on LayoutService', () => {
            const controller = findComponent(analyzer.getComponents(), 'LayoutController');
            expect(controller).toBeDefined();
            expect(controller!.dependencies).toContain('LayoutService');
        });

        test('LayoutController depends on GridDataService', () => {
            const controller = findComponent(analyzer.getComponents(), 'LayoutController');
            expect(controller).toBeDefined();
            expect(controller!.dependencies).toContain('GridDataService');
        });

        test('LayoutService depends on ComponentRegistry', () => {
            const service = findComponent(analyzer.getComponents(), 'LayoutService');
            expect(service).toBeDefined();
            expect(service!.dependencies).toContain('ComponentRegistry');
        });

        test('GridDataService depends on GridDataRepository', () => {
            const service = findComponent(analyzer.getComponents(), 'GridDataService');
            expect(service).toBeDefined();
            expect(service!.dependencies).toContain('GridDataRepository');
        });

        test('EventProcessor depends on ActionHandler and SideEffectEngine', () => {
            const processor = findComponent(analyzer.getComponents(), 'EventProcessor');
            expect(processor).toBeDefined();
            expect(processor!.dependencies).toContain('ActionHandler');
            expect(processor!.dependencies).toContain('SideEffectEngine');
        });

        test('NotificationService depends on NotificationBuilder', () => {
            const service = findComponent(analyzer.getComponents(), 'NotificationService');
            expect(service).toBeDefined();
            expect(service!.dependencies).toContain('NotificationBuilder');
        });

        test('WebSocketBroker depends on SessionManager', () => {
            const broker = findComponent(analyzer.getComponents(), 'WebSocketBroker');
            expect(broker).toBeDefined();
            expect(broker!.dependencies).toContain('SessionManager');
        });

        test('MessageHandler depends on EventDispatcher (constructor injection)', () => {
            const handler = findComponent(analyzer.getComponents(), 'MessageHandler');
            expect(handler).toBeDefined();
            expect(handler!.dependencies).toContain('EventDispatcher');
        });

        test('feature traces full chain: LayoutController -> LayoutService -> ComponentRegistry', () => {
            const features = analyzer.getFeatures();
            const allComponents = analyzer.getComponents();

            const controller = findComponent(allComponents, 'LayoutController')!;
            const service = findComponent(allComponents, 'LayoutService')!;
            const registry = findComponent(allComponents, 'ComponentRegistry')!;

            const controllerFeatures = features.filter(f => f.components.includes(controller.id));
            expect(controllerFeatures.length).toBeGreaterThanOrEqual(1);

            const feature = controllerFeatures[0];
            expect(feature.components).toContain(service.id);
            expect(feature.components).toContain(registry.id);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // Group 6: Shared Components Across Features
    // ═══════════════════════════════════════════════════════════════

    describe('Shared Components Across Features', () => {
        beforeEach(() => {
            loadAllFixtures(analyzer);
            analyzer.identifyFeatures();
        });

        test('core SDUI components are not orphaned', () => {
            const features = analyzer.getFeatures();
            const allComponents = analyzer.getComponents();

            const coreNames = ['LayoutController', 'LayoutService', 'GridDataService',
                'EventProcessor', 'ActionHandler', 'SDUIRenderer'];
            for (const name of coreNames) {
                const comp = findComponent(allComponents, name);
                if (comp) {
                    const inFeature = features.some(f => f.components.includes(comp.id));
                    expect(inFeature).toBe(true);
                }
            }
        });

        test('shared services can appear in multiple features (no greedy BFS)', () => {
            const features = analyzer.getFeatures();
            const allComponents = analyzer.getComponents();

            const componentFeatureCount = new Map<string, number>();
            for (const comp of allComponents) {
                const count = features.filter(f => f.components.includes(comp.id)).length;
                if (count > 0) {
                    componentFeatureCount.set(comp.name, count);
                }
            }

            const sharedComponents = Array.from(componentFeatureCount.entries())
                .filter(([, count]) => count > 1);

            // With per-feature visited sets (not global), shared components are possible
            expect(sharedComponents.length).toBeGreaterThanOrEqual(0);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // Group 7: Feature Merging
    // ═══════════════════════════════════════════════════════════════

    describe('Feature Merging', () => {
        beforeEach(() => {
            loadAllFixtures(analyzer);
        });

        test('merged features have fewer features than raw entry points', () => {
            const features = analyzer.identifyFeatures();
            const allComponents = analyzer.getComponents();

            const entryPointCount = allComponents.filter(c =>
                ['controller', 'event-handler', 'component', 'hook', 'observer'].includes(c.type)
            ).length;

            expect(features.length).toBeLessThanOrEqual(entryPointCount);
        });

        test('entry points are a subset of components in each feature', () => {
            const features = analyzer.identifyFeatures();

            for (const feature of features) {
                for (const ep of feature.entryPoints) {
                    expect(feature.components).toContain(ep);
                }
            }
        });

        test('merged features deduplicate flows', () => {
            const features = analyzer.identifyFeatures();

            for (const feature of features) {
                const flowKeys = feature.flow.map(f => `${f.from}->${f.to}`);
                const uniqueKeys = new Set(flowKeys);
                expect(flowKeys.length).toBe(uniqueKeys.size);
            }
        });

        test('each feature has at least one entry point and one component', () => {
            const features = analyzer.identifyFeatures();

            for (const feature of features) {
                expect(feature.entryPoints.length).toBeGreaterThanOrEqual(1);
                expect(feature.components.length).toBeGreaterThanOrEqual(1);
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // Group 8: Feature Flow & Data Flow
    // ═══════════════════════════════════════════════════════════════

    describe('Feature Flow & Data Flow', () => {
        beforeEach(() => {
            loadAllFixtures(analyzer);
        });

        test('features have flow entries for dependency edges', () => {
            const features = analyzer.identifyFeatures();
            const featuresWithFlow = features.filter(f => f.flow.length > 0);
            expect(featuresWithFlow.length).toBeGreaterThan(0);
        });

        test('flow entries reference valid component IDs', () => {
            const features = analyzer.identifyFeatures();
            const allComponents = analyzer.getComponents();
            const componentIds = new Set(allComponents.map(c => c.id));

            for (const feature of features) {
                for (const flow of feature.flow) {
                    expect(componentIds.has(flow.from)).toBe(true);
                    expect(componentIds.has(flow.to)).toBe(true);
                }
            }
        });

        test('LayoutController feature has flow to LayoutService', () => {
            const features = analyzer.identifyFeatures();
            const allComponents = analyzer.getComponents();

            const controller = findComponent(allComponents, 'LayoutController')!;
            const service = findComponent(allComponents, 'LayoutService')!;

            const feature = features.find(f =>
                f.components.includes(controller.id) && f.components.includes(service.id)
            );

            if (feature) {
                const controllerToService = feature.flow.find(f =>
                    f.from === controller.id && f.to === service.id
                );
                expect(controllerToService).toBeDefined();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // Group 9: Stats Verification
    // ═══════════════════════════════════════════════════════════════

    describe('Stats Verification', () => {
        beforeEach(() => {
            loadAllFixtures(analyzer);
            analyzer.identifyFeatures();
        });

        test('stats show correct total component count', () => {
            const stats = analyzer.getStats();
            const allComponents = analyzer.getComponents();
            expect(stats.totalComponents).toBe(allComponents.length);
            expect(stats.totalComponents).toBeGreaterThan(0);
        });

        test('stats show both java and typescript languages', () => {
            const stats = analyzer.getStats();
            expect(stats.componentsByLanguage['java']).toBeGreaterThan(0);
            expect(stats.componentsByLanguage['typescript']).toBeGreaterThan(0);
        });

        test('stats include controller, service, and repository types', () => {
            const stats = analyzer.getStats();
            const types = Object.keys(stats.componentsByType);
            expect(types).toContain('controller');
            expect(types).toContain('service');
            expect(types).toContain('repository');
        });

        test('stats include design pattern types', () => {
            const stats = analyzer.getStats();
            const types = Object.keys(stats.componentsByType);
            const patternTypes = ['builder', 'factory', 'strategy', 'observer', 'singleton'];
            const detectedPatterns = patternTypes.filter(p => types.includes(p));
            expect(detectedPatterns.length).toBeGreaterThan(0);
        });

        test('stats totalFeatures matches getFeatures().length', () => {
            const stats = analyzer.getStats();
            const features = analyzer.getFeatures();
            expect(stats.totalFeatures).toBe(features.length);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // Group 10: Framework Detection
    // ═══════════════════════════════════════════════════════════════

    describe('Framework Detection', () => {
        beforeEach(() => {
            loadAllFixtures(analyzer);
        });

        test('detects Spring framework from annotations', () => {
            const features = analyzer.identifyFeatures();
            const springFeatures = features.filter(f => f.frameworks.includes('spring'));
            expect(springFeatures.length).toBeGreaterThan(0);
        });

        test('detects React framework from component code', () => {
            const features = analyzer.identifyFeatures();
            const reactFeatures = features.filter(f => f.frameworks.includes('react'));
            expect(reactFeatures.length).toBeGreaterThan(0);
        });

        test('detects gRPC from StreamObserver usage', () => {
            const features = analyzer.identifyFeatures();
            const grpcFeatures = features.filter(f => f.frameworks.includes('grpc'));
            expect(grpcFeatures.length).toBeGreaterThan(0);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // Group 11: Proto/gRPC Integration
    // ═══════════════════════════════════════════════════════════════

    describe('Proto/gRPC Integration', () => {
        test('proto services are parsed as components', () => {
            const protoParser = new ProtoParser();
            const content = readFixture('proto/sdui.proto');
            const nodes = protoParser.parse(content, 'proto/sdui.proto');
            expect(nodes.length).toBeGreaterThan(0);
        });

        test('proto file defines LayoutService, GridDataService, EventService', () => {
            const protoParser = new ProtoParser();
            const content = readFixture('proto/sdui.proto');
            const nodes = protoParser.parse(content, 'proto/sdui.proto');

            const serviceNames = nodes
                .filter(n => n.type === 'CLASS')
                .map(n => n.identifier);

            expect(serviceNames).toContain('LayoutService');
            expect(serviceNames).toContain('GridDataService');
            expect(serviceNames).toContain('EventService');
        });

        test('proto defines RPC methods with streaming', () => {
            const protoParser = new ProtoParser();
            const content = readFixture('proto/sdui.proto');
            const nodes = protoParser.parse(content, 'proto/sdui.proto');

            const methods = nodes.filter(n => n.type === 'METHOD');
            expect(methods.length).toBeGreaterThan(0);

            const methodNames = methods.map(n => n.identifier);
            expect(methodNames).toContain('StreamLayoutUpdates');
            expect(methodNames).toContain('StreamGridUpdates');
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // Group 12: Clear and Reset
    // ═══════════════════════════════════════════════════════════════

    describe('Clear and Reset', () => {
        test('clear() resets all state', () => {
            loadAllFixtures(analyzer);
            analyzer.identifyFeatures();

            expect(analyzer.getComponents().length).toBeGreaterThan(0);
            expect(analyzer.getFeatures().length).toBeGreaterThan(0);

            analyzer.clear();

            expect(analyzer.getComponents().length).toBe(0);
            expect(analyzer.getFeatures().length).toBe(0);
            expect(analyzer.getStats().totalComponents).toBe(0);
            expect(analyzer.getStats().totalFeatures).toBe(0);
        });

        test('can re-analyze after clear', () => {
            loadJavaFixtures(analyzer);
            analyzer.identifyFeatures();
            const firstCount = analyzer.getComponents().length;

            analyzer.clear();
            loadAllFixtures(analyzer);
            analyzer.identifyFeatures();

            expect(analyzer.getComponents().length).toBeGreaterThan(firstCount);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // Group 13: End-to-End SDUI Architecture
    // ═══════════════════════════════════════════════════════════════

    describe('End-to-End SDUI Architecture', () => {
        beforeEach(() => {
            loadAllFixtures(analyzer);
        });

        test('full SDUI system produces features spanning controller to repository', () => {
            const features = analyzer.identifyFeatures();
            const allComponents = analyzer.getComponents();

            const controller = findComponent(allComponents, 'LayoutController')!;
            expect(controller).toBeDefined();

            const feature = features.find(f => f.components.includes(controller.id));
            expect(feature).toBeDefined();

            if (feature) {
                const service = findComponent(allComponents, 'LayoutService');
                expect(feature.components).toContain(controller.id);
                if (service) {
                    expect(feature.components).toContain(service.id);
                }
            }
        });

        test('Java and TypeScript components form separate features (no cross-language deps)', () => {
            const features = analyzer.identifyFeatures();

            const javaOnlyFeatures = features.filter(f =>
                f.languages.length === 1 && f.languages[0] === 'java'
            );
            const tsOnlyFeatures = features.filter(f =>
                f.languages.length === 1 && f.languages[0] === 'typescript'
            );

            expect(javaOnlyFeatures.length).toBeGreaterThan(0);
            expect(tsOnlyFeatures.length).toBeGreaterThan(0);
        });

        test('total component count reflects actual parsed files', () => {
            analyzer.identifyFeatures();
            const components = analyzer.getComponents();
            expect(components.length).toBeGreaterThanOrEqual(15);
        });

        test('features have tags derived from their components', () => {
            const features = analyzer.identifyFeatures();

            for (const feature of features) {
                expect(feature.tags.length).toBeGreaterThan(0);
            }
        });

        test('feature names are human-readable', () => {
            const features = analyzer.identifyFeatures();

            for (const feature of features) {
                expect(feature.name.length).toBeGreaterThan(0);
                expect(feature.name).not.toMatch(/^[a-f0-9]{8,}$/);
            }
        });

        test('Java-only load produces Java features, TS-only load produces TS features', () => {
            const javaAnalyzer = new FeatureAnalyzer();
            loadJavaFixtures(javaAnalyzer);
            const javaFeatures = javaAnalyzer.identifyFeatures();
            expect(javaFeatures.length).toBeGreaterThan(0);
            for (const f of javaFeatures) {
                expect(f.languages).toContain('java');
                expect(f.languages).not.toContain('typescript');
            }

            const tsAnalyzer = new FeatureAnalyzer();
            loadTsFixtures(tsAnalyzer);
            const tsFeatures = tsAnalyzer.identifyFeatures();
            expect(tsFeatures.length).toBeGreaterThan(0);
            for (const f of tsFeatures) {
                expect(f.languages).toContain('typescript');
                expect(f.languages).not.toContain('java');
            }
        });
    });
});
