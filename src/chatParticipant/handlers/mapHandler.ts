import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { Feature, FeatureComponent } from '../../analysis/FeatureAnalyzer';

/**
 * /map command - Visualize feature architecture and component relationships
 * 
 * NEW in V2: Shows architecture flow diagrams
 * 
 * Examples:
 *   @autoforge /map authentication
 *   @autoforge /map OrderService
 */
export async function handleMap(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    token: vscode.CancellationToken
): Promise<void> {
    const query = request.prompt.trim();

    if (!query) {
        stream.markdown('## 🗺️ Architecture Map\n\n');
        stream.markdown('Visualize feature flows and component relationships.\n\n');
        stream.markdown('**Usage:** `/map <feature or component>`\n\n');
        stream.markdown('**Examples:**\n');
        stream.markdown('- `/map authentication` - Show auth feature flow\n');
        stream.markdown('- `/map OrderService` - Show OrderService relationships\n');
        stream.markdown('- `/map payment` - Show payment feature architecture\n\n');
        stream.markdown('💡 **Tip:** Use this to understand how components connect!\n');
        return;
    }

    stream.progress(`Mapping architecture for "${query}"...`);

    try {
        // Search for matching features/components
        const results = await kbManager.search(query, {
            featureLimit: 3,
            componentLimit: 5
        });

        if (results.features.length === 0 && results.components.length === 0) {
            stream.markdown(`## No Results Found\n\n`);
            stream.markdown(`No features or components match "${query}".\n`);
            return;
        }

        // Show feature maps
        if (results.features.length > 0) {
            for (const feature of results.features) {
                await renderFeatureMap(stream, feature, kbManager);
            }
        }

        // Show component maps
        if (results.components.length > 0 && results.features.length === 0) {
            stream.markdown(`## 🔧 Component Relationships\n\n`);
            for (const component of results.components.slice(0, 3)) {
                await renderComponentMap(stream, component, kbManager);
            }
        }

    } catch (error) {
        console.error('Map command error:', error);
        stream.markdown(`⚠️ Mapping failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
}

/**
 * Render feature architecture map
 */
async function renderFeatureMap(
    stream: vscode.ChatResponseStream,
    feature: Feature,
    kbManager: KnowledgeBaseManager
): Promise<void> {
    const components = await kbManager.getComponentsForFeature(feature.id);

    stream.markdown(`## 🗺️ ${feature.name}\n\n`);
    stream.markdown(`${feature.description}\n\n`);

    // Show data flow diagram
    if (feature.flow && feature.flow.length > 0) {
        stream.markdown(`### Data Flow\n\n`);
        stream.markdown('```\n');
        for (const flow of feature.flow.slice(0, 15)) {
            const description = flow.description || `${flow.from} → ${flow.to}`;
            stream.markdown(`${description}\n`);
        }
        if (feature.flow.length > 15) {
            stream.markdown(`... and ${feature.flow.length - 15} more flows\n`);
        }
        stream.markdown('```\n\n');
    }

    // Show component layers
    stream.markdown(`### Components (${components.length})\n\n`);
    
    // Group by type
    const byType = groupComponentsByType(components);
    
    for (const [type, comps] of Object.entries(byType)) {
        stream.markdown(`#### ${type}s\n`);
        for (const comp of comps) {
            const fileName = comp.filePath.split('/').pop();
            stream.markdown(`- **${comp.name}** - [${fileName}](${comp.filePath}#L${comp.startLine})\n`);
            
            // Show dependencies
            if (comp.dependencies && comp.dependencies.length > 0) {
                const deps = comp.dependencies.slice(0, 3).join(', ');
                stream.markdown(`  └─ Depends on: ${deps}\n`);
            }
        }
        stream.markdown(`\n`);
    }

    // Show entry points
    if (feature.entryPoints && feature.entryPoints.length > 0) {
        stream.markdown(`### Entry Points\n\n`);
        for (const ep of feature.entryPoints) {
            stream.markdown(`- \`${ep}\`\n`);
        }
        stream.markdown(`\n`);
    }
}

/**
 * Render component relationship map
 */
async function renderComponentMap(
    stream: vscode.ChatResponseStream,
    component: FeatureComponent,
    kbManager: KnowledgeBaseManager
): Promise<void> {
    stream.markdown(`### ${component.name} (${component.type})\n\n`);
    
    const fileName = component.filePath.split('/').pop();
    stream.markdown(`**File:** [${fileName}](${component.filePath}#L${component.startLine})\n\n`);

    // Show relationship diagram
    stream.markdown('```\n');
    
    // Dependents (who depends on this)
    if (component.dependents && component.dependents.length > 0) {
        stream.markdown('Dependents (use this component):\n');
        for (const dep of component.dependents.slice(0, 5)) {
            stream.markdown(`  ↓ ${dep}\n`);
        }
        if (component.dependents.length > 5) {
            stream.markdown(`  ... and ${component.dependents.length - 5} more\n`);
        }
        stream.markdown('\n');
    }

    stream.markdown(`→ ${component.name}\n\n`);

    // Dependencies (what this depends on)
    if (component.dependencies && component.dependencies.length > 0) {
        stream.markdown('Dependencies (this component uses):\n');
        for (const dep of component.dependencies.slice(0, 5)) {
            stream.markdown(`  ↓ ${dep}\n`);
        }
        if (component.dependencies.length > 5) {
            stream.markdown(`  ... and ${component.dependencies.length - 5} more\n`);
        }
    }

    stream.markdown('```\n\n');

    // Show imports
    if (component.imports && component.imports.length > 0) {
        stream.markdown(`**Imports:** ${component.imports.slice(0, 5).join(', ')}\n`);
        if (component.imports.length > 5) {
            stream.markdown(`... and ${component.imports.length - 5} more\n`);
        }
        stream.markdown(`\n`);
    }

    // Show annotations
    if (component.annotations && component.annotations.length > 0) {
        stream.markdown(`**Annotations:** ${component.annotations.join(', ')}\n\n`);
    }
}

/**
 * Group components by type for hierarchical display
 */
function groupComponentsByType(components: FeatureComponent[]): Record<string, FeatureComponent[]> {
    const groups: Record<string, FeatureComponent[]> = {};
    
    // Define preferred order
    const typeOrder = ['controller', 'service', 'repository', 'model', 'util', 'config'];
    
    for (const comp of components) {
        const type = comp.type.toLowerCase();
        if (!groups[type]) {
            groups[type] = [];
        }
        groups[type].push(comp);
    }

    // Sort groups by preferred order
    const sorted: Record<string, FeatureComponent[]> = {};
    for (const type of typeOrder) {
        if (groups[type]) {
            sorted[type] = groups[type];
        }
    }
    
    // Add remaining types
    for (const [type, comps] of Object.entries(groups)) {
        if (!sorted[type]) {
            sorted[type] = comps;
        }
    }

    return sorted;
}
