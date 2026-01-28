//
// Enhanced ChatViewProvider with modern UI
//
import * as vscode from 'vscode';
import * as path from 'path';
import { KnowledgeBaseManager } from './knowledgeBase/KnowledgeBaseManager';
import { ContextBuilder } from './knowledgeBase/ContextBuilder';
import { getConfig } from './config';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private contextBuilder: ContextBuilder;
    private lastQuery: string = '';
    private lastResponse: string = '';
    private lastEnrichedPrompt: string = '';

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
                    await this.handleBrowsePatterns();
                    break;
                case 'deletePattern':
                    await this.handleDeletePattern(data.patternId);
                    break;
                case 'regenerate':
                    if (this.lastQuery) {
                        await this.handleUserMessage(this.lastQuery);
                    }
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

    private async handleUserMessage(message: string) {
        this._view?.webview.postMessage({
            type: 'addMessage',
            role: 'user',
            content: message
        });

        try {
            this._view?.webview.postMessage({ type: 'startTyping' });

            this.lastQuery = message;
            this.lastResponse = '';

            const enrichedPrompt = await this.contextBuilder.buildContextForQuery(message);
            this.lastEnrichedPrompt = enrichedPrompt;

            const contextSummary = this.summarizeContext(enrichedPrompt);

            this._view?.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: `🔍 Found context:\n${contextSummary}\n\n🤖 Asking Copilot...`
            });

            const response = await this.callCopilot(enrichedPrompt);

            if (response) {
                this.lastResponse = response;

                this._view?.webview.postMessage({
                    type: 'addMessage',
                    role: 'assistant',
                    content: response,
                    showActions: true
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
                    content: '❌ Copilot unavailable. Make sure GitHub Copilot is installed and active.'
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

    private async callCopilot(prompt: string): Promise<string | null> {
        try {
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot'
            });

            if (models.length === 0) {
                console.log('No Copilot models available');
                return null;
            }

            const model = models[0];

            const messages = (prompt.includes('--- CONTEXT ---') || prompt.includes('You are a helpful and precise code assistant'))
                ? [vscode.LanguageModelChatMessage.User(prompt)]
                : [vscode.LanguageModelChatMessage.User(prompt)];

            const chatResponse = await model.sendRequest(
                messages,
                {},
                new vscode.CancellationTokenSource().token
            );

            let fullResponse = '';
            for await (const fragment of chatResponse.text) {
                fullResponse += fragment;
            }

            return fullResponse;

        } catch (error) {
            console.error('Failed to call Copilot:', error);
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

    private async handleBrowsePatterns() {
        const patterns = await this._kbManager.getAllPatterns();
        this._view?.webview.postMessage({
            type: 'allPatterns',
            patterns: patterns
        });
    }

    private async handleDeletePattern(patternId: string) {
        await this._kbManager.deletePattern(patternId);
        this._view?.webview.postMessage({
            type: 'addMessage',
            role: 'assistant',
            content: '✅ Pattern deleted successfully'
        });
        // Refresh the pattern list if browser is open
        await this.handleBrowsePatterns();
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
            background-color: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-panel-border);
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
            background-color: var(--vscode-input-background);
            align-self: flex-end;
            border: 1px solid var(--vscode-input-border);
            border-bottom-right-radius: 4px;
        }

        .message.assistant {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            align-self: flex-start;
            border-bottom-left-radius: 4px;
        }

        .message-content {
            white-space: pre-wrap;
            line-height: 1.6;
        }

        .message-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .message-action-btn {
            padding: 4px 8px;
            font-size: 11px;
            background-color: transparent;
            color: var(--vscode-textLink-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .message-action-btn:hover {
            background-color: var(--vscode-list-hoverBackground);
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
            background-color: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            overflow-x: auto;
            margin: 8px 0;
            position: relative;
        }

        code {
            font-family: 'Courier New', Consolas, monospace;
            font-size: 12px;
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
            gap: 10px;
            margin-top: 14px;
            padding-top: 14px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .card-action-btn {
            flex: 1;
            padding: 8px 14px;
            border: 1px solid var(--vscode-button-border);
            border-radius: 6px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        .card-action-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .card-action-btn:active {
            transform: translateY(0);
        }

        .use-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }

        .use-btn:hover {
            background: var(--vscode-button-hoverBackground);
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
            <button class="welcome-action-btn" id="welcome-browse-patterns-btn">
                📚 Browse Knowledge Base
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
        <button class="action-btn" id="browse-patterns-btn">📚 Browse Patterns</button>
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

    <!-- Pattern Browser Modal -->
    <div id="pattern-browser-modal" class="modal">
        <div class="modal-content pattern-browser">
            <div class="browser-header">
                <h2>📚 Knowledge Base Patterns</h2>
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

        function addMessage(role, content, showActions = false) {
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

            // Process code blocks
            processedContent = processedContent.replace(/\`\`\`(\\w+)?\\n([\\s\\S]*?)\`\`\`/g, (match, lang, code) => {
                return \`<pre><code class="language-\${lang || 'text'}">\${escapeHtml(code.trim())}</code></pre>\`;
            });

            // Process inline code
            processedContent = processedContent.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

            // Process bold
            processedContent = processedContent.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');

            // Process lists
            processedContent = processedContent.replace(/^  • (.+)$/gm, '<div style="margin-left: 16px;">• $1</div>');

            contentDiv.innerHTML = processedContent;
            messageDiv.appendChild(contentDiv);

            if (showActions && role === 'assistant') {
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'message-actions';
                actionsDiv.innerHTML = '<button class="message-action-btn copy-btn">📋 Copy</button>' +
                    '<button class="message-action-btn regenerate-btn">🔄 Regenerate</button>';
                messageDiv.appendChild(actionsDiv);

                actionsDiv.querySelector('.copy-btn').addEventListener('click', () => {
                    navigator.clipboard.writeText(content);
                });

                actionsDiv.querySelector('.regenerate-btn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'regenerate' });
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

        // Pattern Browser State
        let allPatterns = [];
        let filteredPatterns = [];
        const patternBrowserModal = document.getElementById('pattern-browser-modal');
        const patternList = document.getElementById('pattern-list');
        const patternSearchInput = document.getElementById('pattern-search-input');
        const featureFilter = document.getElementById('feature-filter');
        const languageFilter = document.getElementById('language-filter');
        const sortBy = document.getElementById('sort-by');
        const groupByFeatureCheckbox = document.getElementById('group-by-feature');
        const patternCount = document.getElementById('pattern-count');
        const closeBrowserBtn = document.getElementById('close-browser-btn');

        // Browse Patterns button click handler (reusable function)
        function openPatternBrowser() {
            console.log('Browse Patterns button clicked');
            console.log('Modal element:', patternBrowserModal);

            if (!patternBrowserModal) {
                console.error('Pattern browser modal not found!');
                return;
            }

            vscode.postMessage({ type: 'browsePatterns' });
            patternBrowserModal.classList.add('active');
            console.log('Modal should now be visible');
        }

        // Browse button in action buttons (after messages)
        const browsePatternsBtn = document.getElementById('browse-patterns-btn');
        if (browsePatternsBtn) {
            browsePatternsBtn.addEventListener('click', openPatternBrowser);
        } else {
            console.error('Browse patterns button (action buttons) not found!');
        }

        // Browse button on welcome screen
        const welcomeBrowseBtn = document.getElementById('welcome-browse-patterns-btn');
        if (welcomeBrowseBtn) {
            welcomeBrowseBtn.addEventListener('click', openPatternBrowser);
        } else {
            console.error('Browse patterns button (welcome screen) not found!');
        }

        if (closeBrowserBtn) {
            closeBrowserBtn.addEventListener('click', () => {
                if (patternBrowserModal) {
                    patternBrowserModal.classList.remove('active');
                }
            });
        }

        // Close modal on outside click
        if (patternBrowserModal) {
            patternBrowserModal.addEventListener('click', (e) => {
                if (e.target === patternBrowserModal) {
                    patternBrowserModal.classList.remove('active');
                }
            });
        }

        // Pattern search and filter
        if (patternSearchInput) {
            patternSearchInput.addEventListener('input', () => {
                filterPatterns();
            });
        }

        if (featureFilter) {
            featureFilter.addEventListener('change', () => {
                filterPatterns();
            });
        }

        if (languageFilter) {
            languageFilter.addEventListener('change', () => {
                filterPatterns();
            });
        }

        if (sortBy) {
            sortBy.addEventListener('change', () => {
                sortPatterns();
            });
        }

        if (groupByFeatureCheckbox) {
            groupByFeatureCheckbox.addEventListener('change', () => {
                renderPatterns();
            });
        }

        /**
         * Discover unique features from all patterns
         * Extracts features from: metadata.category, tags, and pattern names
         */
        function discoverFeatures() {
            const featuresSet = new Set();

            allPatterns.forEach(pattern => {
                // 1. Check metadata.category
                if (pattern.metadata?.category) {
                    featuresSet.add(pattern.metadata.category);
                }

                // 2. Extract features from tags
                // Common patterns: 'ag-grid', 'websocket', 'validation', 'authentication', etc.
                if (pattern.tags && pattern.tags.length > 0) {
                    pattern.tags.forEach(tag => {
                        // Add multi-word tags or compound tags as features
                        // e.g., 'ag-grid' -> 'AG Grid', 'row-styling' -> 'Row Styling'
                        const feature = tag
                            .split('-')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(' ');
                        featuresSet.add(feature);
                    });
                }

                // 3. Extract feature from pattern name (first word or key phrase)
                // e.g., "WebSocket Reconnection Logic" -> "WebSocket"
                const nameWords = pattern.name.split(' ');
                if (nameWords.length > 0) {
                    const firstWord = nameWords[0];
                    if (firstWord.length > 2) { // Avoid very short words
                        featuresSet.add(firstWord);
                    }
                }
            });

            // Sort features alphabetically
            return Array.from(featuresSet).sort();
        }

        /**
         * Populate the feature filter dropdown with discovered features
         */
        function populateFeatureFilter() {
            const features = discoverFeatures();

            // Keep "All Features" option and add discovered features
            const options = '<option value="all">All Features</option>' +
                features.map(feature => '<option value="' + escapeHtml(feature) + '">' + escapeHtml(feature) + '</option>').join('');

            featureFilter.innerHTML = options;
        }

        /**
         * Check if a pattern matches a given feature
         */
        function patternMatchesFeature(pattern, feature) {
            if (feature === 'all') return true;

            // Normalize feature for comparison
            const normalizedFeature = feature.toLowerCase();

            // Check metadata.category
            if (pattern.metadata?.category &&
                pattern.metadata.category.toLowerCase() === normalizedFeature) {
                return true;
            }

            // Check tags
            if (pattern.tags && pattern.tags.some(tag => {
                const tagFeature = tag
                    .split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                return tagFeature.toLowerCase() === normalizedFeature;
            })) {
                return true;
            }

            // Check pattern name
            if (pattern.name.toLowerCase().includes(normalizedFeature)) {
                return true;
            }

            return false;
        }

        function filterPatterns() {
            const searchTerm = patternSearchInput.value.toLowerCase();
            const langFilter = languageFilter.value;
            const featFilter = featureFilter.value;

            filteredPatterns = allPatterns.filter(pattern => {
                const matchesSearch =
                    pattern.name.toLowerCase().includes(searchTerm) ||
                    pattern.description.toLowerCase().includes(searchTerm) ||
                    (pattern.tags && pattern.tags.some(tag => tag.toLowerCase().includes(searchTerm)));

                const matchesLanguage =
                    langFilter === 'all' || pattern.language === langFilter;

                const matchesFeature = patternMatchesFeature(pattern, featFilter);

                return matchesSearch && matchesLanguage && matchesFeature;
            });

            sortPatterns();
        }

        /**
         * Get the primary feature for a pattern (for sorting/grouping)
         */
        function getPatternFeature(pattern) {
            // Priority: metadata.category > first tag > first word of name
            if (pattern.metadata?.category) {
                return pattern.metadata.category;
            }

            if (pattern.tags && pattern.tags.length > 0) {
                const firstTag = pattern.tags[0];
                return firstTag
                    .split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
            }

            const nameWords = pattern.name.split(' ');
            if (nameWords.length > 0 && nameWords[0].length > 2) {
                return nameWords[0];
            }

            return 'Other';
        }

        function sortPatterns() {
            const sortOption = sortBy.value;

            if (sortOption === 'name') {
                filteredPatterns.sort((a, b) => a.name.localeCompare(b.name));
            } else if (sortOption === 'language') {
                filteredPatterns.sort((a, b) => a.language.localeCompare(b.language));
            } else if (sortOption === 'feature') {
                filteredPatterns.sort((a, b) => {
                    const featureA = getPatternFeature(a);
                    const featureB = getPatternFeature(b);
                    return featureA.localeCompare(featureB);
                });
            } else if (sortOption === 'recent') {
                filteredPatterns.sort((a, b) => {
                    const dateA = new Date(a.savedAt || 0);
                    const dateB = new Date(b.savedAt || 0);
                    return dateB - dateA;
                });
            }

            renderPatterns();
        }

        function renderPatterns() {
            console.log('renderPatterns called, count:', filteredPatterns.length);

            if (!patternList) {
                console.error('Pattern list element not found');
                return;
            }

            if (filteredPatterns.length === 0) {
                patternList.innerHTML = '<div class="empty-state">' +
                    '<div class="empty-state-icon">📚</div>' +
                    '<div class="empty-state-title">No Patterns Found</div>' +
                    '<div class="empty-state-message">Save some patterns from chat or index your workspace</div>' +
                    '</div>';
                if (patternCount) {
                    patternCount.textContent = 'No patterns';
                }
                return;
            }

            // Check if grouping by feature is enabled
            const shouldGroupByFeature = groupByFeatureCheckbox ? groupByFeatureCheckbox.checked : false;

            if (shouldGroupByFeature) {
                // Group patterns by feature
                const groupedPatterns = {};
                filteredPatterns.forEach(pattern => {
                    const feature = getPatternFeature(pattern);
                    if (!groupedPatterns[feature]) {
                        groupedPatterns[feature] = [];
                    }
                    groupedPatterns[feature].push(pattern);
                });

                // Sort features alphabetically
                const sortedFeatures = Object.keys(groupedPatterns).sort();

                // Render grouped patterns
                let html = '';
                sortedFeatures.forEach(feature => {
                    const patterns = groupedPatterns[feature];
                    html += '<div class="feature-group">';
                    html += '<h3 class="feature-group-title">' + escapeHtml(feature) + ' <span class="feature-count">(' + patterns.length + ')</span></h3>';
                    html += '<div class="feature-group-patterns">';
                    html += patterns.map(pattern => createPatternCard(pattern)).join('');
                    html += '</div>';
                    html += '</div>';
                });

                patternList.innerHTML = html;
            } else {
                // Render flat list
                patternList.innerHTML = filteredPatterns.map(pattern => createPatternCard(pattern)).join('');
            }

            if (patternCount) {
                patternCount.textContent = 'Showing ' + filteredPatterns.length + ' of ' + allPatterns.length + ' patterns';
            }

            // Attach event listeners to pattern cards
            attachPatternCardListeners();

            console.log('Patterns rendered successfully');
        }

        function createPatternCard(pattern) {
            const icon = getLanguageIcon(pattern.language);
            const tagsHtml = pattern.tags ? pattern.tags.map(tag => '<span class="tag">' + escapeHtml(tag) + '</span>').join('') : '';
            const date = pattern.savedAt ? new Date(pattern.savedAt).toLocaleDateString() : 'Unknown';
            const frameworkHtml = pattern.metadata?.framework ? '<span class="metadata-item">🔧 ' + pattern.metadata.framework + '</span>' : '';

            return '<div class="pattern-card" data-pattern-id="' + pattern.id + '">' +
                '<div class="pattern-card-header">' +
                '<div class="pattern-title">' +
                '<span class="pattern-icon">' + icon + '</span>' +
                '<span class="pattern-name">' + escapeHtml(pattern.name) + '</span>' +
                '</div>' +
                '<div class="pattern-language-badge">' + pattern.language + '</div>' +
                '</div>' +
                '<div class="pattern-card-body">' +
                '<p class="pattern-description">' + escapeHtml(pattern.description || 'No description') + '</p>' +
                '<div class="pattern-tags">' + tagsHtml + '</div>' +
                '<div class="pattern-metadata">' +
                '<span class="metadata-item">📅 ' + date + '</span>' +
                frameworkHtml +
                '</div>' +
                '</div>' +
                '<div class="pattern-card-actions">' +
                '<button class="card-action-btn view-btn" data-action="view" data-id="' + pattern.id + '">👁️ View</button>' +
                '<button class="card-action-btn use-btn" data-action="use" data-id="' + pattern.id + '">💬 Use</button>' +
                '<button class="card-action-btn delete-btn" data-action="delete" data-id="' + pattern.id + '">🗑️</button>' +
                '</div>' +
                '</div>';
        }

        function attachPatternCardListeners() {
            document.querySelectorAll('.card-action-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.getAttribute('data-action');
                    const patternId = btn.getAttribute('data-id');

                    if (action === 'view') {
                        viewPattern(patternId);
                    } else if (action === 'use') {
                        usePattern(patternId);
                    } else if (action === 'delete') {
                        deletePattern(patternId);
                    }
                });
            });
        }

        function viewPattern(patternId) {
            const pattern = allPatterns.find(p => p.id === patternId);
            if (pattern) {
                const message = '**' + pattern.name + '** (' + pattern.language + ')\\\\n\\\\n' +
                    pattern.description + '\\\\n\\\\n\`\`\`' + pattern.language + '\\\\n' + pattern.code + '\\\\n\`\`\`';
                addMessage('assistant', message, false);
                // Keep modal open so user can view more patterns
                // patternBrowserModal.classList.remove('active');
            }
        }

        function usePattern(patternId) {
            const pattern = allPatterns.find(p => p.id === patternId);
            if (pattern) {
                input.value = 'Use the ' + pattern.name + ' pattern';
                // Show feedback
                showToast('✅ Pattern inserted into input field');
                // Keep modal open so user can continue browsing
                // patternBrowserModal.classList.remove('active');
            }
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
                    addMessage(message.role, message.content, message.showActions);
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
                case 'allPatterns':
                    console.log('Received patterns:', message.patterns?.length || 0);
                    allPatterns = message.patterns || [];
                    filteredPatterns = allPatterns;
                    populateFeatureFilter(); // Dynamically populate feature dropdown
                    filterPatterns(); // Apply current filters and render
                    console.log('Patterns rendered, filtered count:', filteredPatterns.length);
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
