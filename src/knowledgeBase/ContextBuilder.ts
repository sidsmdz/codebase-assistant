import { KnowledgeBaseManager } from './KnowledgeBaseManager';
import { Feature, FeatureComponent } from '../analysis/FeatureAnalyzer';

export class ContextBuilder {

    constructor(private kbManager?: KnowledgeBaseManager) {}

    /**
     * Build context for a query using feature-based analysis
     * Provides end-to-end feature context including all components and their relationships
     */
    async buildContextForQuery(userQuery: string): Promise<string> {

        try {
            if (!this.kbManager) {
                console.log('No KB manager available. Asking Copilot directly.');
                return userQuery;
            }

            // First, try to find relevant features
            console.log(`\n🔍 CONTEXT BUILDER: Searching for features matching: "${userQuery.substring(0, 50)}..."`);
            const features = await this.kbManager.searchFeatures(userQuery, 3);

            if (features.length > 0) {
                console.log(`✅ Found ${features.length} relevant features:`);
                features.forEach((f, i) => {
                    console.log(`   ${i + 1}. ${f.name} (${f.languages.join(', ')}) - ${f.components.length} components`);
                });
                const context = await this.buildFeatureContext(userQuery, features);
                console.log(`📝 Built context prompt: ${context.length} characters`);
                return context;
            }

            // Fallback to pattern search if no features found
            const patterns = await this.kbManager.searchPatterns(userQuery, 3);

            if (patterns.length > 0) {
                console.log(`Found ${patterns.length} patterns (no features matched).`);
                return this.buildPatternContext(userQuery, patterns);
            }

            console.log('No features or patterns found in KB. Asking Copilot directly.');
            return userQuery;

        } catch (error) {
            console.error('Failed to build context:', error);
            return userQuery;
        }
    }

    /**
     * Build context from features - provides end-to-end flow
     */
    private async buildFeatureContext(userQuery: string, features: Feature[]): Promise<string> {
        let prompt = `You are a helpful code assistant with access to the project's codebase knowledge base.

The following are complete end-to-end features from this codebase that are relevant to your request.
Each feature shows the full flow from entry point (controller/UI component) through services to data access.
Use these as reference for coding style, patterns, architecture, and conventions.

`;

        for (const feature of features) {
            prompt += `\n${'='.repeat(60)}\n`;
            prompt += `## FEATURE: ${feature.name}\n`;
            prompt += `${'='.repeat(60)}\n\n`;

            prompt += `**Description:** ${feature.description}\n`;
            prompt += `**Languages:** ${feature.languages.join(', ')}\n`;
            prompt += `**Frameworks:** ${feature.frameworks.join(', ') || 'None detected'}\n`;
            prompt += `**Tags:** ${feature.tags.slice(0, 8).join(', ')}\n\n`;

            // Show the flow diagram
            if (feature.flow.length > 0) {
                prompt += `### Data Flow:\n`;
                prompt += `\`\`\`\n`;
                for (const flow of feature.flow) {
                    prompt += `${flow.description || `${flow.from} -> ${flow.to}`}\n`;
                }
                prompt += `\`\`\`\n\n`;
            }

            // Get components for this feature
            const components = await this.kbManager!.getComponentsForFeature(feature.id);

            if (components.length > 0) {
                prompt += `### Components (${components.length}):\n\n`;

                // Sort by type: entry points first, then services, then repos
                const sortedComponents = this.sortComponentsByLayer(components, feature.entryPoints);

                for (const component of sortedComponents) {
                    const isEntryPoint = feature.entryPoints.includes(component.id);
                    const layerLabel = isEntryPoint ? ' [ENTRY POINT]' : '';

                    prompt += `#### ${component.type.toUpperCase()}: ${component.name}${layerLabel}\n`;
                    prompt += `- **File:** ${component.filePath.split('/').slice(-2).join('/')}:${component.startLine}\n`;
                    prompt += `- **Language:** ${component.language}\n`;

                    if (component.annotations.length > 0) {
                        const relevantAnnotations = component.annotations
                            .filter(a => !a.startsWith('@param') && !a.startsWith('@return'))
                            .slice(0, 5);
                        if (relevantAnnotations.length > 0) {
                            prompt += `- **Annotations:** ${relevantAnnotations.join(', ')}\n`;
                        }
                    }

                    if (component.dependencies.length > 0) {
                        const mainDeps = component.dependencies
                            .filter(d => d.endsWith('Service') || d.endsWith('Repository') || d.endsWith('Client'))
                            .slice(0, 5);
                        if (mainDeps.length > 0) {
                            prompt += `- **Dependencies:** ${mainDeps.join(', ')}\n`;
                        }
                    }

                    // Include the code
                    prompt += `\n\`\`\`${component.language}\n`;
                    // Limit code size to avoid huge prompts
                    const maxCodeLength = 2000;
                    if (component.code.length > maxCodeLength) {
                        prompt += component.code.substring(0, maxCodeLength) + '\n// ... (truncated)\n';
                    } else {
                        prompt += component.code;
                    }
                    prompt += `\n\`\`\`\n\n`;
                }
            }
        }

        prompt += `${'='.repeat(60)}\n`;
        prompt += `## USER REQUEST\n`;
        prompt += `${'='.repeat(60)}\n\n`;
        prompt += `${userQuery}\n\n`;
        prompt += `**Instructions:** Use the feature examples above as reference for:\n`;
        prompt += `- Coding style and conventions\n`;
        prompt += `- Architecture patterns (controller → service → repository)\n`;
        prompt += `- Framework-specific patterns (annotations, hooks, etc.)\n`;
        prompt += `- Error handling approaches\n`;
        prompt += `You can create new code following these patterns.\n`;

        return prompt;
    }

    /**
     * Sort components by architectural layer
     */
    private sortComponentsByLayer(components: FeatureComponent[], entryPointIds: string[]): FeatureComponent[] {
        const layerOrder: Record<string, number> = {
            'controller': 1,
            'component': 1,
            'hook': 1,
            'event-handler': 2,
            'middleware': 2,
            'service': 3,
            'api-client': 4,
            'repository': 5,
            'model': 6,
            'util': 7,
            'config': 8,
            'unknown': 9
        };

        return [...components].sort((a, b) => {
            // Entry points always first
            const aIsEntry = entryPointIds.includes(a.id) ? 0 : 1;
            const bIsEntry = entryPointIds.includes(b.id) ? 0 : 1;
            if (aIsEntry !== bIsEntry) {
                return aIsEntry - bIsEntry;
            }

            // Then by layer
            return (layerOrder[a.type] || 9) - (layerOrder[b.type] || 9);
        });
    }

    /**
     * Fallback: Build context from patterns (individual code snippets)
     */
    private buildPatternContext(userQuery: string, patterns: any[]): string {
        let prompt = `You are a helpful code assistant. `;
        prompt += `Use the following code examples from the project's knowledge base as reference for coding style, patterns, and conventions. You can create new code based on these patterns.\n\n`;
        prompt += `--- REFERENCE PATTERNS FROM KNOWLEDGE BASE ---\n\n`;

        for (const pattern of patterns) {
            prompt += `**${pattern.name}** (${pattern.description})\n`;
            prompt += `Tags: ${pattern.tags.join(', ')}\n`;
            prompt += `\`\`\`${pattern.language}\n${pattern.code}\n\`\`\`\n\n`;
        }

        prompt += `--- END OF REFERENCE PATTERNS ---\n\n`;
        prompt += `User Request: ${userQuery}`;

        return prompt;
    }
}
