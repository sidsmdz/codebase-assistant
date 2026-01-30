//
// Enhanced ChatViewProvider with modern UI
//
import * as vscode from 'vscode';
import * as path from 'path';
import { KnowledgeBaseManager } from './knowledgeBase/KnowledgeBaseManager';
import { ContextBuilder } from './knowledgeBase/ContextBuilder';
import { getConfig } from './config';

interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private contextBuilder: ContextBuilder;
    private lastQuery: string = '';
    private lastResponse: string = '';
    private lastEnrichedPrompt: string = '';

    // Conversation memory for follow-ups
    private conversationHistory: ConversationMessage[] = [];
    private readonly MAX_HISTORY_LENGTH = 6; // Keep last 3 exchanges (6 messages)

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _kbManager: KnowledgeBaseManager
    ) {
        this.contextBuilder = new ContextBuilder(_kbManager);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {

        console.log('OpenCat: resolveWebviewView called');
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.message);
                    break;
                case 'savePattern':
                    await this.handleSavePattern();
                    break;
                case 'confirmSavePattern':
                    await this.confirmSavePattern(data.name, data.description, data.tags, data.code);
                    break;
                case 'cancelSave':
                    this._view?.webview.postMessage({ type: 'hideSaveForm' });
                    break;
                case 'showContext':
                    await this.handleShowContext();
                    break;
                case 'clearChat':
                    this._view?.webview.postMessage({ type: 'clearMessages' });
                    break;
                case 'showStats':
                    await this.handleShowStats();
                    break;
                case 'browsePatterns':
                case 'browseFeatures':
                    await this.handleBrowseFeatures();
                    break;
                case 'useFeatureAsContext':
                    if (data.userQuestion) {
                        await this.handleUseFeatureAsContext(data.feature, data.userQuestion);
                    } else {
                        await this.promptAndUseFeatureAsContext(data.feature);
                    }
                    break;
                case 'deletePattern':
                    await this.handleDeletePattern(data.patternId);
                    break;
                case 'regenerate':
                    if (this.lastQuery) {
                        await this.handleUserMessage(this.lastQuery);
                    }
                    break;
                case 'followUp':
                    await this.handleUserMessage(data.message, true);
                    break;
                case 'quickAction':
                    await this.handleQuickAction(data.action);
                    break;
                case 'clearHistory':
                    this.conversationHistory = [];
                    this._view?.webview.postMessage({ type: 'historyCleared' });
                    break;
            }
        });

        // Send KB stats on startup
        this.sendKBStats();
    }

    private async sendKBStats() {
        const stats = await this._kbManager.getStats();
        this._view?.webview.postMessage({
            type: 'updateStats',
            stats: {
                patterns: stats.patternCount,
                nodes: stats.astNodeCount,
                terms: stats.termCount
            }
        });
    }

    private async handleUserMessage(message: string, isFollowUp: boolean = false) {
        this._view?.webview.postMessage({
            type: 'addMessage',
            role: 'user',
            content: message
        });

        try {
            this._view?.webview.postMessage({ type: 'startTyping' });

            this.lastQuery = message;
            this.lastResponse = '';

            // Add user message to conversation history
            this.conversationHistory.push({
                role: 'user',
                content: message,
                timestamp: Date.now()
            });

            // Build prompt with conversation context for follow-ups
            let enrichedPrompt: string;
            if (isFollowUp && this.conversationHistory.length > 1) {
                // Include conversation history for follow-ups
                const historyContext = this.buildConversationContext();
                const kbContext = await this.contextBuilder.buildContextForQuery(message);
                enrichedPrompt = `${kbContext}\n\n--- CONVERSATION HISTORY ---\n${historyContext}\n\n--- CURRENT FOLLOW-UP ---\nUser: ${message}`;
            } else {
                enrichedPrompt = await this.contextBuilder.buildContextForQuery(message);
            }
            this.lastEnrichedPrompt = enrichedPrompt;

            const contextSummary = this.summarizeContext(enrichedPrompt);
            const historyIndicator = this.conversationHistory.length > 2
                ? `\n📜 Conversation context: ${Math.floor(this.conversationHistory.length / 2)} previous exchanges`
                : '';

            this._view?.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: `🔍 Found context:\n${contextSummary}${historyIndicator}\n\n🤖 Asking Copilot...`
            });

            const response = await this.callCopilot(enrichedPrompt);

            if (response) {
                this.lastResponse = response;

                // Add assistant response to history
                this.conversationHistory.push({
                    role: 'assistant',
                    content: response,
                    timestamp: Date.now()
                });

                // Trim history if too long
                while (this.conversationHistory.length > this.MAX_HISTORY_LENGTH) {
                    this.conversationHistory.shift();
                }

                // Detect if response offers to generate more
                const offersContinuation = this.detectContinuationOffer(response);

                this._view?.webview.postMessage({
                    type: 'addMessage',
                    role: 'assistant',
                    content: response,
                    showActions: true,
                    quickActions: offersContinuation
                        ? ['yes_generate', 'show_example', 'explain_more']
                        : ['show_example', 'explain_more']
                });

                if (this.containsCode(response)) {
                    this._view?.webview.postMessage({
                        type: 'showSaveButton'
                    });
                }
            } else {
                this._view?.webview.postMessage({
                    type: 'addMessage',
                    role: 'assistant',
                    content: '❌ Copilot unavailable. Make sure GitHub Copilot Chat is installed and active. Check the Output panel (OpenCat) for details.'
                });
            }

        } catch (error) {
            console.error('OpenCat error:', error);
            this._view?.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: `❌ Error: ${error instanceof Error ? error.message : String(error)}`
            });
        } finally {
            this._view?.webview.postMessage({ type: 'stopTyping' });
        }
    }

    private summarizeContext(enrichedPrompt: string): string {
        const summary: string[] = [];

        if (enrichedPrompt.includes('--- CONTEXT: SAVED KNOWLEDGE BASE PATTERNS ---')) {
            const patternSection = enrichedPrompt.split('--- CONTEXT:')[1];
            const patternMatches = patternSection.match(/\*\*Pattern: (.*?)\*\* \(Description: (.*?)\)/g);

            if (patternMatches && patternMatches.length > 0) {
                summary.push('📚 From Knowledge Base:');
                patternMatches.forEach(match => {
                    const parts = match.match(/\*\*Pattern: (.*?)\*\* \(Description: (.*?)\)/);
                    if (parts) {
                        summary.push(`  • ${parts[1]}`);
                    }
                });
            }
        }

        if (enrichedPrompt.includes('--- CONTEXT: RELEVANT EXAMPLES FROM WORKSPACE ---')) {
            const workspaceSection = enrichedPrompt.split('--- CONTEXT: RELEVANT EXAMPLES FROM WORKSPACE ---')[1];
            const workspaceMatches = workspaceSection.match(/\*\*Example from (.*?)\*\*:/g);

            if (workspaceMatches && workspaceMatches.length > 0) {
                summary.push('💻 From Workspace:');
                workspaceMatches.slice(0, 3).forEach(match => {
                    const parts = match.match(/\*\*Example from (.*?)\*\*:/);
                    if (parts) {
                        const fileName = parts[1].split(path.sep).pop() || parts[1];
                        summary.push(`  • ${fileName}`);
                    }
                });
            }
        }

        if (summary.length === 0) {
            return '  • No context found\n  • Asking Copilot directly';
        }

        return summary.join('\n');
    }

    /**
     * Build conversation context from history for follow-up messages
     */
    private buildConversationContext(): string {
        if (this.conversationHistory.length === 0) {
            return '';
        }

        const contextMessages = this.conversationHistory.slice(-this.MAX_HISTORY_LENGTH);
        return contextMessages.map(msg => {
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            // Truncate long messages in history
            const content = msg.content.length > 1000
                ? msg.content.substring(0, 1000) + '... [truncated]'
                : msg.content;
            return `${role}: ${content}`;
        }).join('\n\n');
    }

    /**
     * Detect if the response offers to generate more content
     */
    private detectContinuationOffer(response: string): boolean {
        const continuationPhrases = [
            'if you want',
            'if you\'d like',
            'would you like',
            'i can generate',
            'i can create',
            'i can show',
            'i can provide',
            'let me know if',
            'shall i',
            'do you want me to'
        ];

        const lowerResponse = response.toLowerCase();
        return continuationPhrases.some(phrase => lowerResponse.includes(phrase));
    }

    /**
     * Handle quick action buttons from the UI
     */
    private async handleQuickAction(action: string) {
        const actionMessages: Record<string, string> = {
            'yes_generate': 'Yes, please generate it.',
            'show_example': 'Can you show me a complete example with code?',
            'explain_more': 'Can you explain this in more detail?',
            'show_related': 'What other components or features are related to this?',
            'how_to_use': 'How do I use this in my code?',
            'best_practices': 'What are the best practices for this pattern?',
            'find_bugs': 'Analyze this code for potential bugs, edge cases, and issues. Suggest fixes.',
            'refactor': 'How can I refactor this code to be cleaner and more maintainable?',
            'write_tests': 'Write unit tests for this code. Include edge cases.',
            'recreate_steps': 'Give me step-by-step instructions to recreate this from scratch, suitable for a Copilot agent or developer.',
            'add_feature': 'What features or improvements could be added to this? Suggest enhancements with code.',
            'document_it': 'Generate comprehensive documentation for this code including API docs, usage examples, and architecture notes.'
        };

        const message = actionMessages[action];
        if (message) {
            await this.handleUserMessage(message, true);
        }
    }

    private async callCopilot(prompt: string): Promise<string | null> {
        try {
            const allModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });

            if (allModels.length === 0) {
                console.error('No Copilot language models available. Copilot Chat extension may not be installed or active.');
                return null;
            }

            // Log all available models for debugging
            console.log(`OpenCat: Available models: ${allModels.map(m => m.id).join(', ')}`);

            // Prefer known-working models, sorted by preference
            const preferredModelPatterns = ['gpt-4o', 'gpt-4', 'gpt-3.5', 'claude', 'copilot'];
            const sortedModels = [...allModels].sort((a, b) => {
                const aIdx = preferredModelPatterns.findIndex(p => a.id.toLowerCase().includes(p));
                const bIdx = preferredModelPatterns.findIndex(p => b.id.toLowerCase().includes(p));
                // Models matching a preferred pattern come first; earlier patterns are more preferred
                const aScore = aIdx >= 0 ? aIdx : 999;
                const bScore = bIdx >= 0 ? bIdx : 999;
                return aScore - bScore;
            });

            // Try each model until one succeeds
            const errors: string[] = [];
            for (const model of sortedModels) {
                try {
                    console.log(`OpenCat: Trying model "${model.id}" (vendor: ${model.vendor})`);

                    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
                    const chatResponse = await model.sendRequest(
                        messages,
                        {},
                        new vscode.CancellationTokenSource().token
                    );

                    let fullResponse = '';
                    for await (const fragment of chatResponse.text) {
                        fullResponse += fragment;
                    }

                    console.log(`OpenCat: Success with model "${model.id}"`);
                    return fullResponse;
                } catch (modelError: unknown) {
                    const msg = modelError instanceof Error ? modelError.message : String(modelError);
                    console.warn(`OpenCat: Model "${model.id}" failed: ${msg}`);
                    errors.push(`${model.id}: ${msg}`);
                    // Continue to try the next model
                }
            }

            // All models failed
            console.error(`OpenCat: All ${sortedModels.length} models failed:\n${errors.join('\n')}`);
            return null;

        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error('Failed to call Copilot:', errMsg, error);

            if (errMsg.includes('consent') || errMsg.includes('permission') || errMsg.includes('access')) {
                vscode.window.showWarningMessage(
                    'OpenCat needs permission to use Copilot. Please allow access when prompted.',
                    'Try Again'
                );
            }
            return null;
        }
    }

    private containsCode(text: string): boolean {
        return text.includes('```') ||
               text.includes('class ') ||
               text.includes('function ') ||
               text.includes('public ') ||
               text.includes('export ');
    }

    private async handleShowContext() {
        if (!this.lastEnrichedPrompt) {
            vscode.window.showInformationMessage('No context available. Ask a question first.');
            return;
        }

        const doc = await vscode.workspace.openTextDocument({
            content: this.lastEnrichedPrompt,
            language: 'markdown'
        });

        await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: true
        });
    }

    private async handleShowStats() {
        const detailedStats = await this._kbManager.getDetailedStats();

        let message = '📊 **Knowledge Base Statistics**\n\n';
        message += `**Total:** ${detailedStats.totalPatterns} patterns, ${detailedStats.totalASTNodes} AST nodes\n\n`;

        if (Object.keys(detailedStats.patternsByLanguage).length > 0) {
            message += '**By Language:**\n';
            Object.entries(detailedStats.patternsByLanguage)
                .sort((a, b) => b[1] - a[1])
                .forEach(([lang, count]) => {
                    message += `• ${lang}: ${count}\n`;
                });
        }

        this._view?.webview.postMessage({
            type: 'addMessage',
            role: 'assistant',
            content: message
        });
    }

    private async handleSavePattern() {
        if (!this.lastResponse || this.lastResponse.length === 0) {
            this._view?.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: '❌ No response to save. Ask a question first.'
            });
            return;
        }

        const codeBlocks = this.extractCodeBlocks(this.lastResponse);

        if (codeBlocks.length === 0) {
            this._view?.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: '❌ No code found in the response.'
            });
            return;
        }

        const code = codeBlocks[0];
        const language = this.detectLanguage(code);
        const suggestedName = this.suggestPatternName(code, this.lastQuery);
        const suggestedTags = this.suggestTags(code, this.lastQuery);

        this._view?.webview.postMessage({
            type: 'showSaveForm',
            code: code,
            language: language,
            suggestedName: suggestedName,
            suggestedDescription: this.lastQuery,
            suggestedTags: suggestedTags
        });
    }

    private async confirmSavePattern(name: string, description: string, tags: string, code: string) {
        const language = this.detectLanguage(code);

        try {
            await this._kbManager.savePattern({
                name: name.trim(),
                language,
                code: code.trim(),
                description: description.trim() || this.lastQuery,
                query: this.lastQuery,
                tags: tags ? tags.split(',').map(t => t.trim()).filter(t => t.length > 0) : []
            });

            this._view?.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: `✅ Pattern "${name}" saved to Knowledge Base!\n\nYou can now use this pattern in future queries.`
            });

            this._view?.webview.postMessage({ type: 'hideSaveForm' });
            this._view?.webview.postMessage({ type: 'hideSaveButton' });

            // Update stats
            await this.sendKBStats();

        } catch (error) {
            console.error('Save pattern error:', error);
            this._view?.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: `❌ Failed to save: ${error}`
            });
        }
    }

    private async handleBrowseFeatures() {
        // Get features from workspace scanning (features table)
        const features = await this._kbManager.getAllFeatures();

        // For each feature, get its components to build full context
        const featuresWithContext = await Promise.all(features.map(async (feature) => {
            const components = await this._kbManager.getComponentsForFeature(feature.id);

            // Build full code context from all components
            const codeContext = components.map(comp =>
                `// --- ${comp.type}: ${comp.name} ---\n// File: ${comp.filePath}:${comp.startLine}-${comp.endLine}\n${comp.code || ''}`
            ).join('\n\n');

            return {
                id: feature.id,
                name: feature.name,
                language: feature.languages.length > 0 ? feature.languages[0] : 'multiple',
                code: codeContext || `// Feature: ${feature.name}\n// No component code available`,
                description: feature.description || `Feature with ${components.length} components across ${feature.languages.join(', ')}`,
                query: '',
                savedAt: new Date().toISOString(),
                tags: [...feature.tags, ...feature.frameworks],
                metadata: {
                    category: 'Feature',
                    framework: feature.frameworks.length > 0 ? feature.frameworks[0] : undefined,
                    componentCount: components.length,
                    languages: feature.languages,
                    entryPoints: feature.entryPoints
                },
                // Data flow information
                flow: feature.flow || [],
                // Include component details with dependencies for richer context
                components: components.map(c => ({
                    id: c.id,
                    name: c.name,
                    type: c.type,
                    filePath: c.filePath,
                    language: c.language,
                    startLine: c.startLine,
                    endLine: c.endLine,
                    dependencies: c.dependencies || [],
                    dependents: c.dependents || [],
                    annotations: c.annotations || [],
                    code: c.code || ''
                }))
            };
        }));

        console.log(`Browse Features: ${features.length} features loaded with full context`);

        this._view?.webview.postMessage({
            type: 'allFeatures',
            features: featuresWithContext
        });
    }

    /**
     * Prompt user for a question using VS Code's native input box, then use feature as context
     */
    private async promptAndUseFeatureAsContext(feature: any) {
        const userQuestion = await vscode.window.showInputBox({
            prompt: `What would you like to know about "${feature.name}"?`,
            placeHolder: 'e.g., How does this feature work? / Explain the main components',
            value: 'How does this feature work?'
        });

        if (userQuestion && userQuestion.trim()) {
            await this.handleUseFeatureAsContext(feature, userQuestion.trim());
        }
    }

    /**
     * Handle using a feature as context for a Copilot query
     */
    private async handleUseFeatureAsContext(feature: any, userQuestion: string) {
        // Show user's question in chat
        this._view?.webview.postMessage({
            type: 'addMessage',
            role: 'user',
            content: userQuestion
        });

        try {
            this._view?.webview.postMessage({ type: 'startTyping' });

            // Build context summary for display
            const componentCount = feature.metadata?.componentCount || 0;
            const languages = feature.metadata?.languages?.join(', ') || feature.language;
            const frameworks = feature.tags?.filter((t: string) => !['feature', 'workspace-scanned'].includes(t)).slice(0, 3).join(', ') || 'none';
            const flowCount = feature.flow?.length || 0;
            const entryPoints = feature.metadata?.entryPoints || [];
            const components = feature.components || [];

            // Build data flow summary for display
            let flowSummary = '';
            if (flowCount > 0) {
                flowSummary = `• Data Flow: ${flowCount} connections\n`;
            }

            // Count dependencies
            let totalDeps = 0;
            components.forEach((c: any) => { totalDeps += (c.dependencies?.length || 0); });

            const contextSummary = `📁 **Feature Context: ${feature.name}**
• Components: ${componentCount}
• Languages: ${languages}
• Tags: ${frameworks}
${flowSummary}• Dependencies tracked: ${totalDeps}
• Entry points: ${entryPoints.length}
• Code length: ${feature.code?.length || 0} characters`;

            // Show context being sent
            this._view?.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: `🔍 **Using Feature as Context**\n\n${contextSummary}\n\n🤖 Asking Copilot with full data flow context...`
            });

            // Build rich prompt with data flow, component layers, and dependencies
            let enrichedPrompt = `You are a helpful code assistant with deep knowledge of the project's codebase.

============================================================
FEATURE: ${feature.name}
============================================================

**Description:** ${feature.description || 'No description'}
**Languages:** ${languages}
**Frameworks:** ${frameworks}
**Tags:** ${feature.tags?.join(', ') || 'none'}

`;

            // Add data flow diagram
            if (feature.flow && feature.flow.length > 0) {
                enrichedPrompt += `### Data Flow:\n\`\`\`\n`;
                for (const flow of feature.flow) {
                    enrichedPrompt += `${flow.description || `${flow.from} -[${flow.type || 'calls'}]-> ${flow.to}`}\n`;
                }
                enrichedPrompt += `\`\`\`\n\n`;
            }

            // Add components sorted by architectural layer
            if (components.length > 0) {
                const layerOrder: Record<string, number> = {
                    'controller': 1, 'component': 1, 'hook': 1,
                    'event-handler': 2, 'middleware': 2,
                    'service': 3, 'api-client': 4,
                    'repository': 5, 'model': 6,
                    'util': 7, 'config': 8, 'unknown': 9
                };

                const sorted = [...components].sort((a: any, b: any) => {
                    const aEntry = entryPoints.includes(a.id) ? 0 : 1;
                    const bEntry = entryPoints.includes(b.id) ? 0 : 1;
                    if (aEntry !== bEntry) { return aEntry - bEntry; }
                    return (layerOrder[a.type] || 9) - (layerOrder[b.type] || 9);
                });

                enrichedPrompt += `### Components (${components.length}):\n\n`;

                for (const comp of sorted) {
                    const isEntry = entryPoints.includes(comp.id);
                    const entryLabel = isEntry ? ' [ENTRY POINT]' : '';

                    enrichedPrompt += `#### ${(comp.type || 'unknown').toUpperCase()}: ${comp.name}${entryLabel}\n`;
                    enrichedPrompt += `- **File:** ${comp.filePath?.split('/').slice(-2).join('/') || 'unknown'}:${comp.startLine || 0}\n`;
                    enrichedPrompt += `- **Language:** ${comp.language || 'unknown'}\n`;

                    if (comp.annotations?.length > 0) {
                        const relevant = comp.annotations.filter((a: string) => !a.startsWith('@param') && !a.startsWith('@return')).slice(0, 5);
                        if (relevant.length > 0) {
                            enrichedPrompt += `- **Annotations:** ${relevant.join(', ')}\n`;
                        }
                    }

                    if (comp.dependencies?.length > 0) {
                        enrichedPrompt += `- **Dependencies:** ${comp.dependencies.slice(0, 8).join(', ')}\n`;
                    }

                    if (comp.dependents?.length > 0) {
                        enrichedPrompt += `- **Used by:** ${comp.dependents.slice(0, 5).join(', ')}\n`;
                    }

                    // Include the code (truncated if too large)
                    if (comp.code) {
                        const maxLen = 2000;
                        enrichedPrompt += `\n\`\`\`${comp.language || 'text'}\n`;
                        if (comp.code.length > maxLen) {
                            enrichedPrompt += comp.code.substring(0, maxLen) + '\n// ... (truncated)\n';
                        } else {
                            enrichedPrompt += comp.code;
                        }
                        enrichedPrompt += `\n\`\`\`\n\n`;
                    }
                }
            } else {
                // Fallback to aggregated code
                enrichedPrompt += `### Code:\n\`\`\`${feature.language || 'text'}\n${feature.code}\n\`\`\`\n\n`;
            }

            enrichedPrompt += `============================================================
USER QUESTION
============================================================

${userQuestion}

**Instructions:** Answer the user's question using the full feature context above — including the data flow, component architecture, dependencies, and code. Reference specific components, their relationships, and file locations when relevant.`;

            this.lastQuery = userQuestion;
            this.lastEnrichedPrompt = enrichedPrompt;

            // Add to conversation history
            this.conversationHistory.push({
                role: 'user',
                content: `[Feature: ${feature.name}] ${userQuestion}`,
                timestamp: Date.now()
            });

            const response = await this.callCopilot(enrichedPrompt);

            if (response) {
                this.lastResponse = response;

                // Add to conversation history
                this.conversationHistory.push({
                    role: 'assistant',
                    content: response,
                    timestamp: Date.now()
                });

                // Trim history if too long
                while (this.conversationHistory.length > this.MAX_HISTORY_LENGTH) {
                    this.conversationHistory.shift();
                }

                // Send response with action buttons
                this._view?.webview.postMessage({
                    type: 'addMessage',
                    role: 'assistant',
                    content: response,
                    showActions: true,
                    featureContext: feature.name,
                    quickActions: ['explain_more', 'find_bugs', 'refactor', 'write_tests', 'recreate_steps', 'add_feature', 'document_it']
                });

                // Show save button if response contains code
                if (this.containsCode(response)) {
                    this._view?.webview.postMessage({
                        type: 'showSaveButton'
                    });
                }
            } else {
                this._view?.webview.postMessage({
                    type: 'addMessage',
                    role: 'assistant',
                    content: '❌ Copilot unavailable. Make sure GitHub Copilot Chat is installed and active. Check the Output panel (OpenCat) for details.'
                });
            }

        } catch (error) {
            console.error('OpenCat feature context error:', error);
            this._view?.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: `❌ Error: ${error instanceof Error ? error.message : String(error)}`
            });
        } finally {
            this._view?.webview.postMessage({ type: 'stopTyping' });
        }
    }

    private async handleDeletePattern(patternId: string) {
        await this._kbManager.deletePattern(patternId);
        this._view?.webview.postMessage({
            type: 'addMessage',
            role: 'assistant',
            content: '✅ Pattern deleted successfully'
        });
        // Refresh the feature list if browser is open
        await this.handleBrowseFeatures();
    }

    private extractCodeBlocks(text: string): string[] {
        const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
        const matches = [];
        let match;

        while ((match = codeBlockRegex.exec(text)) !== null) {
            matches.push(match[1].trim());
        }

        return matches;
    }

    private suggestPatternName(code: string, query: string): string {
        const classMatch = code.match(/(?:class|interface)\s+(\w+)/);
        if (classMatch) {
            return `${classMatch[1]} Pattern`;
        }

        const words = query.split(' ').filter(w => w.length > 3);
        if (words.length > 0) {
            return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Pattern';
        }

        return 'Custom Pattern';
    }

    private suggestTags(code: string, query: string): string {
        const tags = new Set<string>();
        const config = getConfig();

        for (const type in config.types) {
            for (const keyword of config.types[type]) {
                if (code.includes(keyword)) {
                    tags.add(type);
                }
            }
        }

        if (code.includes('grpc')) {
            tags.add('grpc');
        }

        const queryWords = query.toLowerCase().split(' ').filter(w =>
            w.length > 3 && !['create', 'make', 'build', 'write'].includes(w)
        );
        queryWords.slice(0, 2).forEach(w => tags.add(w));

        return [...tags].join(', ');
    }

    private detectLanguage(code: string): string {
        return getConfig().language;
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const timestamp = Date.now();
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <!-- Version: ${timestamp} -->
    <title>OpenCat v0.2.0</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        :root {
            --primary-color: var(--vscode-button-background);
            --primary-hover: var(--vscode-button-hoverBackground);
            --border-radius: 8px;
            --message-spacing: 16px;
        }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        /* Header with stats */
        #header {
            padding: 12px 16px;
            background: linear-gradient(135deg, var(--vscode-sideBarSectionHeader-background), rgba(0, 122, 204, 0.08));
            border-bottom: 2px solid rgba(0, 122, 204, 0.3);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        #header-title {
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        #kb-stats {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            gap: 12px;
        }

        .stat-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        /* Welcome screen */
        #welcome-screen {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 24px;
            text-align: center;
        }

        #welcome-screen.hidden {
            display: none;
        }

        .welcome-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }

        .welcome-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .welcome-subtitle {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 24px;
        }

        .example-prompts {
            display: grid;
            gap: 8px;
            width: 100%;
            max-width: 400px;
        }

        .example-prompt {
            padding: 12px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: var(--border-radius);
            cursor: pointer;
            transition: all 0.2s;
            text-align: left;
        }

        .example-prompt:hover {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-list-hoverBackground);
        }

        .example-prompt-title {
            font-weight: 600;
            font-size: 13px;
            margin-bottom: 4px;
        }

        .example-prompt-desc {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .welcome-actions {
            margin-top: 24px;
            width: 100%;
            max-width: 400px;
        }

        .welcome-action-btn {
            width: 100%;
            padding: 12px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: var(--border-radius);
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .welcome-action-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        /* Messages area */
        #messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: var(--message-spacing);
        }

        #messages.hidden {
            display: none;
        }

        .message {
            padding: 12px 16px;
            border-radius: var(--border-radius);
            max-width: 90%;
            word-wrap: break-word;
            position: relative;
            animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .message.user {
            background: linear-gradient(135deg, rgba(0, 122, 204, 0.15), rgba(0, 122, 204, 0.08));
            align-self: flex-end;
            border: 1px solid rgba(0, 122, 204, 0.3);
            border-bottom-right-radius: 4px;
            box-shadow: 0 2px 8px rgba(0, 122, 204, 0.1);
        }

        .message.assistant {
            background: linear-gradient(135deg, rgba(76, 175, 80, 0.1), rgba(76, 175, 80, 0.04));
            align-self: flex-start;
            border: 1px solid rgba(76, 175, 80, 0.2);
            border-bottom-left-radius: 4px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .message.assistant strong {
            color: var(--vscode-textLink-foreground);
        }

        .message-content {
            white-space: pre-wrap;
            line-height: 1.7;
            font-size: 13px;
        }

        .message-actions {
            display: flex;
            gap: 8px;
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .message-action-btn {
            padding: 5px 10px;
            font-size: 11px;
            background-color: rgba(255, 255, 255, 0.06);
            color: var(--vscode-textLink-foreground);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
        }

        .message-action-btn:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        /* Quick action buttons for follow-ups */
        .quick-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            align-items: center;
        }

        .quick-actions-label {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            font-weight: 700;
            margin-right: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .quick-action-btn {
            padding: 5px 10px;
            font-size: 11px;
            background: linear-gradient(135deg, rgba(0, 122, 204, 0.15), rgba(0, 122, 204, 0.08));
            color: var(--vscode-textLink-foreground);
            border: 1px solid rgba(0, 122, 204, 0.25);
            border-radius: 14px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            font-weight: 500;
        }

        .quick-action-btn:hover {
            background: linear-gradient(135deg, var(--vscode-button-background), var(--vscode-button-hoverBackground));
            color: var(--vscode-button-foreground);
            transform: translateY(-1px);
            box-shadow: 0 3px 8px rgba(0, 122, 204, 0.25);
            border-color: var(--vscode-button-background);
        }

        .quick-action-btn:active {
            transform: translateY(0);
        }

        /* Typing indicator */
        #typing {
            padding: 16px 20px;
            display: none;
            align-items: center;
            gap: 10px;
            color: var(--vscode-foreground);
            font-size: 13px;
            font-weight: 500;
            background: var(--vscode-editor-background);
            border-radius: 10px;
            margin: 8px 16px;
            width: fit-content;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .typing-dots {
            display: flex;
            gap: 5px;
            padding: 4px;
        }

        .typing-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--vscode-focusBorder), var(--vscode-button-background));
            animation: typing 1.4s infinite ease-in-out;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .typing-dot:nth-child(2) {
            animation-delay: 0.2s;
        }

        .typing-dot:nth-child(3) {
            animation-delay: 0.4s;
        }

        @keyframes typing {
            0%, 60%, 100% {
                opacity: 0.4;
                transform: translateY(0) scale(1);
            }
            30% {
                opacity: 1;
                transform: translateY(-10px) scale(1.2);
            }
        }

        /* Code blocks */
        pre {
            background-color: rgba(0, 0, 0, 0.35);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 0;
            overflow-x: auto;
            margin: 10px 0;
            position: relative;
            border-left: 3px solid var(--vscode-focusBorder);
        }

        pre.code-block code {
            display: block;
            padding: 14px;
        }

        .code-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 12px;
            background: rgba(255, 255, 255, 0.05);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px 8px 0 0;
        }

        .code-lang {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-textLink-foreground);
            opacity: 0.8;
        }

        .code-copy-btn {
            font-size: 11px;
            padding: 2px 8px;
            background: transparent;
            color: var(--vscode-descriptionForeground);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s;
        }

        .code-copy-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: var(--vscode-foreground);
        }

        code {
            font-family: 'Cascadia Code', 'Fira Code', 'Courier New', Consolas, monospace;
            font-size: 12px;
            line-height: 1.5;
        }

        /* Inline code styling */
        .message-content > code, .message-content p > code {
            background: rgba(0, 122, 204, 0.15);
            border: 1px solid rgba(0, 122, 204, 0.2);
            border-radius: 4px;
            padding: 1px 5px;
            font-size: 12px;
            color: var(--vscode-textLink-foreground);
        }

        /* Syntax highlighting colors */
        .hl-keyword {
            color: #c586c0;
            font-weight: 600;
        }

        .hl-string {
            color: #ce9178;
        }

        .hl-comment {
            color: #6a9955;
            font-style: italic;
        }

        .hl-number {
            color: #b5cea8;
        }

        .hl-type {
            color: #4ec9b0;
        }

        .hl-annotation {
            color: #dcdcaa;
        }

        .code-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .code-language {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            font-weight: 600;
            text-transform: uppercase;
        }

        .copy-code-btn {
            padding: 4px 8px;
            font-size: 11px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }

        .copy-code-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        /* Save form */
        #save-form-container {
            display: none;
            padding: 16px;
            background-color: var(--vscode-sideBarSectionHeader-background);
            border-top: 2px solid var(--vscode-focusBorder);
            border-bottom: 1px solid var(--vscode-panel-border);
            max-height: 60vh;
            overflow-y: auto;
        }

        #save-form-container.visible {
            display: block;
        }

        .form-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .code-preview {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 16px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            max-height: 200px;
            overflow-y: auto;
            white-space: pre;
        }

        .form-group {
            margin-bottom: 16px;
        }

        .form-label {
            display: block;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 6px;
            color: var(--vscode-foreground);
        }

        .form-input {
            width: 100%;
            padding: 8px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            transition: border-color 0.2s;
        }

        .form-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .form-buttons {
            display: flex;
            gap: 8px;
            margin-top: 16px;
        }

        .btn-save, .btn-cancel {
            flex: 1;
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            font-size: 13px;
            transition: all 0.2s;
        }

        .btn-save {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-save:hover {
            background-color: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
        }

        .btn-cancel {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn-cancel:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        /* Action buttons */
        #action-buttons {
            padding: 8px 16px;
            display: none;
            gap: 8px;
            flex-wrap: wrap;
            background-color: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .action-btn {
            padding: 8px 16px;
            background-color: transparent;
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-button-border, transparent);
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.15s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .action-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-hoverBackground);
        }

        .action-btn.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
            font-weight: 600;
        }

        .action-btn.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
            border-color: var(--vscode-button-hoverBackground);
        }

        /* Input area */
        #input-area {
            padding: 16px 20px;
            border-top: 2px solid var(--vscode-panel-border);
            display: flex;
            gap: 10px;
            background-color: var(--vscode-sideBar-background);
            align-items: flex-end;
        }

        #message-input {
            flex: 1;
            padding: 12px 16px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 2px solid var(--vscode-input-border);
            border-radius: 10px;
            font-family: var(--vscode-font-family);
            font-size: 14px;
            line-height: 1.5;
            resize: none;
            min-height: 44px;
            max-height: 120px;
            transition: all 0.2s;
        }

        #message-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }

        #message-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
            opacity: 0.6;
        }

        #send-button {
            padding: 12px 24px;
            background-color: var(--primary-color);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            min-height: 44px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        #send-button:hover:not(:disabled) {
            background-color: var(--primary-hover);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        #send-button:active:not(:disabled) {
            transform: translateY(0);
        }

        #send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            box-shadow: none;
        }

        .utility-btns {
            display: flex;
            gap: 6px;
        }

        .utility-btn {
            padding: 10px;
            background-color: transparent;
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            min-height: 44px;
            min-width: 44px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }

        .utility-btn:hover {
            background-color: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
            transform: translateY(-1px);
        }

        /* Pattern Browser Modal */
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            animation: fadeIn 0.2s;
        }

        .modal.active {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .pattern-browser {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 12px;
            width: 90%;
            max-width: 1200px;
            height: 85vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
            overflow: hidden;
        }

        .browser-header {
            padding: 24px 28px;
            background: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 2px solid var(--vscode-focusBorder);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .browser-header h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .close-btn {
            background: transparent;
            border: 1px solid transparent;
            border-radius: 6px;
            padding: 4px 12px;
            font-size: 24px;
            cursor: pointer;
            color: var(--vscode-foreground);
            opacity: 0.8;
            transition: all 0.15s ease;
        }

        .close-btn:hover {
            opacity: 1;
            background: var(--vscode-toolbar-hoverBackground);
            border-color: var(--vscode-button-border);
        }

        .browser-search {
            padding: 20px 24px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-editor-background);
        }

        .search-input {
            width: 100%;
            padding: 12px 16px 12px 38px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-size: 14px;
            margin-bottom: 16px;
            transition: all 0.2s;
            background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="%23888" d="M15.7 13.3l-3.8-3.8c.8-1.1 1.3-2.5 1.3-4C13.2 2.4 10.8 0 7.6 0S2 2.4 2 5.5 4.4 11 7.6 11c1.5 0 2.9-.5 4-1.3l3.8 3.8 1.3-1.2zM3.5 5.5c0-2.3 1.8-4.1 4.1-4.1s4.1 1.8 4.1 4.1-1.8 4.1-4.1 4.1-4.1-1.8-4.1-4.1z"/></svg>');
            background-repeat: no-repeat;
            background-position: 12px center;
            background-size: 16px;
        }

        .search-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }

        .search-filters {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            align-items: center;
        }

        .search-filters select {
            padding: 8px 32px 8px 12px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            appearance: none;
            background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><path fill="%23888" d="M6 9L1 4h10z"/></svg>');
            background-repeat: no-repeat;
            background-position: right 10px center;
            min-width: 140px;
        }

        .search-filters select:hover {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-dropdown-background);
        }

        .search-filters select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }

        .browser-stats {
            padding: 12px 24px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 13px;
            font-weight: 500;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .browser-stats::before {
            content: "📊";
            font-size: 14px;
        }

        .pattern-list {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
            gap: 20px;
            align-content: start;
            background: var(--vscode-sideBar-background);
        }

        .pattern-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 10px;
            padding: 18px;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        }

        .pattern-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background: var(--vscode-focusBorder);
            opacity: 0;
            transition: opacity 0.25s;
        }

        .pattern-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
            border-color: var(--vscode-focusBorder);
        }

        .pattern-card:hover::before {
            opacity: 1;
        }

        .pattern-card-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 12px;
        }

        .pattern-title {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .pattern-icon {
            font-size: 20px;
        }

        .pattern-name {
            font-weight: 600;
            font-size: 15px;
        }

        .pattern-language-badge {
            padding: 5px 12px;
            border-radius: 14px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.3px;
            text-transform: uppercase;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border: 1px solid var(--vscode-badge-background);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .pattern-card-body {
            margin-bottom: 12px;
        }

        .pattern-description {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            margin: 0 0 12px 0;
            line-height: 1.5;
        }

        .pattern-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 7px;
            margin-bottom: 14px;
        }

        .tag {
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 10.5px;
            font-weight: 500;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-foreground);
            transition: all 0.2s;
            cursor: default;
        }

        .tag:hover {
            background: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
            transform: translateY(-1px);
        }

        .pattern-metadata {
            display: flex;
            gap: 12px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .pattern-card-actions {
            display: flex;
            gap: 6px;
            margin-top: 14px;
            padding-top: 14px;
            border-top: 1px solid var(--vscode-panel-border);
            flex-wrap: wrap;
        }

        .card-action-btn {
            padding: 6px 10px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.06);
            color: var(--vscode-foreground);
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }

        .card-action-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .card-action-btn:active {
            transform: translateY(0);
        }

        .view-btn:hover {
            background: rgba(0, 122, 204, 0.2);
            border-color: rgba(0, 122, 204, 0.4);
            color: var(--vscode-textLink-foreground);
        }

        .explain-btn:hover {
            background: rgba(156, 39, 176, 0.2);
            border-color: rgba(156, 39, 176, 0.4);
            color: #ce93d8;
        }

        .fix-btn:hover {
            background: rgba(255, 152, 0, 0.2);
            border-color: rgba(255, 152, 0, 0.4);
            color: #ffb74d;
        }

        .recreate-btn:hover {
            background: rgba(0, 188, 212, 0.2);
            border-color: rgba(0, 188, 212, 0.4);
            color: #4dd0e1;
        }

        .use-btn {
            background: linear-gradient(135deg, rgba(76, 175, 80, 0.2), rgba(76, 175, 80, 0.1));
            color: #81c784;
            border-color: rgba(76, 175, 80, 0.3);
        }

        .use-btn:hover {
            background: linear-gradient(135deg, rgba(76, 175, 80, 0.35), rgba(76, 175, 80, 0.2));
            box-shadow: 0 2px 8px rgba(76, 175, 80, 0.2);
        }

        .delete-btn {
            background: transparent;
            color: var(--vscode-errorForeground);
            border-color: var(--vscode-inputValidation-errorBorder);
        }

        .delete-btn:hover {
            background: var(--vscode-inputValidation-errorBackground);
        }

        .empty-state {
            grid-column: 1 / -1;
            text-align: center;
            padding: 80px 20px;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-editor-background);
            border-radius: 12px;
            border: 2px dashed var(--vscode-panel-border);
            margin: 20px;
        }

        .empty-state-icon {
            font-size: 56px;
            margin-bottom: 20px;
            opacity: 0.6;
        }

        .empty-state-title {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }

        .empty-state-message {
            font-size: 14px;
            opacity: 0.75;
            line-height: 1.6;
            max-width: 400px;
            margin: 0 auto;
        }

        /* Feature Grouping Styles */
        .feature-group {
            grid-column: 1 / -1;
            margin-bottom: 32px;
        }

        .feature-group-title {
            font-size: 17px;
            font-weight: 700;
            color: var(--vscode-foreground);
            margin-bottom: 16px;
            padding: 12px 16px;
            background: var(--vscode-sideBarSectionHeader-background);
            border-left: 4px solid var(--vscode-focusBorder);
            border-radius: 6px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .feature-group-title::before {
            content: "📁";
            font-size: 18px;
        }

        .feature-count {
            font-size: 12px;
            font-weight: 600;
            padding: 3px 10px;
            border-radius: 12px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            margin-left: auto;
        }

        .feature-group-patterns {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
            gap: 20px;
            margin-top: 16px;
        }

        .group-toggle {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            color: var(--vscode-foreground);
            user-select: none;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            transition: all 0.2s;
        }

        .group-toggle:hover {
            background: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
        }

        .group-toggle input[type="checkbox"] {
            cursor: pointer;
            width: 16px;
            height: 16px;
            margin: 0;
        }
    </style>
</head>
<body>
    <div id="header">
        <div id="header-title">
            <span>🐱 OpenCat</span>
        </div>
        <div id="kb-stats">
            <div class="stat-item">
                <span>📦</span>
                <span id="stat-patterns">0</span>
            </div>
            <div class="stat-item">
                <span>🌳</span>
                <span id="stat-nodes">0</span>
            </div>
        </div>
    </div>

    <div id="welcome-screen">
        <div class="welcome-icon">🐱</div>
        <div class="welcome-title">Welcome to OpenCat!</div>
        <div class="welcome-subtitle">Your AI-powered code assistant with knowledge base</div>

        <div class="example-prompts">
            <div class="example-prompt" data-prompt="How do I create a Spring Boot REST controller?">
                <div class="example-prompt-title">🌱 Spring Boot Example</div>
                <div class="example-prompt-desc">Create a REST controller</div>
            </div>
            <div class="example-prompt" data-prompt="Show me how to use AG Grid with React">
                <div class="example-prompt-title">⚛️ React Component</div>
                <div class="example-prompt-desc">AG Grid integration</div>
            </div>
            <div class="example-prompt" data-prompt="How do I implement a gRPC service?">
                <div class="example-prompt-title">🔌 gRPC Service</div>
                <div class="example-prompt-desc">Create async service</div>
            </div>
            <div class="example-prompt" data-prompt="What patterns are in my knowledge base?">
                <div class="example-prompt-title">📊 Knowledge Base</div>
                <div class="example-prompt-desc">View saved patterns</div>
            </div>
        </div>

        <div class="welcome-actions">
            <button class="welcome-action-btn" id="welcome-browse-features-btn">
                📚 Browse Features
            </button>
        </div>
    </div>

    <div id="messages" class="hidden"></div>

    <div id="typing">
        <div class="typing-dots">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
        <span>OpenCat is thinking...</span>
    </div>

    <div id="save-form-container">
        <div class="form-title">
            <span>💾</span>
            <span>Save Pattern to Knowledge Base</span>
        </div>

        <div class="form-group">
            <label class="form-label">Code Preview</label>
            <div class="code-preview" id="code-preview"></div>
        </div>

        <div class="form-group">
            <label class="form-label">Pattern Name *</label>
            <input type="text" class="form-input" id="pattern-name" placeholder="e.g., OrderController Pattern">
        </div>

        <div class="form-group">
            <label class="form-label">Description</label>
            <input type="text" class="form-input" id="pattern-description" placeholder="What does this pattern do?">
        </div>

        <div class="form-group">
            <label class="form-label">Tags (comma-separated)</label>
            <input type="text" class="form-input" id="pattern-tags" placeholder="controller, rest, crud">
        </div>

        <div class="form-buttons">
            <button class="btn-save" id="confirm-save-btn">✅ Save Pattern</button>
            <button class="btn-cancel" id="cancel-save-btn">❌ Cancel</button>
        </div>
    </div>

    <div id="action-buttons">
        <button class="action-btn" id="browse-features-btn">📚 Browse Features</button>
        <button class="action-btn" id="show-context-btn">🔍 Show Context</button>
        <button class="action-btn primary" id="save-pattern-btn">💾 Save Pattern</button>
        <button class="action-btn" id="clear-chat-btn">🗑️ Clear Chat</button>
        <button class="action-btn" id="show-stats-btn">📊 Stats</button>
    </div>

    <div id="input-area">
        <textarea
            id="message-input"
            rows="3"
            placeholder="Ask OpenCat anything... (Shift+Enter for new line, Enter to send)"
        ></textarea>
        <div class="utility-btns">
            <button class="utility-btn" id="send-button" title="Send message">▶</button>
        </div>
    </div>

    <!-- Feature Browser Modal -->
    <div id="feature-browser-modal" class="modal">
        <div class="modal-content pattern-browser">
            <div class="browser-header">
                <h2>📚 Workspace Features</h2>
                <button class="close-btn" id="close-browser-btn">×</button>
            </div>

            <div class="browser-search">
                <input
                    type="text"
                    id="pattern-search-input"
                    placeholder="🔍 Search patterns by name, tag, language..."
                    class="search-input"
                />
                <div class="search-filters">
                    <select id="feature-filter">
                        <option value="all">All Features</option>
                        <!-- Features will be dynamically populated -->
                    </select>
                    <select id="language-filter">
                        <option value="all">All Languages</option>
                        <option value="java">Java</option>
                        <option value="typescript">TypeScript</option>
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="go">Go</option>
                    </select>
                    <select id="sort-by">
                        <option value="recent">Most Recent</option>
                        <option value="name">Name (A-Z)</option>
                        <option value="language">Language</option>
                        <option value="feature">Feature</option>
                    </select>
                    <label class="group-toggle">
                        <input type="checkbox" id="group-by-feature" />
                        Group by Feature
                    </label>
                </div>
            </div>

            <div class="browser-stats">
                <span id="pattern-count">Loading patterns...</span>
            </div>

            <div class="pattern-list" id="pattern-list">
                <!-- Patterns will be dynamically inserted here -->
            </div>
        </div>
    </div>

    <script>
        (function() {
            try {
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const welcomeScreen = document.getElementById('welcome-screen');
        const typingDiv = document.getElementById('typing');
        const input = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');
        const actionButtons = document.getElementById('action-buttons');

        const saveFormContainer = document.getElementById('save-form-container');
        const codePreview = document.getElementById('code-preview');
        const patternName = document.getElementById('pattern-name');
        const patternDescription = document.getElementById('pattern-description');
        const patternTags = document.getElementById('pattern-tags');
        const confirmSaveBtn = document.getElementById('confirm-save-btn');
        const cancelSaveBtn = document.getElementById('cancel-save-btn');

        let currentCode = '';
        let hasMessages = false;

        // Example prompts
        document.querySelectorAll('.example-prompt').forEach(prompt => {
            prompt.addEventListener('click', () => {
                const text = prompt.getAttribute('data-prompt');
                input.value = text;
                sendMessage();
            });
        });

        // Syntax highlighting for code blocks
        function highlightCode(escapedCode, lang) {
            if (!lang || lang === 'text') return escapedCode;
            try {
                var kwMap = {
                    java: ['abstract','assert','boolean','break','byte','case','catch','char','class','const','continue','default','do','double','else','enum','extends','final','finally','float','for','if','implements','import','instanceof','int','interface','long','native','new','package','private','protected','public','return','short','static','super','switch','synchronized','this','throw','throws','transient','try','void','volatile','while'],
                    typescript: ['abstract','any','as','async','await','boolean','break','case','catch','class','const','constructor','continue','declare','default','delete','do','else','enum','export','extends','false','finally','for','from','function','get','if','implements','import','in','instanceof','interface','is','keyof','let','module','namespace','never','new','null','number','of','private','protected','public','readonly','return','set','static','string','super','switch','this','throw','true','try','type','typeof','undefined','var','void','while','yield'],
                    javascript: ['async','await','break','case','catch','class','const','continue','default','delete','do','else','export','extends','false','finally','for','from','function','if','import','in','instanceof','let','new','null','of','return','static','super','switch','this','throw','true','try','typeof','undefined','var','void','while','yield'],
                    python: ['False','None','True','and','as','assert','async','await','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','not','or','pass','raise','return','try','while','with','yield'],
                    go: ['break','case','chan','const','continue','default','defer','else','for','func','go','goto','if','import','interface','map','package','range','return','select','struct','switch','type','var'],
                    sql: ['SELECT','FROM','WHERE','AND','OR','NOT','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','ALTER','DROP','JOIN','LEFT','RIGHT','INNER','OUTER','ON','GROUP','BY','ORDER','ASC','DESC','HAVING','LIMIT','AS','DISTINCT','EXISTS','IN','BETWEEN','LIKE','IS','NULL','PRIMARY','KEY','DEFAULT','CASE','WHEN','THEN','END']
                };
                var langKey = lang.toLowerCase();
                if (langKey === 'ts' || langKey === 'tsx') langKey = 'typescript';
                if (langKey === 'js' || langKey === 'jsx') langKey = 'javascript';
                if (langKey === 'py') langKey = 'python';
                var kws = kwMap[langKey] || kwMap['typescript'];

                // Tokenize line by line for safety
                var lines = escapedCode.split('\\n');
                var out = [];
                for (var li = 0; li < lines.length; li++) {
                    var line = lines[li];
                    // Check for single-line comment
                    var commentIdx = line.indexOf('//');
                    if (langKey === 'python' || langKey === 'bash' || langKey === 'sh') {
                        commentIdx = line.indexOf('#');
                    }
                    var codePart = commentIdx >= 0 ? line.substring(0, commentIdx) : line;
                    var commentPart = commentIdx >= 0 ? '<span class="hl-comment">' + line.substring(commentIdx) + '</span>' : '';

                    // Highlight strings in code part (simple: match "..." and '...')
                    codePart = codePart.replace(/(&quot;[^&]*?&quot;)/g, '<span class="hl-string">$1</span>');
                    codePart = codePart.replace(/(&#x27;[^&]*?&#x27;)/g, '<span class="hl-string">$1</span>');

                    // Highlight annotations (@Word)
                    codePart = codePart.replace(/(@[A-Za-z_][A-Za-z0-9_]*)/g, '<span class="hl-annotation">$1</span>');

                    // Highlight numbers (standalone digits)
                    codePart = codePart.replace(/(?<![A-Za-z_])([0-9]+\\.?[0-9]*)(?![A-Za-z_])/g, '<span class="hl-number">$1</span>');

                    // Highlight keywords (word boundary via split on non-word chars)
                    for (var ki = 0; ki < kws.length; ki++) {
                        var kw = kws[ki];
                        // Match whole word only using a regex with word boundaries
                        var kwRe = new RegExp('(?<![A-Za-z0-9_])(' + kw + ')(?![A-Za-z0-9_])', 'g');
                        codePart = codePart.replace(kwRe, '<span class="hl-keyword">$1</span>');
                    }

                    // Highlight types (PascalCase)
                    codePart = codePart.replace(/(?<![A-Za-z0-9_"&;])([A-Z][a-zA-Z0-9_]+)(?![A-Za-z0-9_])/g, '<span class="hl-type">$1</span>');

                    out.push(codePart + commentPart);
                }
                return out.join('\\n');
            } catch(e) {
                return escapedCode;
            }
        }

        function addMessage(role, content, showActions = false, quickActionsList = null) {
            if (!hasMessages) {
                messagesDiv.classList.remove('hidden');
                welcomeScreen.classList.add('hidden');
                hasMessages = true;
            }

            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + role;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';

            // Enhanced markdown rendering
            let processedContent = content;

            // Process code blocks with syntax highlighting
            processedContent = processedContent.replace(/\`\`\`(\\w+)?\\n([\\s\\S]*?)\`\`\`/g, function(match, lang, code) {
                var language = lang || 'text';
                var highlighted = highlightCode(escapeHtml(code.trim()), language);
                return '<pre class="code-block"><div class="code-header"><span class="code-lang">' + language + '</span><button class="code-copy-btn">Copy</button></div><code class="language-' + language + '">' + highlighted + '</code></pre>';
            });

            // Process inline code
            processedContent = processedContent.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

            // Process bold
            processedContent = processedContent.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');

            // Process lists
            processedContent = processedContent.replace(/^  • (.+)$/gm, '<div style="margin-left: 16px;">• $1</div>');

            contentDiv.innerHTML = processedContent;

            // Attach copy handlers to code block copy buttons
            contentDiv.querySelectorAll('.code-copy-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var codeEl = btn.closest('pre').querySelector('code');
                    if (codeEl) {
                        navigator.clipboard.writeText(codeEl.textContent || '');
                        btn.textContent = 'Copied!';
                        setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
                    }
                });
            });

            messageDiv.appendChild(contentDiv);

            if (showActions && role === 'assistant') {
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'message-actions';

                // Standard actions
                actionsDiv.innerHTML = '<button class="message-action-btn copy-btn">📋 Copy</button>' +
                    '<button class="message-action-btn regenerate-btn">🔄 Regenerate</button>';

                messageDiv.appendChild(actionsDiv);

                actionsDiv.querySelector('.copy-btn').addEventListener('click', () => {
                    navigator.clipboard.writeText(content);
                    showToast('✅ Copied to clipboard');
                });

                actionsDiv.querySelector('.regenerate-btn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'regenerate' });
                });

                // Quick follow-up actions - dynamic based on context
                const quickActionsDiv = document.createElement('div');
                quickActionsDiv.className = 'quick-actions';

                const actionLabels = {
                    'yes_generate': '✅ Generate',
                    'show_example': '📝 Example',
                    'explain_more': '🧠 Explain',
                    'show_related': '🔗 Related',
                    'how_to_use': '💡 How to Use',
                    'best_practices': '⭐ Best Practices',
                    'find_bugs': '🐛 Find Bugs',
                    'refactor': '♻️ Refactor',
                    'write_tests': '🧪 Write Tests',
                    'recreate_steps': '📋 Recreate Steps',
                    'add_feature': '➕ Enhance',
                    'document_it': '📄 Document'
                };

                const actions = quickActionsList || ['show_example', 'explain_more', 'how_to_use', 'best_practices'];
                let buttonsHtml = '<span class="quick-actions-label">Actions:</span>';
                actions.forEach(function(action) {
                    const label = actionLabels[action] || action;
                    buttonsHtml += '<button class="quick-action-btn" data-action="' + action + '">' + label + '</button>';
                });
                quickActionsDiv.innerHTML = buttonsHtml;
                messageDiv.appendChild(quickActionsDiv);

                // Attach event listeners to quick action buttons
                quickActionsDiv.querySelectorAll('.quick-action-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const action = btn.getAttribute('data-action');
                        vscode.postMessage({ type: 'quickAction', action: action });
                    });
                });
            }

            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function sendMessage() {
            const message = input.value.trim();
            if (!message) return;

            vscode.postMessage({
                type: 'sendMessage',
                message: message
            });

            input.value = '';
            sendButton.disabled = true;
            actionButtons.style.display = 'none';
        }

        sendButton.addEventListener('click', sendMessage);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Fix example prompts - attach click handlers
        document.querySelectorAll('.example-prompt').forEach(prompt => {
            prompt.addEventListener('click', () => {
                const promptText = prompt.getAttribute('data-prompt');
                if (promptText) {
                    input.value = promptText;
                    sendMessage();
                }
            });
        });

        // Feature Browser State
        let allFeatures = [];
        let filteredFeatures = [];
        const featureBrowserModal = document.getElementById('feature-browser-modal');
        const featureList = document.getElementById('pattern-list');
        const featureSearchInput = document.getElementById('pattern-search-input');
        const categoryFilter = document.getElementById('feature-filter');
        const languageFilter = document.getElementById('language-filter');
        const sortBy = document.getElementById('sort-by');
        const groupByFrameworkCheckbox = document.getElementById('group-by-feature');
        const featureCount = document.getElementById('pattern-count');
        const closeBrowserBtn = document.getElementById('close-browser-btn');

        // Browse Features button click handler (reusable function)
        function openFeatureBrowser() {
            console.log('Browse Features button clicked');
            console.log('Modal element:', featureBrowserModal);

            if (!featureBrowserModal) {
                console.error('Feature browser modal not found!');
                return;
            }

            vscode.postMessage({ type: 'browseFeatures' });
            featureBrowserModal.classList.add('active');
            console.log('Modal should now be visible');
        }

        // Browse button in action buttons (after messages)
        const browseFeaturesBtn = document.getElementById('browse-features-btn');
        if (browseFeaturesBtn) {
            browseFeaturesBtn.addEventListener('click', openFeatureBrowser);
        } else {
            console.error('Browse features button (action buttons) not found!');
        }

        // Browse button on welcome screen
        const welcomeBrowseBtn = document.getElementById('welcome-browse-features-btn');
        if (welcomeBrowseBtn) {
            welcomeBrowseBtn.addEventListener('click', openFeatureBrowser);
        } else {
            console.error('Browse features button (welcome screen) not found!');
        }

        if (closeBrowserBtn) {
            closeBrowserBtn.addEventListener('click', () => {
                if (featureBrowserModal) {
                    featureBrowserModal.classList.remove('active');
                }
            });
        }

        // Close modal on outside click
        if (featureBrowserModal) {
            featureBrowserModal.addEventListener('click', (e) => {
                if (e.target === featureBrowserModal) {
                    featureBrowserModal.classList.remove('active');
                }
            });
        }

        // Feature search and filter
        if (featureSearchInput) {
            featureSearchInput.addEventListener('input', () => {
                filterFeatures();
            });
        }

        if (categoryFilter) {
            categoryFilter.addEventListener('change', () => {
                filterFeatures();
            });
        }

        if (languageFilter) {
            languageFilter.addEventListener('change', () => {
                filterFeatures();
            });
        }

        if (sortBy) {
            sortBy.addEventListener('change', () => {
                sortFeatures();
            });
        }

        if (groupByFrameworkCheckbox) {
            groupByFrameworkCheckbox.addEventListener('change', () => {
                renderFeatures();
            });
        }

        /**
         * Discover unique frameworks/categories from all features
         */
        function discoverCategories() {
            const categoriesSet = new Set();

            allFeatures.forEach(feature => {
                // Add frameworks
                if (feature.metadata?.framework) {
                    categoriesSet.add(feature.metadata.framework);
                }

                // Add languages
                if (feature.metadata?.languages) {
                    feature.metadata.languages.forEach(lang => categoriesSet.add(lang));
                }

                // Add tags
                if (feature.tags && feature.tags.length > 0) {
                    feature.tags.forEach(tag => {
                        const category = tag
                            .split('-')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(' ');
                        categoriesSet.add(category);
                    });
                }
            });

            return Array.from(categoriesSet).sort();
        }

        /**
         * Populate the category filter dropdown
         */
        function populateCategoryFilter() {
            const categories = discoverCategories();

            const options = '<option value="all">All Categories</option>' +
                categories.map(cat => '<option value="' + escapeHtml(cat) + '">' + escapeHtml(cat) + '</option>').join('');

            if (categoryFilter) {
                categoryFilter.innerHTML = options;
            }
        }

        /**
         * Check if a feature matches a given category
         */
        function featureMatchesCategory(feature, category) {
            if (category === 'all') return true;

            const normalizedCategory = category.toLowerCase();

            // Check framework
            if (feature.metadata?.framework &&
                feature.metadata.framework.toLowerCase() === normalizedCategory) {
                return true;
            }

            // Check languages
            if (feature.metadata?.languages &&
                feature.metadata.languages.some(lang => lang.toLowerCase() === normalizedCategory)) {
                return true;
            }

            // Check tags
            if (feature.tags && feature.tags.some(tag => {
                const tagCategory = tag
                    .split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                return tagCategory.toLowerCase() === normalizedCategory;
            })) {
                return true;
            }

            // Check feature name
            if (feature.name.toLowerCase().includes(normalizedCategory)) {
                return true;
            }

            return false;
        }

        function filterFeatures() {
            const searchTerm = featureSearchInput ? featureSearchInput.value.toLowerCase() : '';
            const langFilter = languageFilter ? languageFilter.value : 'all';
            const catFilter = categoryFilter ? categoryFilter.value : 'all';

            filteredFeatures = allFeatures.filter(feature => {
                const matchesSearch =
                    feature.name.toLowerCase().includes(searchTerm) ||
                    (feature.description && feature.description.toLowerCase().includes(searchTerm)) ||
                    (feature.tags && feature.tags.some(tag => tag.toLowerCase().includes(searchTerm)));

                const matchesLanguage =
                    langFilter === 'all' || feature.language === langFilter ||
                    (feature.metadata?.languages && feature.metadata.languages.includes(langFilter));

                const matchesCategory = featureMatchesCategory(feature, catFilter);

                return matchesSearch && matchesLanguage && matchesCategory;
            });

            sortFeatures();
        }

        /**
         * Get the primary framework for a feature (for sorting/grouping)
         */
        function getFeatureFramework(feature) {
            if (feature.metadata?.framework) {
                return feature.metadata.framework;
            }

            if (feature.tags && feature.tags.length > 0) {
                return feature.tags[0]
                    .split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
            }

            return 'Other';
        }

        function sortFeatures() {
            const sortOption = sortBy ? sortBy.value : 'recent';

            if (sortOption === 'name') {
                filteredFeatures.sort((a, b) => a.name.localeCompare(b.name));
            } else if (sortOption === 'language') {
                filteredFeatures.sort((a, b) => a.language.localeCompare(b.language));
            } else if (sortOption === 'feature') {
                filteredFeatures.sort((a, b) => {
                    const frameworkA = getFeatureFramework(a);
                    const frameworkB = getFeatureFramework(b);
                    return frameworkA.localeCompare(frameworkB);
                });
            } else if (sortOption === 'recent') {
                filteredFeatures.sort((a, b) => {
                    const dateA = new Date(a.savedAt || 0);
                    const dateB = new Date(b.savedAt || 0);
                    return dateB - dateA;
                });
            }

            renderFeatures();
        }

        function renderFeatures() {
            console.log('renderFeatures called, count:', filteredFeatures.length);

            if (!featureList) {
                console.error('Feature list element not found');
                return;
            }

            if (filteredFeatures.length === 0) {
                featureList.innerHTML = '<div class="empty-state">' +
                    '<div class="empty-state-icon">📁</div>' +
                    '<div class="empty-state-title">No Features Found</div>' +
                    '<div class="empty-state-message">Index your workspace to discover features</div>' +
                    '</div>';
                if (featureCount) {
                    featureCount.textContent = 'No features';
                }
                return;
            }

            // Check if grouping by framework is enabled
            const shouldGroup = groupByFrameworkCheckbox ? groupByFrameworkCheckbox.checked : false;

            if (shouldGroup) {
                // Group features by framework
                const groupedFeatures = {};
                filteredFeatures.forEach(feature => {
                    const framework = getFeatureFramework(feature);
                    if (!groupedFeatures[framework]) {
                        groupedFeatures[framework] = [];
                    }
                    groupedFeatures[framework].push(feature);
                });

                const sortedFrameworks = Object.keys(groupedFeatures).sort();

                let html = '';
                sortedFrameworks.forEach(framework => {
                    const features = groupedFeatures[framework];
                    html += '<div class="feature-group">';
                    html += '<h3 class="feature-group-title">' + escapeHtml(framework) + ' <span class="feature-count">(' + features.length + ')</span></h3>';
                    html += '<div class="feature-group-patterns">';
                    html += features.map(feature => createFeatureCard(feature)).join('');
                    html += '</div>';
                    html += '</div>';
                });

                featureList.innerHTML = html;
            } else {
                featureList.innerHTML = filteredFeatures.map(feature => createFeatureCard(feature)).join('');
            }

            if (featureCount) {
                featureCount.textContent = 'Showing ' + filteredFeatures.length + ' of ' + allFeatures.length + ' features';
            }

            attachFeatureCardListeners();
            console.log('Features rendered successfully');
        }

        function createFeatureCard(feature) {
            const icon = getLanguageIcon(feature.language);
            const tagsHtml = feature.tags ? feature.tags.slice(0, 5).map(tag => '<span class="tag">' + escapeHtml(tag) + '</span>').join('') : '';
            const componentCount = feature.metadata?.componentCount || (feature.components ? feature.components.length : 0);
            const languagesHtml = feature.metadata?.languages ? feature.metadata.languages.join(', ') : feature.language;
            const frameworkHtml = feature.metadata?.framework ? '<span class="metadata-item">🔧 ' + feature.metadata.framework + '</span>' : '';

            return '<div class="pattern-card" data-feature-id="' + feature.id + '">' +
                '<div class="pattern-card-header">' +
                '<div class="pattern-title">' +
                '<span class="pattern-icon">' + icon + '</span>' +
                '<span class="pattern-name">' + escapeHtml(feature.name) + '</span>' +
                '</div>' +
                '<div class="pattern-language-badge">' + languagesHtml + '</div>' +
                '</div>' +
                '<div class="pattern-card-body">' +
                '<p class="pattern-description">' + escapeHtml(feature.description || 'No description') + '</p>' +
                '<div class="pattern-tags">' + tagsHtml + '</div>' +
                '<div class="pattern-metadata">' +
                '<span class="metadata-item">📦 ' + componentCount + ' components</span>' +
                frameworkHtml +
                '</div>' +
                '</div>' +
                '<div class="pattern-card-actions">' +
                '<button class="card-action-btn view-btn" data-action="view" data-id="' + feature.id + '">👁️ View</button>' +
                '<button class="card-action-btn explain-btn" data-action="explain" data-id="' + feature.id + '">🧠 Explain</button>' +
                '<button class="card-action-btn fix-btn" data-action="fix" data-id="' + feature.id + '">🔧 Fix</button>' +
                '<button class="card-action-btn recreate-btn" data-action="recreate" data-id="' + feature.id + '">📋 Recreate</button>' +
                '<button class="card-action-btn use-btn" data-action="use" data-id="' + feature.id + '">💬 Ask</button>' +
                '</div>' +
                '</div>';
        }

        function attachFeatureCardListeners() {
            document.querySelectorAll('.card-action-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.getAttribute('data-action');
                    const featureId = btn.getAttribute('data-id');

                    if (action === 'view') {
                        viewFeature(featureId);
                    } else if (action === 'use') {
                        useFeature(featureId);
                    } else if (action === 'explain') {
                        useFeatureWithAction(featureId, 'explain');
                    } else if (action === 'fix') {
                        useFeatureWithAction(featureId, 'fix');
                    } else if (action === 'recreate') {
                        useFeatureWithAction(featureId, 'recreate');
                    }
                });
            });
        }

        function viewFeature(featureId) {
            const feature = allFeatures.find(f => f.id === featureId);
            if (feature) {
                const componentCount = feature.metadata?.componentCount || (feature.components ? feature.components.length : 0);
                const message = '**📁 ' + feature.name + '** (' + feature.language + ')\\\\n\\\\n' +
                    feature.description + '\\\\n\\\\n' +
                    '**Components:** ' + componentCount + '\\\\n\\\\n' +
                    '\`\`\`' + feature.language + '\\\\n' + feature.code + '\\\\n\`\`\`';
                addMessage('assistant', message, false);
            }
        }

        function useFeature(featureId) {
            const feature = allFeatures.find(f => f.id === featureId);
            if (feature) {
                // Close the modal
                if (featureBrowserModal) {
                    featureBrowserModal.classList.remove('active');
                }

                // Send to backend - VS Code native input box will prompt for the question
                vscode.postMessage({
                    type: 'useFeatureAsContext',
                    feature: feature
                });
            }
        }

        function useFeatureWithAction(featureId, action) {
            const feature = allFeatures.find(f => f.id === featureId);
            if (!feature) return;

            const actionQuestions = {
                'explain': 'Explain this feature in detail — its architecture, how the components interact, data flow, and key design decisions.',
                'fix': 'Analyze this feature for potential bugs, code smells, anti-patterns, and suggest fixes with corrected code.',
                'recreate': 'Provide step-by-step instructions to recreate this feature from scratch. Include file structure, dependencies, configuration, and complete code for each component. Format as a guide that can be followed by a developer or Copilot agent.'
            };

            const question = actionQuestions[action];
            if (!question) return;

            // Close the modal
            if (featureBrowserModal) {
                featureBrowserModal.classList.remove('active');
            }

            // Send with pre-filled question
            vscode.postMessage({
                type: 'useFeatureAsContext',
                feature: feature,
                userQuestion: question
            });
        }

        function showToast(message) {
            // Create toast element
            const toast = document.createElement('div');
            toast.style.cssText = 'position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--vscode-notifications-background); color: var(--vscode-notifications-foreground); padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; font-size: 13px; font-weight: 500;';
            toast.textContent = message;
            document.body.appendChild(toast);

            // Fade out and remove
            setTimeout(() => {
                toast.style.transition = 'opacity 0.3s';
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 2000);
        }

        function deletePattern(patternId) {
            if (confirm('Are you sure you want to delete this pattern?')) {
                vscode.postMessage({ type: 'deletePattern', patternId: patternId });
            }
        }

        function getLanguageIcon(language) {
            const icons = {
                'java': '☕',
                'typescript': '📘',
                'javascript': '📜',
                'python': '🐍',
                'go': '🐹',
                'rust': '🦀',
                'proto': '📡'
            };
            return icons[language] || '📄';
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        document.getElementById('show-context-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'showContext' });
        });

        document.getElementById('save-pattern-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'savePattern' });
        });

        document.getElementById('clear-chat-btn').addEventListener('click', () => {
            if (confirm('Clear all messages?')) {
                vscode.postMessage({ type: 'clearChat' });
            }
        });

        document.getElementById('show-stats-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'showStats' });
        });

        confirmSaveBtn.addEventListener('click', () => {
            const name = patternName.value.trim();
            if (!name) {
                alert('Pattern name is required');
                return;
            }

            vscode.postMessage({
                type: 'confirmSavePattern',
                name: name,
                description: patternDescription.value.trim(),
                tags: patternTags.value.trim(),
                code: currentCode
            });
        });

        cancelSaveBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'cancelSave' });
        });

        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'addMessage':
                    addMessage(message.role, message.content, message.showActions, message.quickActions);
                    sendButton.disabled = false;
                    break;
                case 'startTyping':
                    typingDiv.style.display = 'flex';
                    break;
                case 'stopTyping':
                    typingDiv.style.display = 'none';
                    break;
                case 'showSaveButton':
                    actionButtons.style.display = 'flex';
                    break;
                case 'hideSaveButton':
                    actionButtons.style.display = 'none';
                    break;
                case 'showSaveForm':
                    currentCode = message.code;
                    const preview = message.code.length > 500
                        ? message.code.substring(0, 500) + '\\\\n\\\\n... [truncated ' + (message.code.length - 500) + ' characters]'
                        : message.code;
                    codePreview.textContent = preview;
                    patternName.value = message.suggestedName;
                    patternDescription.value = message.suggestedDescription;
                    patternTags.value = message.suggestedTags;
                    saveFormContainer.classList.add('visible');
                    actionButtons.style.display = 'none';
                    break;
                case 'hideSaveForm':
                    saveFormContainer.classList.remove('visible');
                    patternName.value = '';
                    patternDescription.value = '';
                    patternTags.value = '';
                    currentCode = '';
                    break;
                case 'clearMessages':
                    messagesDiv.innerHTML = '';
                    messagesDiv.classList.add('hidden');
                    welcomeScreen.classList.remove('hidden');
                    hasMessages = false;
                    actionButtons.style.display = 'none';
                    break;
                case 'updateStats':
                    document.getElementById('stat-patterns').textContent = message.stats.patterns;
                    document.getElementById('stat-nodes').textContent = message.stats.nodes;
                    break;
                case 'allFeatures':
                    console.log('Received features:', message.features?.length || 0);
                    allFeatures = message.features || [];
                    filteredFeatures = allFeatures;
                    populateCategoryFilter(); // Dynamically populate category dropdown
                    filterFeatures(); // Apply current filters and render
                    console.log('Features rendered, filtered count:', filteredFeatures.length);
                    break;
            }
        });
            } catch (error) {
                console.error('ERROR IN WEBVIEW SCRIPT:', error);
                console.error('Stack:', error.stack);
                alert('Error initializing OpenCat: ' + error.message);
            }
        })();
    </script>
</body>
</html>`;
    }
}
