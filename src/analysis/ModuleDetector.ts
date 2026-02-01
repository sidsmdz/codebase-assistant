import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Represents a module in a multi-module project
 */
export interface ProjectModule {
    id: string;              // Unique identifier
    name: string;            // Module name (e.g., "permissions", "onboarding")
    path: string;            // Absolute path to module root
    type: 'maven' | 'gradle' | 'npm' | 'yarn' | 'unknown';
    language: 'java' | 'typescript' | 'javascript' | 'mixed';
    dependencies: string[];  // Module IDs this module depends on
    features: string[];      // Feature IDs in this module
}

/**
 * Cross-module dependency between features
 */
export interface CrossModuleDependency {
    fromModule: string;      // Source module ID
    fromFeature: string;     // Source feature ID
    toModule: string;        // Target module ID
    toFeature: string;       // Target feature ID
    type: 'import' | 'api-call' | 'shared-model' | 'event';
    strength: number;        // 0-1, how strongly coupled
}

/**
 * Detects and manages multi-module project structure
 */
export class ModuleDetector {
    private modules: Map<string, ProjectModule> = new Map();
    private modulesByPath: Map<string, ProjectModule> = new Map();
    private crossModuleDeps: CrossModuleDependency[] = [];

    /**
     * Scan workspace for modules
     */
    async detectModules(workspaceRoot: string): Promise<ProjectModule[]> {
        this.modules.clear();
        this.modulesByPath.clear();

        // Check if this is a multi-module project
        const rootModule = await this.detectRootModule(workspaceRoot);
        
        if (rootModule) {
            // Single module project
            this.modules.set(rootModule.id, rootModule);
            this.modulesByPath.set(rootModule.path, rootModule);
            return [rootModule];
        }

        // Multi-module project - scan for submodules
        const submodules = await this.scanForSubmodules(workspaceRoot);
        
        for (const module of submodules) {
            this.modules.set(module.id, module);
            this.modulesByPath.set(module.path, module);
        }

        // Detect inter-module dependencies
        await this.detectInterModuleDependencies();

        return Array.from(this.modules.values());
    }

    /**
     * Get module for a given file path
     */
    getModuleForFile(filePath: string): ProjectModule | undefined {
        // Find the module with the longest matching path prefix
        let bestMatch: ProjectModule | undefined;
        let bestMatchLength = 0;

        for (const [modulePath, module] of this.modulesByPath) {
            if (filePath.startsWith(modulePath) && modulePath.length > bestMatchLength) {
                bestMatch = module;
                bestMatchLength = modulePath.length;
            }
        }

        return bestMatch;
    }

    /**
     * Get all modules
     */
    getAllModules(): ProjectModule[] {
        return Array.from(this.modules.values());
    }

    /**
     * Manually register a module (for synthetic/fallback modules)
     */
    registerModule(module: ProjectModule): void {
        this.modules.set(module.id, module);
        this.modulesByPath.set(module.path, module);
    }

    /**
     * Get module by name
     */
    getModuleByName(name: string): ProjectModule | undefined {
        for (const module of this.modules.values()) {
            if (module.name.toLowerCase() === name.toLowerCase()) {
                return module;
            }
        }
        return undefined;
    }

    /**
     * Get cross-module dependencies
     */
    getCrossModuleDependencies(): CrossModuleDependency[] {
        return this.crossModuleDeps;
    }

    /**
     * Add cross-module dependency
     */
    addCrossModuleDependency(dep: CrossModuleDependency): void {
        this.crossModuleDeps.push(dep);
    }

    /**
     * Get features that cross from one module to another
     */
    getModuleInteractions(moduleA: string, moduleB: string): CrossModuleDependency[] {
        return this.crossModuleDeps.filter(dep =>
            (dep.fromModule === moduleA && dep.toModule === moduleB) ||
            (dep.fromModule === moduleB && dep.toModule === moduleA)
        );
    }

    /**
     * Detect if workspace root itself is a module
     */
    private async detectRootModule(workspaceRoot: string): Promise<ProjectModule | null> {
        const files = await fs.readdir(workspaceRoot);
        
        // Check for module indicators
        const hasPom = files.includes('pom.xml');
        const hasBuildGradle = files.includes('build.gradle') || files.includes('build.gradle.kts');
        const hasPackageJson = files.includes('package.json');

        // If root has build file AND src directory, it's a single-module project
        const hasSrc = files.includes('src');
        
        if (hasSrc && (hasPom || hasBuildGradle || hasPackageJson)) {
            return this.createModuleFromPath(workspaceRoot, path.basename(workspaceRoot));
        }

        return null;
    }

    /**
     * Scan for submodules in multi-module project
     */
    private async scanForSubmodules(workspaceRoot: string): Promise<ProjectModule[]> {
        const modules: ProjectModule[] = [];
        const visited = new Set<string>();
        const self = this;

        async function scanDirectory(dir: string, depth: number = 0): Promise<void> {
            if (depth > 3 || visited.has(dir)) {
                return; // Limit recursion depth
            }
            visited.add(dir);

            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    if (!entry.isDirectory()) {
                        continue;
                    }

                    // Skip common non-module directories
                    if (['node_modules', 'target', 'build', 'dist', '.git', 'out'].includes(entry.name)) {
                        continue;
                    }

                    const subPath = path.join(dir, entry.name);
                    const subFiles = await fs.readdir(subPath);

                    // Check if this directory is a module
                    const hasPom = subFiles.includes('pom.xml');
                    const hasBuildGradle = subFiles.includes('build.gradle') || subFiles.includes('build.gradle.kts');
                    const hasPackageJson = subFiles.includes('package.json');
                    const hasSrc = subFiles.includes('src');

                    if (hasSrc && (hasPom || hasBuildGradle || hasPackageJson)) {
                        const module = await self.createModuleFromPath(subPath, entry.name);
                        modules.push(module);
                    } else {
                        // Continue scanning subdirectories
                        await scanDirectory(subPath, depth + 1);
                    }
                }
            } catch (err) {
                console.error(`Error scanning directory ${dir}:`, err);
            }
        }

        await scanDirectory(workspaceRoot);
        return modules;
    }

    /**
     * Create module object from path
     */
    private async createModuleFromPath(modulePath: string, moduleName: string): Promise<ProjectModule> {
        const files = await fs.readdir(modulePath);
        
        let type: ProjectModule['type'] = 'unknown';
        let language: ProjectModule['language'] = 'mixed';

        // Detect module type
        if (files.includes('pom.xml')) {
            type = 'maven';
            language = 'java';
        } else if (files.includes('build.gradle') || files.includes('build.gradle.kts')) {
            type = 'gradle';
            language = 'java';
        } else if (files.includes('package.json')) {
            const packageJsonPath = path.join(modulePath, 'package.json');
            try {
                const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
                type = packageJson.workspaces ? 'yarn' : 'npm';
                
                // Check for TypeScript
                const hasTsConfig = files.includes('tsconfig.json');
                language = hasTsConfig ? 'typescript' : 'javascript';
            } catch (e) {
                type = 'npm';
            }
        }

        // Generate unique ID
        const id = `${moduleName}-${type}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

        return {
            id,
            name: moduleName,
            path: modulePath,
            type,
            language,
            dependencies: [], // Will be populated by detectInterModuleDependencies
            features: []      // Will be populated when features are analyzed
        };
    }

    /**
     * Detect dependencies between modules
     */
    private async detectInterModuleDependencies(): Promise<void> {
        for (const module of this.modules.values()) {
            const deps = await this.getModuleDependencies(module);
            module.dependencies = deps;
        }
    }

    /**
     * Get module dependencies from build files
     */
    private async getModuleDependencies(module: ProjectModule): Promise<string[]> {
        const deps: string[] = [];

        try {
            if (module.type === 'maven') {
                const pomPath = path.join(module.path, 'pom.xml');
                const pomContent = await fs.readFile(pomPath, 'utf-8');
                
                // Simple regex-based parsing (could be enhanced with XML parser)
                const dependencyPattern = /<artifactId>([^<]+)<\/artifactId>/g;
                let match;
                while ((match = dependencyPattern.exec(pomContent)) !== null) {
                    const artifactId = match[1];
                    // Check if this is a local module
                    const depModule = this.getModuleByName(artifactId);
                    if (depModule) {
                        deps.push(depModule.id);
                    }
                }
            } else if (module.type === 'gradle') {
                const buildGradlePath = path.join(module.path, 'build.gradle');
                const buildGradleKtsPath = path.join(module.path, 'build.gradle.kts');
                
                let gradleContent = '';
                try {
                    gradleContent = await fs.readFile(buildGradlePath, 'utf-8');
                } catch {
                    try {
                        gradleContent = await fs.readFile(buildGradleKtsPath, 'utf-8');
                    } catch {
                        return deps;
                    }
                }

                // Look for project dependencies
                const projectPattern = /project\(['"]:([\w-]+)['"]\)/g;
                let match;
                while ((match = projectPattern.exec(gradleContent)) !== null) {
                    const projectName = match[1];
                    const depModule = this.getModuleByName(projectName);
                    if (depModule) {
                        deps.push(depModule.id);
                    }
                }
            } else if (module.type === 'npm' || module.type === 'yarn') {
                const packageJsonPath = path.join(module.path, 'package.json');
                const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
                
                // Check for workspace dependencies
                const allDeps = {
                    ...packageJson.dependencies,
                    ...packageJson.devDependencies
                };

                for (const depName of Object.keys(allDeps)) {
                    // Check if this is a local module (workspace dependency)
                    if (allDeps[depName].startsWith('workspace:') || allDeps[depName].startsWith('file:')) {
                        const depModule = this.getModuleByName(depName);
                        if (depModule) {
                            deps.push(depModule.id);
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`Error detecting dependencies for ${module.name}:`, err);
        }

        return deps;
    }

    /**
     * Associate feature with module
     */
    addFeatureToModule(featureId: string, filePath: string): void {
        const module = this.getModuleForFile(filePath);
        if (module && !module.features.includes(featureId)) {
            module.features.push(featureId);
        }
    }

    /**
     * Get all features in a module
     */
    getModuleFeatures(moduleName: string): string[] {
        const module = this.getModuleByName(moduleName);
        return module ? module.features : [];
    }
}
