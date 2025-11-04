#!/bin/bash

# Update OpenCat with transparency features
cd ~/awesomeProject/codebase-assistant

echo "Updating chatViewProvider.ts with full transparency..."

cat > src/chatViewProvider.ts << 'EOF'
import * as vscode from 'vscode';
import { KnowledgeBaseManager } from './knowledgeBase/KnowledgeBaseManager';
import { ContextBuilder } from './knowledgeBase/ContextBuilder';

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
                case 'showContext':
                    await this.handleShowContext();
                    break;
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

            // Build context
            const enrichedPrompt = await this.contextBuilder.buildContextForQuery(message);
            this.lastEnrichedPrompt = enrichedPrompt;
            
            // Show what context we're sending (transparency!)
            const contextSummary = this.summarizeContext(enrichedPrompt);
            this._view?.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: `🔍 Found context:\n${contextSummary}\n\n🤖 Asking Copilot...`
            });

            // Call Copilot directly and capture response
            const response = await this.callCopilot(enrichedPrompt);
            
            if (response) {
                this.lastResponse = response;
                
                // Show response in OpenCat
                this._view?.webview.postMessage({
                    type: 'addMessage',
                    role: 'assistant',
                    content: response
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
        const lines = enrichedPrompt.split('\n');
        const summary: string[] = [];
        
        // Check for saved patterns
        if (enrichedPrompt.includes('Saved patterns from Knowledge Base:')) {
            const patternSection = enrichedPrompt.split('Current workspace code:')[0];
            const patternMatches = patternSection.match(/\*\*(.+?)\*\* \((\w+)\):/g);
            if (patternMatches && patternMatches.length > 0) {
                summary.push('📚 From Knowledge Base:');
                patternMatches.forEach(match => {
                    const parts = match.match(/\*\*(.+?)\*\* \((\w+)\):/);
                    if (parts) {
                        summary.push(`  • ${parts[1]} (${parts[2]})`);
                    }
                });
            }
        }
        
        // Check for workspace patterns
        if (enrichedPrompt.includes('workspace')) {
            const workspaceSection = enrichedPrompt.includes('Current workspace code:') 
                ? enrichedPrompt.split('Current workspace code:')[1]
                : enrichedPrompt;
            const workspaceMatches = workspaceSection.match(/\*\*(\w+)\*\* \((\w+)\):/g);
            if (workspaceMatches && workspaceMatches.length > 0) {
                summary.push('💻 From Workspace:');
                workspaceMatches.slice(0, 3).forEach(match => {
                    const parts = match.match(/\*\*(\w+)\*\* \((\w+)\):/);
                    if (parts) {
                        summary.push(`  • ${parts[1]} (${parts[2]})`);
                    }
                });
            }
        }
        
        if (summary.length === 0) {
            return '  • No patterns found\n  • Asking Copilot directly';
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
            
            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

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

    private async handleSavePattern() {
        if (!this.lastResponse || this.lastResponse.length === 0) {
            vscode.window.showErrorMessage('No response to save. Ask a question first.');
            return;
        }

        const codeBlocks = this.extractCodeBlocks(this.lastResponse);
        
        if (codeBlocks.length === 0) {
            vscode.window.showErrorMessage('No code found in the response.');
            return;
        }

        let code = '';
        if (codeBlocks.length > 1) {
            const items = codeBlocks.map((block, i) => ({
                label: `Code Block ${i + 1}`,
                description: `${block.length} characters`,
                detail: block.substring(0, 100) + '...',
                code: block
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Multiple code blocks found. Select one:'
            });

            if (!selected) return;
            code = selected.code;
        } else {
            code = codeBlocks[0];
        }

        const language = this.detectLanguage(code);
        const previewDoc = await vscode.workspace.openTextDocument({
            content: code,
            language: language
        });
        await vscode.window.showTextDocument(previewDoc, { 
            preview: true, 
            viewColumn: vscode.ViewColumn.Beside 
        });

        const confirm = await vscode.window.showQuickPick(
            [
                { label: '✅ Save this pattern', value: 'yes' },
                { label: '❌ Cancel', value: 'no' }
            ],
            { placeHolder: 'Save this code as a pattern?' }
        );

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

        if (confirm?.value !== 'yes') return;

        const name = await vscode.window.showInputBox({
            prompt: 'Pattern name',
            value: this.suggestPatternName(code, this.lastQuery)
        });

        if (!name) return;

        const description = await vscode.window.showInputBox({
            prompt: 'Description (optional)',
            value: this.lastQuery
        });

        const tags = await vscode.window.showInputBox({
            prompt: 'Tags (comma-separated)',
            value: this.suggestTags(code, this.lastQuery)
        });

        const type = this.detectType(name + ' ' + description + ' ' + code);

        try {
            await this._kbManager.savePattern({
                name,
                language,
                type,
                code: code.trim(),
                description: description || this.lastQuery,
                query: this.lastQuery,
                tags: tags ? tags.split(',').map(t => t.trim()) : []
            });

            vscode.window.showInformationMessage(`✅ Pattern "${name}" saved!`);
            
            this._view?.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: `✅ Pattern "${name}" saved to Knowledge Base!`
            });

            this._view?.webview.postMessage({
                type: 'hideSaveButton'
            });

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save: ${error}`);
        }
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
        const tags = [];
        
        if (code.includes('@Controller') || code.includes('Controller')) tags.push('controller');
        if (code.includes('@Service') || code.includes('Service')) tags.push('service');
        if (code.includes('@Repository') || code.includes('Repository')) tags.push('repository');
        if (code.includes('@RestController')) tags.push('rest');
        if (code.includes('grpc')) tags.push('grpc');
        
        const queryWords = query.toLowerCase().split(' ').filter(w => 
            w.length > 3 && !['create', 'make', 'build', 'write'].includes(w)
        );
        tags.push(...queryWords.slice(0, 2));
        
        return [...new Set(tags)].join(', ');
    }

    private detectLanguage(code: string): string {
        if (code.includes('package ') || code.includes('@RestController') || code.includes('public class')) return 'java';
        if (code.includes('export class') || code.includes('@Injectable')) return 'typescript';
        if (code.includes('def ') || code.includes('import ')) return 'python';
        if (code.includes('func ') || code.includes('package main')) return 'go';
        return 'java';
    }

    private detectType(text: string): 'controller' | 'service' | 'repository' | 'component' {
        const lower = text.toLowerCase();
        if (lower.includes('controller')) return 'controller';
        if (lower.includes('service')) return 'service';
        if (lower.includes('repository')) return 'repository';
        return 'component';
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenCat</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        #messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .message {
            padding: 12px;
            border-radius: 6px;
            max-width: 85%;
            word-wrap: break-word;
            white-space: pre-wrap;
        }
        
        .message.user {
            background-color: var(--vscode-input-background);
            align-self: flex-end;
            border: 1px solid var(--vscode-input-border);
        }
        
        .message.assistant {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            align-self: flex-start;
        }
        
        #typing {
            padding: 12px;
            font-style: italic;
            color: var(--vscode-descriptionForeground);
            display: none;
        }

        #save-button-container {
            padding: 8px 16px;
            text-align: center;
            display: none;
            gap: 8px;
            flex-direction: row;
            justify-content: center;
        }

        #show-context-btn, #save-pattern-btn {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
        }

        #show-context-btn:hover, #save-pattern-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        #input-area {
            padding: 16px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 8px;
        }
        
        #message-input {
            flex: 1;
            padding: 8px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: 14px;
            resize: none;
        }
        
        #message-input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        
        #send-button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
        }
        
        #send-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        #send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div id="messages"></div>
    <div id="typing">OpenCat is thinking...</div>
    <div id="save-button-container">
        <button id="show-context-btn">🔍 Show Full Context</button>
        <button id="save-pattern-btn">💾 Save Pattern</button>
    </div>
    <div id="input-area">
        <textarea 
            id="message-input" 
            rows="3" 
            placeholder="Ask OpenCat anything..."
        ></textarea>
        <button id="send-button">Send</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const typingDiv = document.getElementById('typing');
        const input = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');
        const saveButtonContainer = document.getElementById('save-button-container');
        const showContextBtn = document.getElementById('show-context-btn');
        const savePatternBtn = document.getElementById('save-pattern-btn');

        function addMessage(role, content) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + role;
            messageDiv.textContent = content;
            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
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
            saveButtonContainer.style.display = 'none';
        }

        sendButton.addEventListener('click', sendMessage);
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        showContextBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'showContext' });
        });

        savePatternBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'savePattern' });
        });

        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'addMessage':
                    addMessage(message.role, message.content);
                    sendButton.disabled = false;
                    break;
                case 'startTyping':
                    typingDiv.style.display = 'block';
                    break;
                case 'stopTyping':
                    typingDiv.style.display = 'none';
                    break;
                case 'showSaveButton':
                    saveButtonContainer.style.display = 'flex';
                    break;
                case 'hideSaveButton':
                    saveButtonContainer.style.display = 'none';
                    break;
            }
        });

        addMessage('assistant', 'Hello! I\\'m OpenCat 🐱 Ask me anything!');
    </script>
</body>
</html>`;
    }
}
EOF

echo "✅ chatViewProvider.ts updated"

# Compile
npm run compile

echo ""
echo "✅ All updates complete!"
echo ""
echo "Test the new features:"
echo "1. Press F5 to debug"
echo "2. Ask: 'create order controller'"
echo "3. See context summary (KB + Workspace)"
echo "4. Click '🔍 Show Full Context' to see exact prompt"
echo "5. Click '💾 Save Pattern' if code is good"
echo ""
echo "Full transparency enabled!"
