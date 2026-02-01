import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { SelectionAnalyzer } from '../../analysis/SelectionAnalyzer';
import { HandlerResult } from '../types';
import { getCodeSelection } from '../utilities/helpers';

async function analyzeImpact(filePath: string, stream: vscode.ChatResponseStream, kbManager: KnowledgeBaseManager): Promise<void> {
    stream.markdown(`## 💥 Impact Analysis for File\n\n`);
    stream.markdown(`**File:** ${filePath}\n\n`);

    // Find all components in this file
    const features = await kbManager.searchFeatures(filePath.split('/').pop() || '', 10);
    
    const affectedComponents = new Set<string>();
    const affectedFeatures = new Set<string>();
    
    for (const feature of features) {
        const components = await kbManager.getComponentsForFeature(feature.id);
        const fileComponents = components.filter(c => c.filePath === filePath);
        
        if (fileComponents.length > 0) {
            affectedFeatures.add(feature.name);
            
            for (const comp of fileComponents) {
                if (comp.dependents) {
                    for (const depId of comp.dependents) {
                        const depComp = components.find(c => c.id === depId);
                        if (depComp) {
                            affectedComponents.add(`${depComp.name} (${depComp.type})`);
                        }
                    }
                }
            }
        }
    }

    if (affectedFeatures.size > 0) {
        stream.markdown(`### Affected Features (${affectedFeatures.size}):\n`);
        for (const featureName of affectedFeatures) {
            stream.markdown(`- ${featureName}\n`);
        }
        stream.markdown(`\n`);
    }

    if (affectedComponents.size > 0) {
        stream.markdown(`### ⚠️ Components that depend on this file (${affectedComponents.size}):\n`);
        for (const compName of Array.from(affectedComponents).slice(0, 20)) {
            stream.markdown(`- ${compName}\n`);
        }
        if (affectedComponents.size > 20) {
            stream.markdown(`- ... and ${affectedComponents.size - 20} more\n`);
        }
        stream.markdown(`\n`);
    } else {
        stream.markdown(`✅ **No direct dependents found** - changes to this file should be isolated\n\n`);
    }
}

export async function handleImpact(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    selectionAnalyzer: SelectionAnalyzer,
    token: vscode.CancellationToken
): Promise<HandlerResult> {
    const query = request.prompt.trim();

    // Try to get code selection from chat references or active editor
    const selection = await getCodeSelection(request.references);
    
    if (selection) {
        stream.progress('Analyzing impact...');
        
        try {
            const analysis = await selectionAnalyzer.analyzeSelection(selection.document, selection.range);
            
            stream.markdown(`## 💥 Impact Analysis\n\n`);
            stream.markdown(`**File:** ${analysis.uri.fsPath}\n`);
            stream.markdown(`**Lines:** ${analysis.range.start.line + 1}-${analysis.range.end.line + 1}\n\n`);
            
            // Analyze what depends on this code
            const impactedComponents = new Set<string>();
            const impactedFeatures = new Set<string>();
            
            // Look at related components
            for (const comp of analysis.relatedComponents) {
                const features = await kbManager.searchFeatures(comp.name, 5);
                for (const feature of features) {
                    impactedFeatures.add(feature.name);
                    const components = await kbManager.getComponentsForFeature(feature.id);
                    
                    // Find components that might depend on the selected code
                    for (const c of components) {
                        // Check if component imports or depends on things in our selection
                        if (c.dependencies && c.dependencies.length > 0) {
                            impactedComponents.add(`${c.name} (${c.type})`);
                        }
                    }
                }
            }
            
            // Show impact summary
            if (analysis.relatedFeatures.length > 0) {
                stream.markdown(`### ⚠️ Potentially Affected Features (${analysis.relatedFeatures.length})\n\n`);
                for (const feature of analysis.relatedFeatures.slice(0, 10)) {
                    stream.markdown(`- **${feature.name}** (${(feature.confidence * 100).toFixed(0)}% confidence)\n`);
                }
                if (analysis.relatedFeatures.length > 10) {
                    stream.markdown(`\n_...and ${analysis.relatedFeatures.length - 10} more_\n`);
                }
                stream.markdown(`\n`);
            } else {
                stream.markdown(`### ✅ Low Impact\n\n`);
                stream.markdown(`This code doesn't appear to be part of any major features in the knowledge base.\n\n`);
            }
            
            // Show what calls the methods in this selection
            if (analysis.methodCalls.length > 0) {
                stream.markdown(`### 📞 Methods That Might Be Affected\n\n`);
                stream.markdown(`Changing this code may impact callers of:\n\n`);
                for (const call of analysis.methodCalls.slice(0, 15)) {
                    stream.markdown(`- \`${call}()\`\n`);
                }
                if (analysis.methodCalls.length > 15) {
                    stream.markdown(`\n_...and ${analysis.methodCalls.length - 15} more_\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Show related components
            if (analysis.relatedComponents.length > 0) {
                stream.markdown(`### 🧩 Components to Review (${analysis.relatedComponents.length})\n\n`);
                for (const comp of analysis.relatedComponents.slice(0, 10)) {
                    const uri = vscode.Uri.file(comp.filePath);
                    stream.markdown(`- [${comp.name}](${uri.toString()}) (${comp.type})\n`);
                    stream.reference(uri);
                }
                if (analysis.relatedComponents.length > 10) {
                    stream.markdown(`\n_...and ${analysis.relatedComponents.length - 10} more_\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Show imports (breaking changes risk)
            if (analysis.imports.length > 0) {
                stream.markdown(`### ⚠️ Breaking Changes Risk\n\n`);
                stream.markdown(`If you modify exported interfaces/types, these imports may break:\n\n`);
                for (const imp of analysis.imports.slice(0, 10)) {
                    stream.markdown(`- \`${imp}\`\n`);
                }
                if (analysis.imports.length > 10) {
                    stream.markdown(`\n_...and ${analysis.imports.length - 10} more_\n`);
                }
                stream.markdown(`\n`);
            }
            
            return { hasCode: true };
            
        } catch (err) {
            console.error('Selection impact error:', err);
            // Fall through to query-based impact
        }
    }

    // Fallback to file/component-based impact
    if (!query) {
        stream.markdown('💡 **Tip:** Select code or use `#file` / `#selection` in chat, then use `/impact` to analyze impact. Or provide a file/component name.\n\n');
        stream.markdown('Example: `@autoforge /impact MessageHandler.ts`');
        return { hasCode: false };
    }

    stream.progress(`Analyzing impact of changes to "${query}"...`);

    // Check if it's a file path or component name
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        const rootPath = workspaceFolders[0].uri.fsPath;
        const possiblePath = query.includes('/') ? query : `${rootPath}/${query}`;
        
        try {
            const uri = vscode.Uri.file(possiblePath);
            await vscode.workspace.fs.stat(uri);
            // File exists, analyze it
            await analyzeImpact(possiblePath, stream, kbManager);
            return { hasCode: false };
        } catch {
            // Not a valid file, treat as component name
        }
    }

    // Search for component
    try {
        const features = await kbManager.searchFeatures(query, 5);

        if (features.length === 0) {
            stream.markdown(`No components found matching "${query}". Try running \`/scan\` first.`);
            return { hasCode: false };
        }

        stream.markdown(`## 💥 Impact Analysis for "${query}"\n\n`);

        for (const feature of features.slice(0, 3)) {
            const components = await kbManager.getComponentsForFeature(feature.id);
            const targetComponent = components.find(c => 
                c.name.toLowerCase().includes(query.toLowerCase())
            );

            if (targetComponent) {
                stream.markdown(`### Component: ${targetComponent.name}\n`);
                stream.markdown(`**Type:** ${targetComponent.type}\n`);
                stream.markdown(`**Feature:** ${feature.name}\n\n`);

                // Count dependents
                const dependentCount = targetComponent.dependents?.length || 0;
                if (dependentCount > 0) {
                    stream.markdown(`⚠️ **${dependentCount} component(s) depend on this**\n\n`);
                    
                    if (targetComponent.dependents) {
                        stream.markdown(`#### Components that will be affected:\n`);
                        for (const depId of targetComponent.dependents.slice(0, 10)) {
                            const depComp = components.find(c => c.id === depId);
                            if (depComp) {
                                const uri = vscode.Uri.file(depComp.filePath);
                                stream.markdown(`- [${depComp.name}](${uri.toString()}) (${depComp.type})\n`);
                                stream.reference(uri);
                            }
                        }
                        if (targetComponent.dependents.length > 10) {
                            stream.markdown(`- ... and ${targetComponent.dependents.length - 10} more\n`);
                        }
                        stream.markdown(`\n`);
                    }
                } else {
                    stream.markdown(`✅ **No direct dependents** - changes should be safe\n\n`);
                }

                // Show related features
                stream.markdown(`#### Related Features (${features.length}):\n`);
                for (const f of features.slice(0, 5)) {
                    stream.markdown(`- ${f.name}\n`);
                }
                stream.markdown(`\n`);
            }
        }

        return { hasCode: true };

    } catch (err) {
        stream.markdown(`⚠️ Impact analysis failed: ${err instanceof Error ? err.message : String(err)}`);
        return { hasCode: false };
    }
}
