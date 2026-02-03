import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { SessionManager } from '../../SessionManager';
import { ContextReferenceInfo } from '../types';
import { renderContextReferences, selectModel } from '../utilities/helpers';
import { TokenManager, ContextItem, estimateTokenCount, detectModelContextLimit } from '../utilities/tokenManager';

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

    // Build final prompt with KB context
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

    // Show what context was used
    const contextRefInfo: ContextReferenceInfo = {
        userQuery: userIntent,
        features: generateFeatureDetails,
        selectionAnalyses: [],
        filesIncluded: [],
        selectionsIncluded: [],
        totalContextSize: optimized.totalTokens
    };
    renderContextReferences(stream, contextRefInfo);

    // Call LLM directly with KB context (no @workspace handoff)
    stream.progress('Generating implementation...');
    
    try {
        const model = await selectModel(token);
        if (!model) {
            stream.markdown('\n⚠️ No Copilot language model available. Please ensure GitHub Copilot is enabled.\n');
            return;
        }

        const messages = [vscode.LanguageModelChatMessage.User(finalPrompt)];
        const response = await model.sendRequest(messages, {}, token);
        
        stream.markdown('\n---\n\n');
        for await (const fragment of response.text) {
            stream.markdown(fragment);
        }
        
    } catch (err) {
        if (err instanceof vscode.LanguageModelError) {
            stream.markdown(`\n\n⚠️ **Error:** ${err.message}\n`);
            if (err.message.includes('token')) {
                stream.markdown('\n💡 Try simplifying your request or targeting specific features.\n');
            }
        } else {
            console.error('Generate handler error:', err);
            stream.markdown(`\n\n⚠️ **Error:** ${err instanceof Error ? err.message : String(err)}\n`);
        }
    }
}
