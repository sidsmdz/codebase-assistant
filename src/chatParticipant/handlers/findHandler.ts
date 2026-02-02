import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { Feature, FeatureComponent } from '../../analysis/FeatureAnalyzer';

/**
 * /find command - Unified search for features AND components
 * 
 * NEW in V2: Searches both features and components simultaneously
 * 
 * Examples:
 *   @autoforge /find OrderService
 *   @autoforge /find authentication
 *   @autoforge /find payment controller
 */
export async function handleFind(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    token: vscode.CancellationToken
): Promise<void> {
    const query = request.prompt.trim();

    if (!query) {
        stream.markdown('## 🔍 Find in Knowledge Base\n\n');
        stream.markdown('Search for features and components in your codebase.\n\n');
        stream.markdown('**Usage:** `/find <search query>`\n\n');
        stream.markdown('**Examples:**\n');
        stream.markdown('- `/find OrderService` - Find OrderService component\n');
        stream.markdown('- `/find authentication` - Find auth-related features\n');
        stream.markdown('- `/find payment controller` - Find payment controllers\n');
        stream.markdown('- `/find UserRepository` - Find specific repository\n\n');
        stream.markdown('💡 **Tip:** Results include both features and individual components!\n');
        return;
    }

    stream.progress(`Searching for "${query}"...`);

    try {
        // Unified search - features + components
        const results = await kbManager.search(query, {
            featureLimit: 5,
            componentLimit: 10
        });

        const totalResults = results.features.length + results.components.length;

        if (totalResults === 0) {
            stream.markdown(`## No Results Found\n\n`);
            stream.markdown(`No features or components match "${query}".\n\n`);
            stream.markdown(`💡 Try running \`/scan\` first to index your codebase.\n`);
            return;
        }

        stream.markdown(`## 🔍 Found ${totalResults} results for "${query}"\n\n`);

        // Show features
        if (results.features.length > 0) {
            stream.markdown(`### ⚡ Features (${results.features.length})\n\n`);
            
            for (const feature of results.features) {
                await renderFeature(stream, feature, kbManager);
            }
        }

        // Show components
        if (results.components.length > 0) {
            stream.markdown(`### 🔧 Components (${results.components.length})\n\n`);
            
            for (const component of results.components) {
                await renderComponent(stream, component, kbManager);
            }
        }

        // Show usage hint
        stream.markdown(`\n---\n\n`);
        stream.markdown(`💡 **Tip:** To use this context in @workspace, mention the feature/component name in your query.\n\n`);
        stream.markdown(`For example: \`@workspace implement similar to ${results.components[0]?.name || results.features[0]?.name}\`\n`);

    } catch (error) {
        console.error('Find command error:', error);
        stream.markdown(`⚠️ Search failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
}

/**
 * Render a feature result
 */
async function renderFeature(
    stream: vscode.ChatResponseStream,
    feature: Feature,
    kbManager: KnowledgeBaseManager
): Promise<void> {
    const components = await kbManager.getComponentsForFeature(feature.id);
    const langs = feature.languages.join(', ');
    const frameworks = feature.frameworks.join(', ') || 'none';

    stream.markdown(`#### ${feature.name}\n`);
    stream.markdown(`${feature.description}\n\n`);
    stream.markdown(`- **Languages:** ${langs}\n`);
    stream.markdown(`- **Frameworks:** ${frameworks}\n`);
    stream.markdown(`- **Components:** ${components.length}\n`);
    
    if (feature.entryPoints.length > 0) {
        stream.markdown(`- **Entry Points:** ${feature.entryPoints.length}\n`);
    }
    
    if (feature.flow && feature.flow.length > 0) {
        stream.markdown(`- **Data Flows:** ${feature.flow.length} connections\n`);
    }

    // Show top components
    if (components.length > 0) {
        stream.markdown(`- **Key Components:**\n`);
        for (const comp of components.slice(0, 3)) {
            stream.markdown(`  - \`${comp.name}\` (${comp.type})\n`);
        }
        if (components.length > 3) {
            stream.markdown(`  - ...and ${components.length - 3} more\n`);
        }
    }

    stream.markdown(`\n`);
}

/**
 * Render a component result
 */
async function renderComponent(
    stream: vscode.ChatResponseStream,
    component: FeatureComponent,
    kbManager: KnowledgeBaseManager
): Promise<void> {
    const fileName = component.filePath.split('/').pop() || component.filePath;
    
    stream.markdown(`#### ${component.name} (${component.type})\n`);
    stream.markdown(`- **File:** [${fileName}](${component.filePath}#L${component.startLine})\n`);
    stream.markdown(`- **Language:** ${component.language}\n`);
    stream.markdown(`- **Lines:** ${component.startLine}-${component.endLine}\n`);

    // Show annotations (e.g., @RestController, @Service)
    if (component.annotations && component.annotations.length > 0) {
        const annotations = component.annotations.slice(0, 3).join(', ');
        stream.markdown(`- **Annotations:** ${annotations}\n`);
    }

    // Show dependencies
    if (component.dependencies && component.dependencies.length > 0) {
        stream.markdown(`- **Dependencies:** ${component.dependencies.length} components\n`);
    }

    // Show dependents (what depends on this)
    if (component.dependents && component.dependents.length > 0) {
        stream.markdown(`- **Dependents:** ${component.dependents.length} components\n`);
    }

    stream.markdown(`\n`);
}

/**
 * Helper to build context string from search results
 * Used for chat variable resolution
 */
export async function buildContextFromSearch(
    query: string,
    kbManager: KnowledgeBaseManager
): Promise<string> {
    const results = await kbManager.search(query, {
        featureLimit: 3,
        componentLimit: 5
    });

    let context = `## Architecture Context for "${query}"\n\n`;

    if (results.features.length > 0) {
        context += `### Features\n`;
        for (const feature of results.features) {
            const components = await kbManager.getComponentsForFeature(feature.id);
            context += `- **${feature.name}:** ${feature.description}\n`;
            context += `  - ${components.length} components (${feature.languages.join(', ')})\n`;
        }
        context += `\n`;
    }

    if (results.components.length > 0) {
        context += `### Components\n`;
        for (const comp of results.components) {
            context += `- **${comp.name}** (${comp.type}): ${comp.filePath}\n`;
        }
        context += `\n`;
    }

    return context;
}
