import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { SessionManager } from '../../SessionManager';
import { ContextReferenceInfo } from '../types';
import { renderContextReferences } from '../utilities/helpers';
import { TokenManager, ContextItem, estimateTokenCount, detectModelContextLimit } from '../utilities/tokenManager';

/**
 * Handler for /implement command
 * Hands off to @workspace agent with KB context for autonomous file editing
 */
export async function handleImplement(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    sessionManager: SessionManager,
    token: vscode.CancellationToken
): Promise<void> {
    const userIntent = request.prompt.trim();

    if (!userIntent) {
        stream.markdown('## 🤖 Implement with @workspace Agent\n\n');
        stream.markdown('This command hands off to @workspace with your KB context, enabling autonomous code generation and file editing.\n\n');
        stream.markdown('**Usage:** `/implement <what you want to create>`\n\n');
        stream.markdown('**Examples:**\n');
        stream.markdown('- `/implement Add PostgreSQL database connection`\n');
        stream.markdown('- `/implement Create REST API endpoint for user management`\n');
        stream.markdown('- `/implement Implement authentication middleware`\n');
        stream.markdown('- `/implement Add Redis caching layer`\n\n');
        stream.markdown('**Difference from /generate:**\n');
        stream.markdown('- `/generate` - Direct LLM response with code suggestions (no file edits)\n');
        stream.markdown('- `/implement` - @workspace agent mode (autonomous file creation/editing)\n\n');
        stream.markdown('💡 **Tip:** Use `/implement` when you want actual code changes, `/generate` for guidance!\n');
        return;
    }

    stream.progress('Gathering context from knowledge base...');

    const workspaceFolders = vscode.workspace.workspaceFolders;
    let featureCount = 0;
    let componentCount = 0;

    // Detect model and adapt token limits (silently)
    const modelInfo = await detectModelContextLimit();

    // Initialize token manager with detected limits
    const tokenManager = new TokenManager(modelInfo.contextLimit * 1.5, modelInfo.contextLimit * 0.3);
    const contextItems: ContextItem[] = [];

    // Determine enrichment mode based on available tokens
    const enrichmentMode = modelInfo.contextLimit >= 50000 ? 'detailed' : 
                          modelInfo.contextLimit >= 10000 ? 'normal' : 'summary';
    const maxComponentsPerFeature = modelInfo.contextLimit >= 50000 ? 10 : 
                                   modelInfo.contextLimit >= 10000 ? 5 : 3;

    // 1. Query KB directly for features related to the user's intent
    try {
        const relevantFeatures = await kbManager.searchFeatures(userIntent, 5);
        if (relevantFeatures.length > 0) {
            // Convert features to context items with priorities
            let featureItems = TokenManager.createFeatureItems(relevantFeatures, userIntent);
            
            // Enrich with component details using adaptive strategy
            featureItems = await TokenManager.enrichFeatureItems(
                featureItems,
                (featureId) => kbManager.getComponentsForFeature(featureId),
                enrichmentMode,
                maxComponentsPerFeature
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
    const optimized = tokenManager.optimizeContext(contextItems, userIntent, modelInfo.contextLimit);
    
    // Show warnings if context was truncated
    TokenManager.renderTokenWarning(stream, optimized, modelInfo);

    // Build final prompt for @workspace agent
    const finalPrompt = `${userIntent}\n\n## Architecture Context from AutoForge Knowledge Base\n\n${optimized.content}\n\n**Please implement this following the architectural patterns and best practices identified above.**`;

    // Build feature details for context references
    const implementFeatureDetails: ContextReferenceInfo['features'] = [];
    try {
        const relevantFeatures = await kbManager.searchFeatures(userIntent, 5);
        for (const f of relevantFeatures.slice(0, 3)) {
            const components = await kbManager.getComponentsForFeature(f.id);
            implementFeatureDetails.push({
                name: f.name,
                componentCount: components.length,
                languages: f.languages,
                dataFlowCount: f.flow?.length || 0
            });
        }
    } catch { /* already handled above */ }

    // Show what context was used
    const contextRefInfo: ContextReferenceInfo = {
        userQuery: userIntent,
        features: implementFeatureDetails,
        selectionAnalyses: [],
        filesIncluded: [],
        selectionsIncluded: [],
        totalContextSize: optimized.totalTokens
    };
    renderContextReferences(stream, contextRefInfo);

    // Hand off to @workspace agent with enriched context
    stream.markdown('\n---\n\n## 🚀 Handing off to @workspace Agent\n\n');
    stream.markdown('**Your request:** ' + userIntent + '\n\n');
    stream.markdown('✅ Added context from AutoForge knowledge base\n\n');
    stream.markdown('Opening @workspace with enriched context...\n\n');
    stream.markdown('*The @workspace agent will autonomously create/edit files based on the architecture patterns from your KB.*\n\n');
    
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `@workspace ${finalPrompt}`
        });
    } catch (err) {
        stream.markdown(`\n\n⚠️ Failed to open @workspace: ${err instanceof Error ? err.message : String(err)}\n`);
        stream.markdown(`\nYou can manually type: \`@workspace ${userIntent}\``);
    }
}
