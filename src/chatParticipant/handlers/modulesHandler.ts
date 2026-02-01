import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { HandlerResult } from '../types';

export async function handleModules(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    token: vscode.CancellationToken
): Promise<HandlerResult> {
    const query = request.prompt.trim();

    if (!query) {
        stream.markdown('## 📦 Multi-Module Project Support\n\n');
        stream.markdown('AutoForge automatically detects modules in multi-module projects and tracks cross-module dependencies.\n\n');
        stream.markdown('**Usage:**\n');
        stream.markdown('- `/modules` - List all detected modules\n');
        stream.markdown('- `/modules <name>` - Show features in a specific module\n');
        stream.markdown('- `/modules <moduleA> to <moduleB>` - Show how modules interact\n\n');
        stream.markdown('**Examples:**\n');
        stream.markdown('- `/modules permissions` - Show all features in permissions module\n');
        stream.markdown('- `/modules permissions to onboarding` - Show how permissions applies to onboarding\n');
        stream.markdown('- `how do I apply permissions to onboarding?` - Natural language query\n\n');
        stream.markdown('💡 **Tip:** After scanning, features are automatically associated with their modules!\n');
        return { hasCode: false };
    }

    // Check for "module A to module B" pattern
    const interactionPattern = /^(\w+)\s+to\s+(\w+)$/i;
    const interactionMatch = query.match(interactionPattern);

    if (interactionMatch) {
        const [, moduleA, moduleB] = interactionMatch;
        await showModuleInteraction(stream, kbManager, moduleA, moduleB);
        return { hasCode: false };
    }

    // Check if asking for specific module
    const modules = await kbManager.getAllModules();
    const requestedModule = modules.find(m => 
        m.name.toLowerCase() === query.toLowerCase()
    );

    if (requestedModule) {
        await showModuleDetails(stream, kbManager, requestedModule);
        return { hasCode: false };
    }

    // Default: show all modules
    await showAllModules(stream, modules);
    return { hasCode: false };
}

async function showAllModules(
    stream: vscode.ChatResponseStream,
    modules: any[]
): Promise<void> {
    if (modules.length === 0) {
        stream.markdown('⚠️ No modules detected. This might be a single-module project.\n\n');
        stream.markdown('Multi-module detection works for:\n');
        stream.markdown('- Maven/Gradle multi-module Java projects\n');
        stream.markdown('- Yarn/npm workspaces\n');
        stream.markdown('- Monorepos with multiple packages\n');
        return;
    }

    stream.markdown(`## 📦 Project Modules (${modules.length})\n\n`);

    for (const module of modules) {
        stream.markdown(`### ${module.name}\n`);
        stream.markdown(`- **Type:** ${module.type} (${module.language})\n`);
        stream.markdown(`- **Path:** \`${module.path}\`\n`);
        
        if (module.dependencies && module.dependencies.length > 0) {
            const depNames = modules
                .filter(m => module.dependencies.includes(m.id))
                .map(m => m.name);
            stream.markdown(`- **Dependencies:** ${depNames.join(', ')}\n`);
        }

        if (module.features && module.features.length > 0) {
            stream.markdown(`- **Features:** ${module.features.length}\n`);
        }

        stream.markdown(`\n`);
    }

    stream.markdown(`\n💡 **Try:** \`/modules <module-name>\` to see features in a specific module\n`);
}

async function showModuleDetails(
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    module: any
): Promise<void> {
    stream.markdown(`## 📦 Module: ${module.name}\n\n`);
    stream.markdown(`**Type:** ${module.type} (${module.language})\n`);
    stream.markdown(`**Path:** \`${module.path}\`\n\n`);

    // Get features in this module
    const features = await kbManager.getFeaturesByModule(module.name);

    if (features.length === 0) {
        stream.markdown('⚠️ No features detected in this module yet. Try running `/scan` first.\n');
        return;
    }

    stream.markdown(`### Features (${features.length})\n\n`);
    
    for (const feature of features) {
        stream.markdown(`#### ${feature.name}\n`);
        stream.markdown(`${feature.description}\n`);
        stream.markdown(`- **Components:** ${feature.components.length}\n`);
        stream.markdown(`- **Languages:** ${feature.languages.join(', ')}\n`);
        
        if (feature.frameworks && feature.frameworks.length > 0) {
            stream.markdown(`- **Frameworks:** ${feature.frameworks.join(', ')}\n`);
        }

        // Show cross-module dependencies
        if (feature.crossModuleDeps && feature.crossModuleDeps.length > 0) {
            const crossModuleDeps = await kbManager.getCrossModuleDependencies(feature.id);
            if (crossModuleDeps.length > 0) {
                stream.markdown(`- **Uses modules:** ${crossModuleDeps.map(d => d.toModule).join(', ')}\n`);
            }
        }

        stream.markdown(`\n`);
    }

    stream.markdown(`\n💡 **Try:** \`/modules ${module.name} to <other-module>\` to see interactions\n`);
}

async function showModuleInteraction(
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    moduleAName: string,
    moduleBName: string
): Promise<void> {
    stream.markdown(`## 🔄 Module Interaction: ${moduleAName} → ${moduleBName}\n\n`);

    const featuresA = await kbManager.getFeaturesByModule(moduleAName);
    const featuresB = await kbManager.getFeaturesByModule(moduleBName);

    if (featuresA.length === 0) {
        stream.markdown(`⚠️ No features found in module "${moduleAName}"\n`);
        return;
    }

    if (featuresB.length === 0) {
        stream.markdown(`⚠️ No features found in module "${moduleBName}"\n`);
        return;
    }

    // Find features in A that depend on B
    const interactions: Array<{
        fromFeature: string;
        toFeatures: string[];
    }> = [];

    for (const featureA of featuresA) {
        if (featureA.crossModuleDeps && featureA.crossModuleDeps.length > 0) {
            const relatedInB: string[] = [];
            
            for (const depFeatureId of featureA.crossModuleDeps) {
                const depFeature = featuresB.find(f => f.id === depFeatureId);
                if (depFeature) {
                    relatedInB.push(depFeature.name);
                }
            }

            if (relatedInB.length > 0) {
                interactions.push({
                    fromFeature: featureA.name,
                    toFeatures: relatedInB
                });
            }
        }
    }

    if (interactions.length === 0) {
        stream.markdown(`ℹ️ No direct dependencies detected from ${moduleAName} to ${moduleBName}\n\n`);
        stream.markdown(`This could mean:\n`);
        stream.markdown(`- Modules are independent\n`);
        stream.markdown(`- Dependencies haven't been analyzed yet (try re-scanning)\n`);
        stream.markdown(`- Modules communicate through external APIs/events\n\n`);
    } else {
        stream.markdown(`### How ${moduleAName} uses ${moduleBName}\n\n`);
        
        for (const interaction of interactions) {
            stream.markdown(`**${interaction.fromFeature}** depends on:\n`);
            for (const toFeature of interaction.toFeatures) {
                stream.markdown(`- ${toFeature}\n`);
            }
            stream.markdown(`\n`);
        }
    }

    // Show available features in each module
    stream.markdown(`### ${moduleAName} Features (${featuresA.length})\n`);
    featuresA.forEach(f => stream.markdown(`- ${f.name}\n`));
    stream.markdown(`\n`);

    stream.markdown(`### ${moduleBName} Features (${featuresB.length})\n`);
    featuresB.forEach(f => stream.markdown(`- ${f.name}\n`));
    stream.markdown(`\n`);

    stream.markdown(`\n💡 **Suggestion:** To apply ${moduleBName} patterns to ${moduleAName}, consider:\n`);
    stream.markdown(`1. Review the features listed above\n`);
    stream.markdown(`2. Use \`/explain\` to understand specific features\n`);
    stream.markdown(`3. Use \`/generate\` to create similar patterns\n`);
}
