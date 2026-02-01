import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { SelectionAnalyzer } from '../../analysis/SelectionAnalyzer';
import { ContextReferenceInfo } from '../types';
import { getCodeSelection, renderContextReferences } from '../utilities/helpers';

export async function handleAsk(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    selectionAnalyzer: SelectionAnalyzer,
    token: vscode.CancellationToken
): Promise<void> {
    const userRequest = request.prompt.trim();

    if (!userRequest) {
        stream.markdown('## 💬 Natural Language Actions\n\n');
        stream.markdown('Just tell me what you want to do - no `/ask` needed!\n\n');
        stream.markdown('**Examples:**\n');
        stream.markdown('- `@autoforge generate unit tests for this code`\n');
        stream.markdown('- `@autoforge refactor to use dependency injection`\n');
        stream.markdown('- `@autoforge add comprehensive error handling`\n');
        stream.markdown('- `@autoforge optimize for performance`\n');
        stream.markdown('- `@autoforge add JSDoc documentation`\n\n');
        stream.markdown('💡 **Tip:** Select code or add `#file` to provide context!\n');
        return;
    }

    stream.progress(`Understanding your request...`);

    // Get code selection from chat references or active editor (optional now)
    const selection = await getCodeSelection(request.references);

    stream.progress(`Gathering context...`);

    let contextPrompt = `## User Request\n${userRequest}\n\n`;
    let featureCount = 0;
    let componentCount = 0;

    // If we have a code selection, analyze it
    if (selection) {
        stream.progress(`Analyzing code dependencies...`);

        try {
            const analysis = await selectionAnalyzer.analyzeSelection(selection.document, selection.range);

            contextPrompt += `## Code Context\n`;
            contextPrompt += `**File:** ${analysis.uri.fsPath}\n`;
            contextPrompt += `**Lines:** ${analysis.range.start.line + 1}-${analysis.range.end.line + 1}\n\n`;
            contextPrompt += `\`\`\`${selection.document.languageId}\n`;
            contextPrompt += selection.document.getText(selection.range);
            contextPrompt += `\n\`\`\`\n\n`;

            if (analysis.relatedFeatures.length > 0) {
                contextPrompt += `## Related Features (from Knowledge Base)\n`;
                for (const feature of analysis.relatedFeatures.slice(0, 5)) {
                    contextPrompt += `- **${feature.name}** (${(feature.confidence * 100).toFixed(0)}% confidence)\n`;
                }
                contextPrompt += `\n`;
                featureCount = analysis.relatedFeatures.length;
            }

            if (analysis.imports.length > 0) {
                contextPrompt += `## Imports\n`;
                for (const imp of analysis.imports.slice(0, 10)) {
                    contextPrompt += `- \`${imp}\`\n`;
                }
                contextPrompt += `\n`;
            }

            if (analysis.methodCalls.length > 0) {
                contextPrompt += `## Methods Called\n`;
                for (const call of analysis.methodCalls.slice(0, 10)) {
                    contextPrompt += `- \`${call}()\`\n`;
                }
                contextPrompt += `\n`;
            }

            if (analysis.relatedComponents.length > 0) {
                contextPrompt += `## Related Components\n`;
                for (const comp of analysis.relatedComponents.slice(0, 5)) {
                    contextPrompt += `- ${comp.name} (${comp.type})\n`;
                }
                contextPrompt += `\n`;
                componentCount = analysis.relatedComponents.length;
            }
        } catch (err) {
            console.error('Selection analysis failed, falling back to KB context:', err);
        }
    }

    // Always search KB for context related to the user's request (even without selection)
    if (featureCount === 0) {
        stream.progress(`Searching knowledge base for "${userRequest}"...`);
        try {
            const features = await kbManager.searchFeatures(userRequest, 5);
            if (features.length > 0) {
                contextPrompt += `## Knowledge Base Context\n`;
                for (const feature of features.slice(0, 3)) {
                    contextPrompt += `\n### Feature: ${feature.name}\n`;
                    contextPrompt += `${feature.description}\n`;
                    contextPrompt += `- **Languages:** ${feature.languages.join(', ')}\n`;
                    if (feature.frameworks.length > 0) {
                        contextPrompt += `- **Frameworks:** ${feature.frameworks.join(', ')}\n`;
                    }
                    const components = await kbManager.getComponentsForFeature(feature.id);
                    if (components.length > 0) {
                        contextPrompt += `- **Components:** ${components.slice(0, 5).map(c => `${c.name} (${c.type})`).join(', ')}\n`;
                        componentCount += components.length;
                    }
                }
                contextPrompt += `\n`;
                featureCount = features.length;
            }
        } catch (err) {
            console.error('KB search failed:', err);
        }
    }

    // Build feature details for context references display
    const askFeatureDetails: ContextReferenceInfo['features'] = [];
    try {
        const allFeatures = await kbManager.searchFeatures(userRequest, 5);
        for (const f of allFeatures.slice(0, 3)) {
            const comps = await kbManager.getComponentsForFeature(f.id);
            askFeatureDetails.push({
                name: f.name,
                componentCount: comps.length,
                languages: f.languages,
                dataFlowCount: f.flow?.length || 0
            });
        }
    } catch { /* already handled above */ }

    // Silently hand off to @workspace with enriched context
    // No verbose messaging - transparent handoff
    
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `@workspace ${contextPrompt}`
        });

        // Quiet notification - user can return to AutoForge if needed
        vscode.window.showInformationMessage(
            'KB context added to @workspace',
            'Continue with AutoForge'
        ).then(async choice => {
            if (choice === 'Continue with AutoForge') {
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: `@autoforge Continue from where we left off`
                });
            }
        });
    } catch (err) {
        stream.markdown(`⚠️ Failed to open Copilot: ${err instanceof Error ? err.message : String(err)}\n\n`);
        stream.markdown(`You can manually type: \`@workspace ${userRequest}\``);
    }
}
