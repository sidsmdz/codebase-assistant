#!/bin/bash

# Restore OpenCat to working state
cd ~/awesomeProject/codebase-assistant

# Stash any changes
git stash

# Checkout clean story-2.2 branch
git checkout story-2.1-init-kb
git branch -D story-2.2-workspace-scan 2>/dev/null
git checkout -b story-2.2-workspace-scan

# Clean and rebuild
rm -rf dist/ node_modules/.cache

# Create ContextBuilder.ts
cat > src/knowledgeBase/ContextBuilder.ts << 'EOF'
import * as vscode from 'vscode';
import { DependencyTracer } from './DependencyTracer';

export class ContextBuilder {
    
    async buildContextForQuery(userQuery: string): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return userQuery;
        }

        try {
            const tracer = new DependencyTracer();
            await tracer.buildClassMap();

            const relevantClasses = this.findRelevantClasses(tracer, userQuery);

            if (relevantClasses.length === 0) {
                return userQuery;
            }

            return this.buildEnrichedPrompt(userQuery, relevantClasses);

        } catch (error) {
            console.error('Failed to build context:', error);
            return userQuery;
        }
    }

    private findRelevantClasses(tracer: DependencyTracer, query: string): any[] {
        const relevant: any[] = [];
        const queryLower = query.toLowerCase();

        const keywords = this.extractKeywords(queryLower);

        (tracer as any).classMap.forEach((classInfo: any, className: string) => {
            if (keywords.some(k => className.toLowerCase().includes(k))) {
                relevant.push(classInfo);
                return;
            }

            const fileName = classInfo.filePath.toLowerCase();
            if (keywords.some(k => fileName.includes(k))) {
                relevant.push(classInfo);
                return;
            }

            if (keywords.includes(classInfo.type)) {
                relevant.push(classInfo);
            }
        });

        return relevant.slice(0, 3);
    }

    private extractKeywords(query: string): string[] {
        const stopWords = ['how', 'do', 'i', 'the', 'a', 'an', 'to', 'in', 'for', 'create', 'make', 'write', 'add'];
        
        const words = query
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.includes(w));

        return [...new Set(words)];
    }

    private buildEnrichedPrompt(userQuery: string, relevantClasses: any[]): string {
        let prompt = `Here is code from the current workspace for context:\n\n`;

        relevantClasses.forEach((classInfo, index) => {
            prompt += `### Context ${index + 1}: ${classInfo.className} (${classInfo.type})\n`;
            prompt += `File: ${classInfo.filePath.split('/').slice(-3).join('/')}\n`;
            
            const lines = classInfo.content.split('\n').slice(0, 30);
            prompt += `\`\`\`${classInfo.language}\n${lines.join('\n')}\n\`\`\`\n\n`;
        });

        prompt += `---\n\n`;
        prompt += `User's question: ${userQuery}\n\n`;
        prompt += `Please provide a solution that follows the patterns shown in the context above.`;

        return prompt;
    }
}
EOF

# Create DependencyTracer.ts
cat > src/knowledgeBase/DependencyTracer.ts << 'EOF'
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ClassInfo {
    filePath: string;
    className: string;
    type: 'controller' | 'service' | 'repository' | 'component' | 'config';
    language: string;
    content: string;
    dependencies: string[];
}

export class DependencyTracer {
    private classMap: Map<string, ClassInfo> = new Map();

    async buildClassMap(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace open');
        }

        const patterns = [
            '**/*.java',
            '**/*.ts',
            '**/*.tsx',
            '**/*.js',
            '**/*.jsx'
        ];

        const allFiles: vscode.Uri[] = [];
        for (const pattern of patterns) {
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolders[0], pattern),
                '**/node_modules/**',
                200
            );
            allFiles.push(...files);
        }

        for (const fileUri of allFiles) {
            try {
                const content = await fs.readFile(fileUri.fsPath, 'utf-8');
                const classInfo = this.parseFile(fileUri.fsPath, content);
                if (classInfo) {
                    this.classMap.set(classInfo.className, classInfo);
                }
            } catch (error) {
                console.error(`Failed to parse ${fileUri.fsPath}:`, error);
            }
        }

        console.log(`Built class map with ${this.classMap.size} classes`);
    }

    private parseFile(filePath: string, content: string): ClassInfo | null {
        const fileName = path.basename(filePath);
        if (fileName.includes('.test.') || 
            fileName.includes('.spec.') || 
            fileName.includes('extension.')) {
            return null;
        }

        const language = this.detectLanguage(filePath);
        const className = this.extractClassName(content, language);
        if (!className) return null;

        const type = this.detectComponentType(content, filePath);
        const dependencies = this.extractDependencies(content, language);

        return {
            filePath,
            className,
            type,
            language,
            content,
            dependencies
        };
    }

    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath);
        const langMap: { [key: string]: string } = {
            '.java': 'java',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript'
        };
        return langMap[ext] || 'unknown';
    }

    private extractClassName(content: string, language: string): string | null {
        const patterns = [
            /(?:public\s+)?class\s+(\w+)/,
            /export\s+(?:class|function)\s+(\w+)/,
            /export\s+const\s+(\w+)\s*[:=]/
        ];

        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) return match[1];
        }

        return null;
    }

    private detectComponentType(content: string, filePath: string): ClassInfo['type'] {
        const fileName = path.basename(filePath).toLowerCase();
        
        if (fileName.includes('controller') || fileName.includes('router')) {
            return 'controller';
        }
        if (fileName.includes('service')) {
            return 'service';
        }
        if (fileName.includes('repository') || fileName.includes('dao')) {
            return 'repository';
        }
        if (fileName.includes('config')) {
            return 'config';
        }

        const controllerPatterns = [
            /@RestController/,
            /@Controller/,
            /Router\(\)/
        ];

        const servicePatterns = [
            /@Service/,
            /@Injectable/
        ];

        const repositoryPatterns = [
            /@Repository/,
            /extends.*Repository/
        ];

        if (controllerPatterns.some(p => p.test(content))) return 'controller';
        if (servicePatterns.some(p => p.test(content))) return 'service';
        if (repositoryPatterns.some(p => p.test(content))) return 'repository';

        return 'component';
    }

    private extractDependencies(content: string, language: string): string[] {
        const dependencies: string[] = [];

        const constructorPatterns = [
            /@Autowired[\s\S]*?private\s+(?:final\s+)?(\w+)\s+\w+/g,
            /private\s+final\s+(\w+)\s+\w+/g,
            /constructor\s*\([^)]*?(\w+):\s*(\w+)/g
        ];

        for (const pattern of constructorPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const typeName = match[match.length - 1];
                if (typeName && typeName.length > 1) {
                    dependencies.push(typeName);
                }
            }
        }

        return [...new Set(dependencies)];
    }
}
EOF

# Update chatViewProvider.ts
cat > src/chatViewProvider.ts << 'EOF'
import * as vscode from 'vscode';
import { KnowledgeBaseManager } from './knowledgeBase/KnowledgeBaseManager';
import { ContextBuilder } from './knowledgeBase/ContextBuilder';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private contextBuilder: ContextBuilder;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _kbManager: KnowledgeBaseManager
    ) {
        this.contextBuilder = new ContextBuilder();
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

            const enrichedPrompt = await this.contextBuilder.buildContextForQuery(message);
            
            this._view?.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: `🔍 Analyzed workspace code...\n📝 Added relevant context...\n🚀 Sending to Copilot Chat...`
            });

            await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
            await new Promise(resolve => setTimeout(resolve, 300));

            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: enrichedPrompt
            });

            this._view?.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: '✅ Sent to Copilot Chat with workspace context!'
            });

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
        }

        sendButton.addEventListener('click', sendMessage);
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
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
            }
        });

        addMessage('assistant', 'Hello! I\\'m OpenCat 🐱 Ask me anything about your code!');
    </script>
</body>
</html>`;
    }
}
EOF

# Update extension.ts
cat > src/extension.ts << 'EOF'
import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';
import { KnowledgeBaseManager } from './knowledgeBase/KnowledgeBaseManager';

let kbManager: KnowledgeBaseManager;

export async function activate(context: vscode.ExtensionContext) {
    console.log('OpenCat extension activating...');

    kbManager = new KnowledgeBaseManager(context);
    await kbManager.initialize();

    const provider = new ChatViewProvider(context.extensionUri, kbManager);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('opencat.chatView', provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('opencat.openChat', () => {
            vscode.commands.executeCommand('opencat.chatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('opencat.showKBStats', async () => {
            const stats = await kbManager.getStats();
            vscode.window.showInformationMessage(
                `OpenCat Knowledge Base\n` +
                `Features: ${stats.featureCount}\n` +
                `Path: ${stats.path}`
            );
        })
    );

    console.log('OpenCat activated successfully');
}

export function deactivate() {}

export function getKBManager(): KnowledgeBaseManager {
    return kbManager;
}
EOF

# Update KnowledgeBaseManager.ts
cat > src/knowledgeBase/KnowledgeBaseManager.ts << 'EOF'
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface KBMetadata {
    version: string;
    createdAt: string;
    lastUpdated: string;
    featureCount: number;
}

export class KnowledgeBaseManager {
    private kbPath: string;
    private indexPath: string;

    constructor(private context: vscode.ExtensionContext) {
        this.kbPath = context.globalStorageUri.fsPath;
        this.indexPath = path.join(this.kbPath, 'index.json');
    }

    async initialize(): Promise<void> {
        try {
            await fs.mkdir(this.kbPath, { recursive: true });

            try {
                await fs.access(this.indexPath);
                console.log('Knowledge base already initialized');
            } catch {
                const initialMetadata: KBMetadata = {
                    version: '1.0.0',
                    createdAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    featureCount: 0
                };
                await this.saveMetadata(initialMetadata);
                console.log('Knowledge base initialized at:', this.kbPath);
            }

            vscode.window.showInformationMessage(`OpenCat KB ready`);
        } catch (error) {
            console.error('Failed to initialize KB:', error);
            throw error;
        }
    }

    async getMetadata(): Promise<KBMetadata> {
        const data = await fs.readFile(this.indexPath, 'utf-8');
        return JSON.parse(data);
    }

    private async saveMetadata(metadata: KBMetadata): Promise<void> {
        await fs.writeFile(this.indexPath, JSON.stringify(metadata, null, 2), 'utf-8');
    }

    getKBPath(): string {
        return this.kbPath;
    }

    async getStats(): Promise<{ featureCount: number; path: string }> {
        const metadata = await this.getMetadata();
        
        return {
            featureCount: metadata.featureCount,
            path: this.kbPath
        };
    }
}
EOF

# Rebuild
npm run compile

echo "✅ Code restored and compiled successfully!"
echo ""
echo "Next steps:"
echo "1. Press F5 to debug"
echo "2. Open banking-system-demo folder"
echo "3. Type in OpenCat: 'create a new REST endpoint for payments'"
echo "4. Check Copilot Chat for enriched prompt with context"
