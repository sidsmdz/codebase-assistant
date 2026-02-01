import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { SelectionAnalyzer } from '../../analysis/SelectionAnalyzer';
import { HandlerResult } from '../types';
import { getCodeSelection } from '../utilities/helpers';

export async function handleTrace(
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
        stream.progress('Tracing dependencies...');
        
        try {
            const analysis = await selectionAnalyzer.analyzeSelection(selection.document, selection.range);
            const fileName = selection.document.uri.fsPath.split('/').pop();
            
            stream.markdown(`## 🔍 Dependency Trace\n\n`);
            stream.markdown(`**File:** ${analysis.uri.fsPath}\n`);
            stream.markdown(`**Lines:** ${analysis.range.start.line + 1}-${analysis.range.end.line + 1}\n\n`);
            
            // Show imports/dependencies
            if (analysis.imports.length > 0) {
                stream.markdown(`### 📦 Direct Dependencies (${analysis.imports.length})\n\n`);
                for (const imp of analysis.imports.slice(0, 20)) {
                    stream.markdown(`- \`${imp}\`\n`);
                }
                if (analysis.imports.length > 20) {
                    stream.markdown(`\n_...and ${analysis.imports.length - 20} more_\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Show method calls (what this code calls)
            if (analysis.methodCalls.length > 0) {
                stream.markdown(`### 📞 Method Calls (${analysis.methodCalls.length})\n\n`);
                stream.markdown(`**What this code calls:**\n\n`);
                for (const call of analysis.methodCalls.slice(0, 25)) {
                    stream.markdown(`- \`${call}()\`\n`);
                }
                if (analysis.methodCalls.length > 25) {
                    stream.markdown(`\n_...and ${analysis.methodCalls.length - 25} more_\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Show related components (what might call this)
            if (analysis.relatedComponents.length > 0) {
                stream.markdown(`### 🔗 Related Components (${analysis.relatedComponents.length})\n\n`);
                for (const comp of analysis.relatedComponents.slice(0, 15)) {
                    const uri = vscode.Uri.file(comp.filePath);
                    stream.markdown(`- [${comp.name}](${uri.toString()}) (${comp.type})\n`);
                    stream.reference(uri);
                }
                if (analysis.relatedComponents.length > 15) {
                    stream.markdown(`\n_...and ${analysis.relatedComponents.length - 15} more_\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Show related features
            if (analysis.relatedFeatures.length > 0) {
                stream.markdown(`### 🎯 Related Features (${analysis.relatedFeatures.length})\n\n`);
                for (const feature of analysis.relatedFeatures.slice(0, 5)) {
                    stream.markdown(`- **${feature.name}** (${(feature.confidence * 100).toFixed(0)}% confidence)\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Show related files
            if (analysis.relatedFiles.length > 0) {
                stream.markdown(`### 📁 Related Files (${analysis.relatedFiles.length})\n\n`);
                for (const file of analysis.relatedFiles.slice(0, 10)) {
                    const uri = vscode.Uri.file(file);
                    const fileName = file.split('/').pop();
                    stream.markdown(`- [${fileName}](${uri.toString()})\n`);
                    stream.reference(uri);
                }
                if (analysis.relatedFiles.length > 10) {
                    stream.markdown(`\n_...and ${analysis.relatedFiles.length - 10} more_\n`);
                }
                stream.markdown(`\n`);
            }
            
            return { hasCode: true };

        } catch (err) {
            console.error('Selection trace error:', err);
            // Fall through to query-based trace
        }
    }

    // Fallback to query-based trace
    if (!query) {
        stream.markdown('💡 **Tip:** Select code or use `#file` / `#selection` in chat, then use `/trace` to trace dependencies. Or provide a component name.\n\n');
        stream.markdown('Example: `@autoforge /trace MessageHandler.processMessage`');
        return { hasCode: false };
    }

    stream.progress(`Tracing dependencies for "${query}"...`);

    try {
        // Search for features containing this component/method
        const features = await kbManager.searchFeatures(query, 5);

        if (features.length === 0) {
            stream.markdown(`No components found matching "${query}". Try running \`/scan\` first or use \`/analyze\` on selected code.`);
            return { hasCode: false };
        }

        stream.markdown(`## 🔍 Trace Results for "${query}"\n\n`);

        for (const feature of features.slice(0, 3)) {
            stream.markdown(`### Feature: ${feature.name}\n`);
            stream.markdown(`${feature.description}\n\n`);

            // Get components for this feature
            const components = await kbManager.getComponentsForFeature(feature.id);
            
            // Find the specific component being traced
            const targetComponent = components.find(c => 
                c.name.toLowerCase().includes(query.toLowerCase())
            );

            if (targetComponent) {
                stream.markdown(`#### Component: ${targetComponent.name} (${targetComponent.type})\n`);
                const uri = vscode.Uri.file(targetComponent.filePath);
                stream.markdown(`📄 [${targetComponent.filePath}](${uri.toString()}) (Lines ${targetComponent.startLine}-${targetComponent.endLine})\n\n`);
                stream.reference(uri.with({ fragment: `L${targetComponent.startLine}-L${targetComponent.endLine}` }));

                // Show dependencies
                if (targetComponent.dependencies && targetComponent.dependencies.length > 0) {
                    stream.markdown(`**Dependencies (${targetComponent.dependencies.length}):**\n`);
                    for (const depId of targetComponent.dependencies.slice(0, 10)) {
                        const depComp = components.find(c => c.id === depId);
                        if (depComp) {
                            stream.markdown(`- ${depComp.name} (${depComp.type})\n`);
                        }
                    }
                    stream.markdown(`\n`);
                }

                // Show dependents
                if (targetComponent.dependents && targetComponent.dependents.length > 0) {
                    stream.markdown(`**Dependents (${targetComponent.dependents.length}):**\n`);
                    for (const depId of targetComponent.dependents.slice(0, 10)) {
                        const depComp = components.find(c => c.id === depId);
                        if (depComp) {
                            stream.markdown(`- ${depComp.name} (${depComp.type})\n`);
                        }
                    }
                    stream.markdown(`\n`);
                }

                // Show imports
                if (targetComponent.imports && targetComponent.imports.length > 0) {
                    stream.markdown(`**Imports (${targetComponent.imports.length}):**\n`);
                    for (const imp of targetComponent.imports.slice(0, 15)) {
                        stream.markdown(`- \`${imp}\`\n`);
                    }
                    stream.markdown(`\n`);
                }
            }

            // Show data flow
            if (feature.flow && feature.flow.length > 0) {
                stream.markdown(`#### Data Flow\n`);
                for (const flow of feature.flow.slice(0, 10)) {
                    const fromComp = components.find(c => c.id === flow.from);
                    const toComp = components.find(c => c.id === flow.to);
                    if (fromComp && toComp) {
                        stream.markdown(`- ${fromComp.name} **${flow.type}** → ${toComp.name}\n`);
                    }
                }
                stream.markdown(`\n`);
            }
        }

        return { hasCode: true };

    } catch (err) {
        stream.markdown(`⚠️ Trace failed: ${err instanceof Error ? err.message : String(err)}`);
        return { hasCode: false };
    }
}
