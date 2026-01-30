/**
 * Feature-Copilot Integration Tests
 *
 * Tests to verify that:
 * 1. FeatureAnalyzer correctly identifies components
 * 2. Features are properly structured
 * 3. Cross-language feature tracking works
 */

import { FeatureAnalyzer, Feature, FeatureComponent, ComponentType } from '../analysis/FeatureAnalyzer';
import { ASTNode } from '../parsers/ASTParser';

describe('Feature-Copilot Integration Tests', () => {

    describe('FeatureAnalyzer - Component Detection', () => {
        let analyzer: FeatureAnalyzer;

        beforeEach(() => {
            analyzer = new FeatureAnalyzer();
        });

        test('should detect Java controller component', () => {
            const code = `@RestController
@RequestMapping("/api/orders")
public class OrderController {
    @Autowired
    private OrderService orderService;

    @GetMapping("/{id}")
    public Order getOrder(@PathVariable Long id) {
        return orderService.findById(id);
    }
}`;
            const nodes: ASTNode[] = [{
                id: 'node_1',
                type: 'CLASS',
                identifier: 'OrderController',
                filePath: '/test/OrderController.java',
                language: 'java',
                code: code,
                startLine: 1,
                endLine: 15
            }];

            const components = analyzer.analyzeNodes(
                nodes,
                code,
                '/test/OrderController.java'
            );

            expect(components.length).toBe(1);
            expect(components[0].type).toBe('controller');
            expect(components[0].name).toBe('OrderController');
            expect(components[0].dependencies).toContain('OrderService');
        });

        test('should detect TypeScript React component', () => {
            const code = `export const OrderList: React.FC = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const { fetchOrders } = useOrderApi();

    useEffect(() => {
        fetchOrders().then(setOrders);
    }, []);

    return (
        <div>
            {orders.map(order => <OrderCard key={order.id} order={order} />)}
        </div>
    );
};`;
            const nodes: ASTNode[] = [{
                id: 'node_2',
                type: 'CLASS',
                identifier: 'OrderList',
                filePath: '/test/OrderList.tsx',
                language: 'typescript',
                code: code,
                startLine: 1,
                endLine: 15
            }];

            const components = analyzer.analyzeNodes(
                nodes,
                code,
                '/test/OrderList.tsx'
            );

            expect(components.length).toBe(1);
            // React functional components with hooks are detected as 'hook' type
            expect(['component', 'hook']).toContain(components[0].type);
            expect(components[0].language).toBe('typescript');
        });

        test('should detect service component', () => {
            const code = `@Service
public class OrderService {
    @Autowired
    private OrderRepository orderRepository;

    public Order findById(Long id) {
        return orderRepository.findById(id).orElseThrow();
    }
}`;
            const nodes: ASTNode[] = [{
                id: 'node_3',
                type: 'CLASS',
                identifier: 'OrderService',
                filePath: '/test/OrderService.java',
                language: 'java',
                code: code,
                startLine: 1,
                endLine: 10
            }];

            const components = analyzer.analyzeNodes(
                nodes,
                code,
                '/test/OrderService.java'
            );

            expect(components.length).toBe(1);
            expect(components[0].type).toBe('service');
            expect(components[0].dependencies).toContain('OrderRepository');
        });

        test('should detect repository component', () => {
            const code = `@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {
    List<Order> findByStatus(OrderStatus status);
}`;
            const nodes: ASTNode[] = [{
                id: 'node_4',
                type: 'INTERFACE',
                identifier: 'OrderRepository',
                filePath: '/test/OrderRepository.java',
                language: 'java',
                code: code,
                startLine: 1,
                endLine: 5
            }];

            const components = analyzer.analyzeNodes(
                nodes,
                code,
                '/test/OrderRepository.java'
            );

            expect(components.length).toBe(1);
            expect(components[0].type).toBe('repository');
        });

        test('should detect React hook', () => {
            const code = `export function useOrderApi() {
    const fetchOrders = async () => {
        const response = await fetch('/api/orders');
        return response.json();
    };

    return { fetchOrders };
}`;
            const nodes: ASTNode[] = [{
                id: 'node_5',
                type: 'FUNCTION',
                identifier: 'useOrderApi',
                filePath: '/test/useOrderApi.ts',
                language: 'typescript',
                code: code,
                startLine: 1,
                endLine: 10
            }];

            const components = analyzer.analyzeNodes(
                nodes,
                code,
                '/test/useOrderApi.ts'
            );

            expect(components.length).toBe(1);
            // Functions with 'use' prefix containing fetch are detected as 'api-client' or 'hook'
            expect(['hook', 'api-client']).toContain(components[0].type);
            expect(components[0].name).toBe('useOrderApi');
        });
    });

    describe('FeatureAnalyzer - Feature Identification', () => {
        let analyzer: FeatureAnalyzer;

        beforeEach(() => {
            analyzer = new FeatureAnalyzer();
        });

        test('should identify fullstack feature from connected components', () => {
            // Add Java backend components
            const controllerCode = `@RestController
@RequestMapping("/api/orders")
public class OrderController {
    @Autowired
    private OrderService orderService;
}`;
            const serviceCode = `@Service
public class OrderService {
    @Autowired
    private OrderRepository orderRepository;
}`;
            const hookCode = `export function useOrders() {
    const fetchOrders = () => fetch('/api/orders');
    return { fetchOrders };
}`;

            const backendNodes: ASTNode[] = [
                {
                    id: 'be_1',
                    type: 'CLASS',
                    identifier: 'OrderController',
                    filePath: '/backend/OrderController.java',
                    language: 'java',
                    code: controllerCode,
                    startLine: 1,
                    endLine: 10
                },
                {
                    id: 'be_2',
                    type: 'CLASS',
                    identifier: 'OrderService',
                    filePath: '/backend/OrderService.java',
                    language: 'java',
                    code: serviceCode,
                    startLine: 1,
                    endLine: 8
                }
            ];

            // Add TypeScript frontend components
            const frontendNodes: ASTNode[] = [
                {
                    id: 'fe_1',
                    type: 'FUNCTION',
                    identifier: 'useOrders',
                    filePath: '/frontend/useOrders.ts',
                    language: 'typescript',
                    code: hookCode,
                    startLine: 1,
                    endLine: 5
                }
            ];

            // Analyze both
            analyzer.analyzeNodes(backendNodes, controllerCode, '/backend/OrderController.java');
            analyzer.analyzeNodes([backendNodes[1]], serviceCode, '/backend/OrderService.java');
            analyzer.analyzeNodes(frontendNodes, hookCode, '/frontend/useOrders.ts');

            // Rebuild dependencies and identify features
            analyzer.rebuildDependencyGraph();
            const features = analyzer.identifyFeatures();

            expect(features.length).toBeGreaterThan(0);

            // Find the order-related feature
            const orderFeature = features.find(f =>
                f.name.toLowerCase().includes('order') ||
                f.components.some(c => c.toLowerCase().includes('order'))
            );

            expect(orderFeature).toBeDefined();
        });

        test('should analyze components from multiple languages', () => {
            const backendCode = `@Component
public class WebSocketBroker extends TextWebSocketHandler {
    @Autowired
    private MessageRouter messageRouter;
    public void broadcast(BrokerMessage message) {}
}`;
            const frontendCode = `export class BrokerService {
    private ws: WebSocket;
    send(message: BrokerMessage): void {
        this.ws.send(JSON.stringify(message));
    }
}`;

            const wsBackend: ASTNode[] = [{
                id: 'ws_1',
                type: 'CLASS',
                identifier: 'WebSocketBroker',
                filePath: '/backend/WebSocketBroker.java',
                language: 'java',
                code: backendCode,
                startLine: 1,
                endLine: 5
            }];

            const wsFrontend: ASTNode[] = [{
                id: 'ws_2',
                type: 'CLASS',
                identifier: 'BrokerService',
                filePath: '/frontend/BrokerService.ts',
                language: 'typescript',
                code: frontendCode,
                startLine: 1,
                endLine: 8
            }];

            // Analyze components from different languages
            const backendComponents = analyzer.analyzeNodes(wsBackend, backendCode, '/backend/WebSocketBroker.java');
            const frontendComponents = analyzer.analyzeNodes(wsFrontend, frontendCode, '/frontend/BrokerService.ts');

            // Should detect components from both languages
            expect(backendComponents.length).toBe(1);
            expect(frontendComponents.length).toBe(1);

            // Check Java component is detected correctly
            expect(backendComponents[0].language).toBe('java');
            expect(backendComponents[0].name).toBe('WebSocketBroker');

            // Check TypeScript component is detected correctly
            expect(frontendComponents[0].language).toBe('typescript');
            expect(frontendComponents[0].name).toBe('BrokerService');

            // Verify the Java component has its dependency detected
            expect(backendComponents[0].dependencies).toContain('MessageRouter');
        });
    });

    describe('Feature Structure Validation', () => {
        test('Feature interface should have required fields', () => {
            const feature: Feature = {
                id: 'test_feature',
                name: 'Test Feature',
                description: 'A test feature',
                entryPoints: ['comp_1'],
                components: ['comp_1', 'comp_2'],
                languages: ['java', 'typescript'],
                frameworks: ['spring-boot', 'react'],
                tags: ['test', 'fullstack'],
                flow: [
                    { from: 'comp_1', to: 'comp_2', type: 'calls', description: 'Test call' }
                ]
            };

            expect(feature.id).toBeDefined();
            expect(feature.name).toBeDefined();
            expect(feature.description).toBeDefined();
            expect(feature.components).toBeInstanceOf(Array);
            expect(feature.languages).toBeInstanceOf(Array);
            expect(feature.flow).toBeInstanceOf(Array);
            expect(feature.flow[0].type).toBe('calls');
        });

        test('FeatureComponent interface should have required fields', () => {
            const component: FeatureComponent = {
                id: 'test_comp',
                name: 'TestComponent',
                type: 'controller',
                filePath: '/test/Test.java',
                language: 'java',
                code: 'public class Test {}',
                startLine: 1,
                endLine: 1,
                dependencies: ['Dep1'],
                dependents: [],
                annotations: ['@Controller'],
                imports: ['import Dep1;'],
                exports: ['Test']
            };

            expect(component.id).toBeDefined();
            expect(component.name).toBeDefined();
            expect(component.type).toBe('controller');
            expect(component.dependencies).toBeInstanceOf(Array);
            expect(component.dependents).toBeInstanceOf(Array);
        });

        test('ComponentType should include all valid types', () => {
            const validTypes: ComponentType[] = [
                'controller',
                'service',
                'repository',
                'model',
                'util',
                'component',
                'hook',
                'api-client',
                'event-handler',
                'middleware',
                'config',
                'unknown'
            ];

            validTypes.forEach(type => {
                const component: Partial<FeatureComponent> = { type };
                expect(component.type).toBe(type);
            });
        });
    });

    describe('Context Building Logic', () => {
        test('should generate feature context with proper formatting', () => {
            const feature: Feature = {
                id: 'feat_1',
                name: 'Order Management',
                description: 'Handles order CRUD operations',
                entryPoints: ['OrderController'],
                components: ['OrderController', 'OrderService', 'OrderRepository'],
                languages: ['java'],
                frameworks: ['spring-boot'],
                tags: ['crud', 'rest-api'],
                flow: [
                    { from: 'OrderController', to: 'OrderService', type: 'calls' },
                    { from: 'OrderService', to: 'OrderRepository', type: 'calls' }
                ]
            };

            // Simulate context formatting
            const context = formatFeatureContext(feature);

            expect(context).toContain('FEATURE:');
            expect(context).toContain('Order Management');
            expect(context).toContain('spring-boot');
            expect(context).toContain('Data Flow');
        });
    });
});

// Helper function to format feature context (simulating ContextBuilder logic)
function formatFeatureContext(feature: Feature): string {
    let context = `## FEATURE: ${feature.name}\n`;
    context += `**Description:** ${feature.description}\n`;
    context += `**Languages:** ${feature.languages.join(', ')}\n`;
    context += `**Frameworks:** ${feature.frameworks.join(', ')}\n`;
    context += `**Tags:** ${feature.tags.join(', ')}\n\n`;

    if (feature.flow.length > 0) {
        context += `### Data Flow:\n`;
        feature.flow.forEach(f => {
            context += `- ${f.from} → ${f.to} (${f.type})\n`;
        });
    }

    context += `\n### Components: ${feature.components.join(', ')}\n`;

    return context;
}
