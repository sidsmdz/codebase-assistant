import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { SessionManager } from '../../SessionManager';
import { ContextReferenceInfo } from '../types';
import { renderContextReferences } from '../utilities/helpers';
import { TokenManager, ContextItem, estimateTokenCount } from '../utilities/tokenManager';

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
    let featureCount = 0;
    let componentCount = 0;

    // Initialize token manager (GPT-4o has 128K context)
    const tokenManager = new TokenManager(128000, 4000);
    const contextItems: ContextItem[] = [];

    // 1. Query KB directly for features related to the user's intent
    try {
        const relevantFeatures = await kbManager.searchFeatures(userIntent, 5);
        if (relevantFeatures.length > 0) {
            // Convert features to context items with priorities
            let featureItems = TokenManager.createFeatureItems(relevantFeatures, userIntent);
            
            // Enrich with component details
            featureItems = await TokenManager.enrichFeatureItems(
                featureItems,
                (featureId) => kbManager.getComponentsForFeature(featureId)
            );
            
            contextItems.push(...featureItems);
            
            featureCount = relevantFeatures.length;
            
            // Count components
            for (const feature of relevantFeatures) {
                const components = await kbManager.getComponentsForFeature(feature.id);
                componentCount += components.length;
            }
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

                // Add session context as lower priority item
                if (mentionedFeatures.size > 0 || contextSnippets.length > 0) {
                    let sessionContext = '';
                    if (mentionedFeatures.size > 0) {
                        sessionContext += `## Recently Discussed Features\n${Array.from(mentionedFeatures).join(', ')}\n\n`;
                    }
                    if (contextSnippets.length > 0) {
                        sessionContext += `## Recent Discussion\n`;
                        contextSnippets.slice(-4).forEach(snippet => {
                            sessionContext += `- ${snippet.substring(0, 200)}\n`;
                        });
                    }
                    
                    contextItems.push({
                        content: sessionContext,
                        type: 'pattern',
                        name: 'Session Context',
                        priority: 5, // Medium priority
                        estimatedTokens: estimateTokenCount(sessionContext)
                    } as ContextItem);
                }
            }
        } catch (err) {
            console.error('Failed to get session context:', err);
        }
    }

    // Optimize context to fit within token limits
    stream.progress('Optimizing context for token limits...');
    const optimized = tokenManager.optimizeContext(contextItems, userIntent, 100000);
    
    // Show warnings if context was truncated
    TokenManager.renderTokenWarning(stream, optimized);

    // Build final prompt for @workspace
    const finalPrompt = `${userIntent}\n\n${optimized.content}\n\n**Please implement this following the architectural patterns and best practices identified above.**`;

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

    // Silently hand off to @workspace with enriched context
    // No verbose messaging - transparent handoff
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `@workspace ${finalPrompt}`
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
        stream.markdown(`\n\n⚠️ Failed to open Copilot: ${err instanceof Error ? err.message : String(err)}\n`);
        stream.markdown(`\nYou can manually type: \`@workspace ${userIntent}\``);
    }
}
