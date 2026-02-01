/**
 * Feature Analyzer - End-to-end feature tracking across codebase
 *
 * Identifies features by:
 * 1. Finding entry points (controllers, API endpoints, event handlers, UI components)
 * 2. Tracing dependencies (services, repositories, utilities)
 * 3. Building feature graphs showing how components connect
 * 4. Extracting meaningful feature descriptions
 */

import { ASTNode } from '../parsers/ASTParser';

export interface FeatureComponent {
    id: string;
    name: string;
    type: ComponentType;
    filePath: string;
    language: string;
    code: string;
    startLine: number;
    endLine: number;
    dependencies: string[];  // IDs of components this depends on
    dependents: string[];    // IDs of components that depend on this
    annotations: string[];   // @Controller, @Service, etc.
    imports: string[];       // What this component imports
    exports: string[];       // What this component exports
}

export type ComponentType =
    | 'controller'      // HTTP/gRPC entry points
    | 'service'         // Business logic
    | 'repository'      // Data access
    | 'model'           // Domain models/entities
    | 'util'            // Utility/helper
    | 'component'       // UI component
    | 'hook'            // React hook
    | 'api-client'      // API client/caller
    | 'event-handler'   // Event/message handlers
    | 'middleware'      // Middleware/interceptors
    | 'config'          // Configuration
    | 'builder'         // Builder pattern
    | 'factory'         // Factory/Creator pattern
    | 'strategy'        // Strategy/Policy pattern
    | 'observer'        // Observer/Listener/Subscriber pattern
    | 'singleton'       // Singleton pattern
    | 'adapter'         // Adapter/Wrapper pattern
    | 'unknown';

export interface Feature {
    id: string;
    name: string;
    description: string;
    entryPoints: string[];      // Component IDs that are entry points
    components: string[];       // All component IDs in this feature
    languages: string[];        // Languages involved (java, typescript, etc.)
    frameworks: string[];       // Frameworks detected (spring, react, etc.)
    tags: string[];
    flow: FeatureFlow[];        // The data/call flow through the feature
    module?: string;            // Module name for multi-module projects (e.g., "permissions", "onboarding")
    modulePath?: string;        // Path to module root
    crossModuleDeps?: string[]; // Feature IDs from other modules this depends on
}

export interface FeatureFlow {
    from: string;       // Component ID
    to: string;         // Component ID
    type: 'calls' | 'imports' | 'injects' | 'emits' | 'subscribes';
    description?: string;
}

export interface DependencyInfo {
    name: string;
    type: 'import' | 'inject' | 'call' | 'extend' | 'implement';
    source?: string;  // File or package
}

export class FeatureAnalyzer {
    private components: Map<string, FeatureComponent> = new Map();
    private componentsByName: Map<string, FeatureComponent[]> = new Map();
    private features: Map<string, Feature> = new Map();
    private dependencyGraph: Map<string, Set<string>> = new Map();
    private reverseDependencyGraph: Map<string, Set<string>> = new Map();

    /**
     * Analyze AST nodes and build feature graph
     */
    analyzeNodes(nodes: ASTNode[], fileContent: string, filePath: string): FeatureComponent[] {
        const components: FeatureComponent[] = [];
        const imports = this.extractImports(fileContent, filePath);
        const annotations = this.extractAnnotations(fileContent);

        for (const node of nodes) {
            const component = this.analyzeNode(node, imports, annotations, fileContent);
            if (component) {
                components.push(component);
                this.components.set(component.id, component);

                // Index by name for multi-module disambiguation
                const lowerName = component.name.toLowerCase();
                if (!this.componentsByName.has(lowerName)) {
                    this.componentsByName.set(lowerName, []);
                }
                this.componentsByName.get(lowerName)!.push(component);

                this.updateDependencyGraph(component);
            }
        }

        return components;
    }

    /**
     * Analyze a single AST node and create a FeatureComponent
     */
    private analyzeNode(
        node: ASTNode,
        imports: DependencyInfo[],
        annotations: string[],
        fileContent: string
    ): FeatureComponent | null {
        const componentType = this.detectComponentType(node, annotations, fileContent);

        // Filter out trivial components
        if (this.isTrivialComponent(node, componentType)) {
            return null;
        }

        const dependencies = this.extractDependencies(node, imports, fileContent);
        const nodeAnnotations = this.extractNodeAnnotations(node.code || '');

        return {
            id: node.id,
            name: node.identifier,
            type: componentType,
            filePath: node.filePath,
            language: node.language,
            code: node.code || '',
            startLine: node.startLine,
            endLine: node.endLine,
            dependencies: dependencies.map(d => d.name),
            dependents: [],
            annotations: nodeAnnotations,
            imports: imports.map(i => i.name),
            exports: this.extractExports(node.code || '', node.language)
        };
    }

    /**
     * Detect the type of component based on patterns
     */
    private detectComponentType(node: ASTNode, annotations: string[], content: string): ComponentType {
        const code = node.code || '';
        const name = node.identifier.toLowerCase();

        // Design pattern detection (by naming convention) - check FIRST so
        // patterns like NotificationBuilder aren't swallowed by @Component → service
        if (name.endsWith('builder')) {
            return 'builder';
        }
        if (name.endsWith('factory') || name.endsWith('creator')) {
            return 'factory';
        }
        if (name.endsWith('strategy') || name.endsWith('policy')) {
            return 'strategy';
        }
        if (name.endsWith('observer') || name.endsWith('listener') || name.endsWith('subscriber')) {
            return 'observer';
        }
        if (name.endsWith('adapter') || name.endsWith('wrapper')) {
            return 'adapter';
        }

        // Design pattern detection (by code structure)
        // Singleton: must DEFINE getInstance, not just call it
        if (code.includes('private static instance') ||
            /static\s+getInstance\s*\(/.test(code) ||
            /static\s+get\s+instance\s*\(/.test(code)) {
            return 'singleton';
        }

        // Check annotations (most reliable for Java/Spring)
        if (annotations.some(a => ['@RestController', '@Controller', '@RequestMapping'].includes(a))) {
            return 'controller';
        }
        if (annotations.some(a => ['@Service', '@Component'].includes(a))) {
            return 'service';
        }
        if (annotations.some(a => ['@Repository', '@Dao'].includes(a))) {
            return 'repository';
        }
        if (annotations.some(a => ['@Entity', '@Table', '@Document'].includes(a))) {
            return 'model';
        }
        if (code.includes('.build()') && (code.includes('return this') || code.includes('return new'))) {
            return 'builder';
        }
        if (/create\w+\(/.test(code) && code.includes('return new')) {
            return 'factory';
        }
        if (code.includes('implements Strategy') || code.includes('implements Policy')) {
            return 'strategy';
        }

        // Check naming conventions
        // React hooks by convention start with "use" followed by uppercase letter
        const originalName = node.identifier;
        if (originalName.startsWith('use') && originalName.length > 3 && originalName[3] >= 'A' && originalName[3] <= 'Z') {
            return 'hook';
        }
        if (name.endsWith('controller') || name.endsWith('handler') || name.endsWith('endpoint')) {
            return 'controller';
        }
        if (name.endsWith('service') || name.endsWith('manager') || name.endsWith('orchestrator')) {
            return 'service';
        }
        if (name.endsWith('repository') || name.endsWith('dao') || name.endsWith('store')) {
            return 'repository';
        }
        if (name.endsWith('model') || name.endsWith('entity') || name.endsWith('dto')) {
            return 'model';
        }
        if (name.endsWith('util') || name.endsWith('utils') || name.endsWith('helper')) {
            return 'util';
        }
        if (name.endsWith('client') || name.endsWith('api')) {
            return 'api-client';
        }

        // Check code patterns - React
        // Components with JSX are 'component'; pure hook files without JSX are 'hook'
        const hasJSX = code.includes('return (') && code.includes('<') || code.includes('React.');
        const hasHooks = code.includes('useState') || code.includes('useEffect') || code.includes('useMemo');
        if (hasJSX) {
            return 'component';
        }
        if (hasHooks) {
            return 'hook';
        }

        // Check code patterns - Java/backend
        if (code.includes('@GetMapping') || code.includes('@PostMapping') || code.includes('router.') || code.includes('app.get')) {
            return 'controller';
        }
        if (code.includes('StreamObserver') || code.includes('onNext') || code.includes('onCompleted')) {
            return 'event-handler';
        }
        if (code.includes('SELECT') || code.includes('INSERT') || code.includes('findBy') || code.includes('.query(')) {
            return 'repository';
        }

        // Check for middleware patterns (more specific to avoid false positives)
        if (code.includes('next(') && (code.includes('middleware') || code.includes('interceptor'))) {
            return 'middleware';
        }

        return 'unknown';
    }

    /**
     * Extract dependencies from code
     */
    private extractDependencies(node: ASTNode, imports: DependencyInfo[], content: string): DependencyInfo[] {
        const deps: DependencyInfo[] = [];
        const code = node.code || '';

        // Add relevant imports as dependencies
        for (const imp of imports) {
            if (code.includes(imp.name)) {
                deps.push(imp);
            }
        }

        // Detect injected dependencies (Spring @Autowired)
        const autowiredMatches = code.matchAll(/@Autowired\s+(?:private\s+)?(\w+)\s+(\w+)/g);
        for (const match of autowiredMatches) {
            deps.push({ name: match[1], type: 'inject' });
        }

        // Detect constructor injection
        const constructorParams = code.match(/constructor\s*\([^)]+\)/);
        if (constructorParams) {
            const params = constructorParams[0].match(/(\w+)\s*:\s*(\w+)/g);
            if (params) {
                for (const param of params) {
                    const [, type] = param.split(':').map(s => s.trim());
                    if (type && !this.isPrimitiveType(type)) {
                        deps.push({ name: type, type: 'inject' });
                    }
                }
            }
        }

        // Detect method calls to services
        const serviceCallPatterns = [
            /this\.(\w+Service)\./g,
            /this\.(\w+Repository)\./g,
            /this\.(\w+Client)\./g,
            /(\w+Service)\.\w+\(/g,
            /(\w+Repository)\.\w+\(/g
        ];

        for (const pattern of serviceCallPatterns) {
            const matches = code.matchAll(pattern);
            for (const match of matches) {
                if (!deps.some(d => d.name === match[1])) {
                    deps.push({ name: match[1], type: 'call' });
                }
            }
        }

        return deps;
    }

    /**
     * Extract imports from file content
     */
    private extractImports(content: string, filePath: string): DependencyInfo[] {
        const imports: DependencyInfo[] = [];
        const isJava = filePath.endsWith('.java');
        const isTS = filePath.endsWith('.ts') || filePath.endsWith('.tsx');

        if (isJava) {
            const matches = content.matchAll(/import\s+([\w.]+);/g);
            for (const match of matches) {
                const parts = match[1].split('.');
                const name = parts[parts.length - 1];
                // Skip standard library imports
                if (!match[1].startsWith('java.') && !match[1].startsWith('javax.')) {
                    imports.push({ name, type: 'import', source: match[1] });
                }
            }
        }

        if (isTS) {
            // Named imports
            const namedMatches = content.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g);
            for (const match of namedMatches) {
                const names = match[1].split(',').map(n => n.trim().split(' as ')[0].trim());
                for (const name of names) {
                    if (name) {
                        imports.push({ name, type: 'import', source: match[2] });
                    }
                }
            }

            // Default imports
            const defaultMatches = content.matchAll(/import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g);
            for (const match of defaultMatches) {
                imports.push({ name: match[1], type: 'import', source: match[2] });
            }
        }

        return imports;
    }

    /**
     * Extract annotations from file
     */
    private extractAnnotations(content: string): string[] {
        const annotations: string[] = [];
        const matches = content.matchAll(/@(\w+)(?:\([^)]*\))?/g);
        for (const match of matches) {
            annotations.push('@' + match[1]);
        }
        return [...new Set(annotations)];
    }

    /**
     * Extract annotations specific to a node's code
     */
    private extractNodeAnnotations(code: string): string[] {
        const annotations: string[] = [];
        const matches = code.matchAll(/@(\w+)(?:\([^)]*\))?/g);
        for (const match of matches) {
            annotations.push('@' + match[1]);
        }
        return [...new Set(annotations)];
    }

    /**
     * Extract exports from code
     */
    private extractExports(code: string, language: string): string[] {
        const exports: string[] = [];

        if (language === 'typescript' || language === 'javascript') {
            // export const/function/class
            const matches = code.matchAll(/export\s+(?:const|function|class|interface|type)\s+(\w+)/g);
            for (const match of matches) {
                exports.push(match[1]);
            }
            // export default
            if (code.includes('export default')) {
                exports.push('default');
            }
        }

        if (language === 'java') {
            // Public classes/methods are "exported"
            const classMatches = code.matchAll(/public\s+(?:class|interface|enum)\s+(\w+)/g);
            for (const match of classMatches) {
                exports.push(match[1]);
            }
        }

        return exports;
    }

    /**
     * Update dependency graph with new component
     */
    private updateDependencyGraph(component: FeatureComponent): void {
        // Forward dependencies
        if (!this.dependencyGraph.has(component.id)) {
            this.dependencyGraph.set(component.id, new Set());
        }

        for (const depName of component.dependencies) {
            // Try to find the component by name, using referrer path for disambiguation
            const depComponent = this.findComponentByName(depName, component.filePath);
            if (depComponent) {
                this.dependencyGraph.get(component.id)!.add(depComponent.id);

                // Reverse dependency
                if (!this.reverseDependencyGraph.has(depComponent.id)) {
                    this.reverseDependencyGraph.set(depComponent.id, new Set());
                }
                this.reverseDependencyGraph.get(depComponent.id)!.add(component.id);

                // Update dependent's dependents list
                depComponent.dependents.push(component.id);
            }
        }
    }

    /**
     * Find component by name
     */
    private findComponentByName(name: string, referrerFilePath?: string): FeatureComponent | undefined {
        const lowerName = name.toLowerCase();
        const candidates = this.componentsByName.get(lowerName) || [];

        if (candidates.length === 0) {
            // Try matching against exports
            for (const [, component] of this.components) {
                if (component.exports.includes(name)) {
                    return component;
                }
            }
            return undefined;
        }

        if (candidates.length === 1) {
            return candidates[0];
        }

        // Multiple candidates - disambiguate by proximity to referrer
        if (referrerFilePath) {
            const referrerDir = referrerFilePath.substring(0, referrerFilePath.lastIndexOf('/'));

            // Prefer same directory
            const sameDir = candidates.find(c => c.filePath.startsWith(referrerDir + '/'));
            if (sameDir) {
                return sameDir;
            }

            // Prefer same parent directory (module-level)
            const parentDir = referrerDir.substring(0, referrerDir.lastIndexOf('/'));
            const sameParent = candidates.find(c => c.filePath.startsWith(parentDir + '/'));
            if (sameParent) {
                return sameParent;
            }
        }

        // Fallback: return first candidate
        return candidates[0];
    }

    /**
     * Check if component is trivial and should be skipped
     */
    private isTrivialComponent(node: ASTNode, type: ComponentType): boolean {
        const code = node.code || '';
        const name = node.identifier.toLowerCase();

        // Skip very short code
        if (code.length < 100) {
            return true;
        }

        // Skip standard library types
        const trivialNames = [
            'string', 'number', 'boolean', 'object', 'array', 'map', 'set',
            'list', 'hashmap', 'arraylist', 'optional', 'stream',
            'date', 'timestamp', 'uuid', 'exception', 'error'
        ];
        if (trivialNames.includes(name)) {
            return true;
        }

        // Skip simple getters/setters
        if (node.type === 'METHOD') {
            if ((name.startsWith('get') || name.startsWith('set')) && code.split('\n').length <= 4) {
                return true;
            }
        }

        // Keep entry points and services, filter unknown short code
        if (type === 'unknown' && code.length < 200) {
            return true;
        }

        return false;
    }

    /**
     * Check if type is primitive
     */
    private isPrimitiveType(type: string): boolean {
        const primitives = [
            'string', 'number', 'boolean', 'void', 'any', 'unknown', 'never', 'null', 'undefined',
            'String', 'int', 'Integer', 'long', 'Long', 'double', 'Double', 'float', 'Float',
            'boolean', 'Boolean', 'void', 'byte', 'Byte', 'short', 'Short', 'char', 'Character'
        ];
        return primitives.includes(type);
    }

    /**
     * Rebuild dependency graph after all components are loaded
     * This ensures cross-file dependencies are properly connected
     */
    rebuildDependencyGraph(): void {
        // Clear existing graphs
        this.dependencyGraph.clear();
        this.reverseDependencyGraph.clear();

        // Reset all dependents
        for (const component of this.components.values()) {
            component.dependents = [];
        }

        // Rebuild for all components
        for (const component of this.components.values()) {
            if (!this.dependencyGraph.has(component.id)) {
                this.dependencyGraph.set(component.id, new Set());
            }

            for (const depName of component.dependencies) {
                const depComponent = this.findComponentByName(depName, component.filePath);
                if (depComponent && depComponent.id !== component.id) {
                    this.dependencyGraph.get(component.id)!.add(depComponent.id);

                    // Reverse dependency
                    if (!this.reverseDependencyGraph.has(depComponent.id)) {
                        this.reverseDependencyGraph.set(depComponent.id, new Set());
                    }
                    this.reverseDependencyGraph.get(depComponent.id)!.add(component.id);

                    // Update dependent's dependents list
                    if (!depComponent.dependents.includes(component.id)) {
                        depComponent.dependents.push(component.id);
                    }
                }
            }
        }

        console.log(`Rebuilt dependency graph: ${this.dependencyGraph.size} nodes, ${Array.from(this.dependencyGraph.values()).reduce((sum, s) => sum + s.size, 0)} edges`);
    }

    /**
     * Identify features by tracing from entry points
     */
    identifyFeatures(): Feature[] {
        // First, rebuild dependency graph to ensure cross-file deps are connected
        this.rebuildDependencyGraph();

        const features: Feature[] = [];

        // Find all entry points
        const entryPoints = Array.from(this.components.values())
            .filter(c => this.isEntryPoint(c));

        // Secondary pass: components with no dependents but has dependencies (potential orphan entry points)
        const additionalEntryPoints = Array.from(this.components.values())
            .filter(c => !this.isEntryPoint(c) &&
                         !['model', 'config', 'util', 'unknown'].includes(c.type) &&
                         c.dependents.length === 0 &&
                         c.dependencies.length > 0);

        const allEntryPoints = [...entryPoints, ...additionalEntryPoints];

        for (const entryPoint of allEntryPoints) {
            // Each feature gets its own visited set (allows shared components across features)
            const visited = new Set<string>();
            const featureComponents = this.traceFeature(entryPoint, visited);

            if (featureComponents.length > 0) {
                const feature = this.buildFeature(entryPoint, featureComponents);
                features.push(feature);
                this.features.set(feature.id, feature);
            }
        }

        // Post-process: merge related features (same domain or high component overlap)
        const mergedFeatures = this.mergeRelatedFeatures(features);

        return mergedFeatures;
    }

    /**
     * Check if component is an entry point
     */
    private isEntryPoint(component: FeatureComponent): boolean {
        // Check by component type
        if (['controller', 'event-handler', 'component', 'hook', 'observer'].includes(component.type)) {
            return true;
        }

        // Check by annotation
        if (component.annotations.some(a =>
            ['@RestController', '@Controller', '@GetMapping', '@PostMapping',
             '@GrpcService', '@EventListener', '@MessageMapping',
             '@KafkaListener', '@RabbitListener', '@StreamListener',
             '@Scheduled', '@Async', '@SpringBootApplication'].includes(a)
        )) {
            return true;
        }

        // Check by code patterns - router registrations, main methods, route components
        const code = component.code || '';
        if (code.includes('router.get(') || code.includes('router.post(') ||
            code.includes('app.get(') || code.includes('app.post(') || code.includes('app.use(')) {
            return true;
        }
        if (code.includes('<Route') || code.includes('useRouter(')) {
            return true;
        }
        if (code.includes('public static void main(')) {
            return true;
        }

        return false;
    }

    /**
     * Trace all components that belong to a feature starting from entry point
     */
    private traceFeature(entryPoint: FeatureComponent, processed: Set<string>): FeatureComponent[] {
        const components: FeatureComponent[] = [entryPoint];
        const toProcess = [entryPoint.id];
        processed.add(entryPoint.id);

        while (toProcess.length > 0) {
            const currentId = toProcess.shift()!;
            const deps = this.dependencyGraph.get(currentId);

            if (deps) {
                for (const depId of deps) {
                    if (!processed.has(depId)) {
                        const depComponent = this.components.get(depId);
                        if (depComponent) {
                            processed.add(depId);
                            components.push(depComponent);
                            toProcess.push(depId);
                        }
                    }
                }
            }
        }

        return components;
    }

    /**
     * Build a Feature from entry point and its components
     */
    private buildFeature(entryPoint: FeatureComponent, components: FeatureComponent[]): Feature {
        const languages = [...new Set(components.map(c => c.language))];
        const frameworks = this.detectFrameworks(components);
        const tags = this.generateFeatureTags(components);
        const flow = this.buildFeatureFlow(entryPoint, components);

        // Generate feature name from entry point
        const featureName = this.generateFeatureName(entryPoint);

        return {
            id: `feature-${entryPoint.id}`,
            name: featureName,
            description: this.generateFeatureDescription(entryPoint, components),
            entryPoints: [entryPoint.id],
            components: components.map(c => c.id),
            languages,
            frameworks,
            tags,
            flow
        };
    }

    /**
     * Generate feature name from entry point
     */
    private generateFeatureName(entryPoint: FeatureComponent): string {
        let name = entryPoint.name;

        // Remove common suffixes
        name = name.replace(/Controller$/, '')
                   .replace(/Handler$/, '')
                   .replace(/Component$/, '')
                   .replace(/Service$/, '')
                   .replace(/Renderer$/, '')
                   .replace(/Observer$/, '')
                   .replace(/Manager$/, '')
                   .replace(/Factory$/, '')
                   .replace(/Builder$/, '');

        // Convert camelCase to readable format, keeping acronyms together
        // e.g. "SDUIRenderer" -> "SDUI", "GridDataService" -> "Grid Data"
        return name.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
                   .replace(/([a-z])([A-Z])/g, '$1 $2')
                   .trim();
    }

    /**
     * Generate feature description
     */
    private generateFeatureDescription(entryPoint: FeatureComponent, components: FeatureComponent[]): string {
        const types = components.map(c => c.type);
        const hasService = types.includes('service');
        const hasRepo = types.includes('repository');
        const hasApi = entryPoint.type === 'controller';

        let desc = `${entryPoint.type === 'controller' ? 'API' : 'Feature'}: ${entryPoint.name}`;

        if (hasService && hasRepo) {
            desc += ' - Full stack feature with business logic and data access';
        } else if (hasService) {
            desc += ' - Business logic feature';
        } else if (hasRepo) {
            desc += ' - Data access feature';
        }

        desc += ` (${components.length} components across ${new Set(components.map(c => c.language)).size} language(s))`;

        return desc;
    }

    /**
     * Detect frameworks used in components
     */
    private detectFrameworks(components: FeatureComponent[]): string[] {
        const frameworks = new Set<string>();

        for (const component of components) {
            const code = component.code;
            const annotations = component.annotations;

            if (annotations.some(a => a.startsWith('@') &&
                ['RestController', 'Service', 'Repository', 'Autowired', 'Component'].some(s => a.includes(s)))) {
                frameworks.add('spring');
            }
            if (code.includes('useState') || code.includes('useEffect') || code.includes('React')) {
                frameworks.add('react');
            }
            if (code.includes('StreamObserver') || code.includes('grpc')) {
                frameworks.add('grpc');
            }
            if (code.includes('express') || code.includes('router.get') || code.includes('app.post')) {
                frameworks.add('express');
            }
            if (annotations.some(a => a.includes('Entity') || a.includes('Table'))) {
                frameworks.add('jpa');
            }
        }

        return Array.from(frameworks);
    }

    /**
     * Generate tags for a feature
     */
    private generateFeatureTags(components: FeatureComponent[]): string[] {
        const tags = new Set<string>();

        for (const component of components) {
            tags.add(component.type);
            tags.add(component.language);
            component.annotations.forEach(a => tags.add(a.replace('@', '').toLowerCase()));
        }

        return Array.from(tags);
    }

    /**
     * Build the flow diagram for a feature
     */
    private buildFeatureFlow(entryPoint: FeatureComponent, components: FeatureComponent[]): FeatureFlow[] {
        const flow: FeatureFlow[] = [];
        const componentMap = new Map(components.map(c => [c.id, c]));

        for (const component of components) {
            const deps = this.dependencyGraph.get(component.id);
            if (deps) {
                for (const depId of deps) {
                    if (componentMap.has(depId)) {
                        flow.push({
                            from: component.id,
                            to: depId,
                            type: 'calls',
                            description: `${component.name} -> ${componentMap.get(depId)!.name}`
                        });
                    }
                }
            }
        }

        return flow;
    }

    /**
     * Get all identified features
     */
    getFeatures(): Feature[] {
        return Array.from(this.features.values());
    }

    /**
     * Get all components
     */
    getComponents(): FeatureComponent[] {
        return Array.from(this.components.values());
    }

    /**
     * Get component by ID
     */
    getComponent(id: string): FeatureComponent | undefined {
        return this.components.get(id);
    }

    /**
     * Merge related features that share the same domain or have high component overlap
     */
    private mergeRelatedFeatures(features: Feature[]): Feature[] {
        if (features.length <= 1) {
            return features;
        }

        // Strategy 1: Merge by domain name prefix
        const domainGroups = new Map<string, Feature[]>();
        for (const feature of features) {
            const domain = this.extractDomainName(feature.name);
            if (!domainGroups.has(domain)) {
                domainGroups.set(domain, []);
            }
            domainGroups.get(domain)!.push(feature);
        }

        let merged: Feature[] = [];
        for (const [domain, group] of domainGroups) {
            if (group.length === 1) {
                merged.push(group[0]);
            } else {
                merged.push(this.mergeFeatureGroup(domain, group));
            }
        }

        // Strategy 2: Merge features with >50% component overlap
        merged = this.mergeByComponentOverlap(merged, 0.5);

        // Re-register merged features
        this.features.clear();
        for (const feature of merged) {
            this.features.set(feature.id, feature);
        }

        return merged;
    }

    /**
     * Extract domain name from feature name for grouping
     * e.g. "Order" from "Order Controller", "Order Web Socket"
     */
    private extractDomainName(featureName: string): string {
        const words = featureName.trim().split(/\s+/);
        const genericSuffixes = ['web', 'socket', 'ws', 'grpc', 'rest', 'api', 'event', 'message', 'stream', 'management'];
        const meaningful = words.filter(w => !genericSuffixes.includes(w.toLowerCase()));
        return meaningful.join(' ') || words[0];
    }

    /**
     * Merge a group of features into a single feature
     */
    private mergeFeatureGroup(domain: string, features: Feature[]): Feature {
        const allEntryPoints = [...new Set(features.flatMap(f => f.entryPoints))];
        const allComponents = [...new Set(features.flatMap(f => f.components))];
        const allLanguages = [...new Set(features.flatMap(f => f.languages))];
        const allFrameworks = [...new Set(features.flatMap(f => f.frameworks))];
        const allTags = [...new Set(features.flatMap(f => f.tags))];
        const allFlows = features.flatMap(f => f.flow);

        // Deduplicate flows
        const flowKeys = new Set<string>();
        const uniqueFlows = allFlows.filter(f => {
            const key = `${f.from}->${f.to}`;
            if (flowKeys.has(key)) { return false; }
            flowKeys.add(key);
            return true;
        });

        return {
            id: `feature-merged-${domain.toLowerCase().replace(/\s+/g, '-')}`,
            name: domain.endsWith('Management') ? domain : `${domain} Management`,
            description: `Merged feature: ${features.map(f => f.name).join(', ')} (${allComponents.length} components across ${allLanguages.length} language(s))`,
            entryPoints: allEntryPoints,
            components: allComponents,
            languages: allLanguages,
            frameworks: allFrameworks,
            tags: allTags,
            flow: uniqueFlows
        };
    }

    /**
     * Merge features with significant component overlap
     */
    private mergeByComponentOverlap(features: Feature[], threshold: number): Feature[] {
        const result = [...features];
        let merged = true;

        while (merged) {
            merged = false;
            for (let i = 0; i < result.length; i++) {
                for (let j = i + 1; j < result.length; j++) {
                    const setA = new Set(result[i].components);
                    const setB = new Set(result[j].components);
                    const intersection = [...setA].filter(c => setB.has(c));
                    const smaller = Math.min(setA.size, setB.size);

                    if (smaller > 0 && intersection.length / smaller >= threshold) {
                        const mergedName = this.extractDomainName(result[i].name);
                        result[i] = this.mergeFeatureGroup(mergedName, [result[i], result[j]]);
                        result.splice(j, 1);
                        merged = true;
                        break;
                    }
                }
                if (merged) { break; }
            }
        }

        return result;
    }

    /**
     * Clear all data
     */
    clear(): void {
        this.components.clear();
        this.componentsByName.clear();
        this.features.clear();
        this.dependencyGraph.clear();
        this.reverseDependencyGraph.clear();
    }

    /**
     * Get statistics
     */
    getStats(): {
        totalComponents: number;
        totalFeatures: number;
        componentsByType: Record<string, number>;
        componentsByLanguage: Record<string, number>;
    } {
        const componentsByType: Record<string, number> = {};
        const componentsByLanguage: Record<string, number> = {};

        for (const component of this.components.values()) {
            componentsByType[component.type] = (componentsByType[component.type] || 0) + 1;
            componentsByLanguage[component.language] = (componentsByLanguage[component.language] || 0) + 1;
        }

        return {
            totalComponents: this.components.size,
            totalFeatures: this.features.size,
            componentsByType,
            componentsByLanguage
        };
    }
}
