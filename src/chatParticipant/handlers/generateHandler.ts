import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { SessionManager } from '../../SessionManager';
import { ContextReferenceInfo } from '../types';
import { renderContextReferences } from '../utilities/helpers';

export async function handleGenerate(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    sessionManager: SessionManager,
    token: vscode.CancellationToken
): Promise<void> {
    const userIntent = request.prompt.trim();

    if (!userIntent) {
        stream.markdown('## ⚡ Generate Code with Copilot\n\n');
        stream.markdown('This command helps you generate code using GitHub Copilot with AutoForge\'s knowledge base context.\n\n');
        stream.markdown('**Usage:** `/generate <what you want to create>`\n\n');
        stream.markdown('**Examples:**\n');
        stream.markdown('- `/generate Add PostgreSQL database connection`\n');
        stream.markdown('- `/generate Create REST API endpoint for user management`\n');
        stream.markdown('- `/generate Implement authentication middleware`\n');
        stream.markdown('- `/generate Add Redis caching layer`\n\n');
        stream.markdown('💡 **Tip:** After using @autoforge to analyze your codebase, use this to generate code that follows your existing patterns!\n');
        return;
    }

    stream.progress('Gathering context from knowledge base...');

    const workspaceFolders = vscode.workspace.workspaceFolders;
    let kbContext = '';
    let featureCount = 0;
    let componentCount = 0;

    // 1. Query KB directly for features related to the user's intent
    try {
        const relevantFeatures = await kbManager.searchFeatures(userIntent, 5);
        if (relevantFeatures.length > 0) {
            kbContext += `\n\n## Architecture Context from AutoForge Knowledge Base\n`;
            for (const feature of relevantFeatures.slice(0, 3)) {
                kbContext += `\n### Feature: ${feature.name}\n`;
                kbContext += `${feature.description}\n`;
                kbContext += `- **Languages:** ${feature.languages.join(', ')}\n`;
                if (feature.frameworks.length > 0) {
                    kbContext += `- **Frameworks:** ${feature.frameworks.join(', ')}\n`;
                }
                kbContext += `- **Components:** ${feature.components.length}\n`;

                // Get component details for richer context
                const components = await kbManager.getComponentsForFeature(feature.id);
                componentCount += components.length;
                if (components.length > 0) {
                    kbContext += `- **Key components:** ${components.slice(0, 5).map(c => `${c.name} (${c.type})`).join(', ')}\n`;
                }

                // Include data flows
                if (feature.flow && feature.flow.length > 0) {
                    kbContext += `- **Data flows:** ${feature.flow.length} connections\n`;
                    for (const flow of feature.flow.slice(0, 5)) {
                        const fromComp = components.find(c => c.id === flow.from);
                        const toComp = components.find(c => c.id === flow.to);
                        if (fromComp && toComp) {
                            kbContext += `  - ${fromComp.name} → ${toComp.name} (${flow.type})\n`;
                        }
                    }
                }
            }
            featureCount = relevantFeatures.length;
        }
    } catch (err) {
        console.error('Failed to query KB:', err);
    }

    // 2. Get recent session context for conversational continuity
    if (workspaceFolders) {
        try {
            const session = await sessionManager.getCurrentSession(workspaceFolders[0].uri.fsPath);
            if (session && session.conversationHistory.length > 0) {
                const recentTurns = session.conversationHistory.slice(-6);

                const mentionedFeatures = new Set<string>();
                const contextSnippets: string[] = [];

                for (const turn of recentTurns) {
                    if (turn.contextUsed?.features) {
                        turn.contextUsed.features.forEach(f => mentionedFeatures.add(f));
                    }
                    if (turn.content.length < 300) {
                        contextSnippets.push(`${turn.role}: ${turn.content}`);
                    }
                }

                if (mentionedFeatures.size > 0) {
                    kbContext += `\n\n## Recently Discussed Features\n${Array.from(mentionedFeatures).join(', ')}\n`;
                }

                if (contextSnippets.length > 0) {
                    kbContext += `\n\n## Recent Discussion\n`;
                    contextSnippets.slice(-4).forEach(snippet => {
                        kbContext += `- ${snippet.substring(0, 200)}\n`;
                    });
                }
            }
        } catch (err) {
            console.error('Failed to get session context:', err);
        }
    }

    // Build final prompt for @workspace
    const finalPrompt = `${userIntent}${kbContext}\n\n**Please implement this following the architectural patterns and best practices identified above.**`;

    // Build feature details for context references
    const generateFeatureDetails: ContextReferenceInfo['features'] = [];
    try {
        const relevantFeatures = await kbManager.searchFeatures(userIntent, 5);
        for (const f of relevantFeatures.slice(0, 3)) {
            const components = await kbManager.getComponentsForFeature(f.id);
            generateFeatureDetails.push({
                name: f.name,
                componentCount: components.length,
                languages: f.languages,
                dataFlowCount: f.flow?.length || 0
            });
        }
    } catch { /* already handled above */ }

    // Show condensed handoff message (2-3 lines)
    stream.markdown(`🚀 **Forwarding to @workspace** with enriched KB context (${featureCount} features · ${componentCount} components · ${(kbContext.length / 1024).toFixed(1)} KB)\n\n`);
    stream.markdown(`💡 @workspace will receive your request with architectural patterns from the knowledge base.\n\n`);

    // Trigger workspace participant in same window
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `@workspace ${finalPrompt}`
        });

        // Post-handoff notification with return option
        vscode.window.showInformationMessage(
            'AutoForge: Context sent to @workspace. Return to AutoForge when ready.',
            'Back to AutoForge',
            'Save Pattern'
        ).then(async choice => {
            if (choice === 'Back to AutoForge') {
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: `@autoforge Continue from where we left off. I was working on: ${userIntent}`
                });
            } else if (choice === 'Save Pattern') {
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: `@autoforge /scan`
                });
            }
        });
    } catch (err) {
        stream.markdown(`\n\n⚠️ Failed to open Copilot: ${err instanceof Error ? err.message : String(err)}\n`);
        stream.markdown(`\nYou can manually type: \`@workspace ${userIntent}\``);
    }
}
