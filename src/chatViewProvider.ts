import * as vscode from 'vscode';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

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

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.message);
                    break;
            }
        });
    }

    // src/chatViewProvider.ts

private async handleUserMessage(message: string) {
    this._view?.webview.postMessage({
        type: 'addMessage',
        role: 'user',
        content: message
    });

    try {
        this._view?.webview.postMessage({ type: 'startTyping' });

        this._view?.webview.postMessage({
            type: 'addMessage',
            role: 'assistant',
            content: '🔍 Searching knowledge base...\n📝 Preparing context...\n🚀 Sending to Copilot Chat...'
        });

        // Open Copilot Chat with the message directly
        await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
        
        await new Promise(resolve => setTimeout(resolve, 300));

        // Insert text into chat input
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: message
        });

        this._view?.webview.postMessage({
            type: 'addMessage',
            role: 'assistant',
            content: '✅ Sent to Copilot Chat! Check the chat panel →'
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

    private _getHtmlForWebview(webview: vscode.Webview) {
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
        
        .message pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 8px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
        }
        
        .message code {
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
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
            
            // Basic markdown-like code block support
            const formattedContent = content.replace(
                /\`\`\`([\\s\\S]*?)\`\`\`/g,
                '<pre><code>$1</code></pre>'
            ).replace(
                /\`([^\`]+)\`/g,
                '<code>$1</code>'
            );
            
            messageDiv.innerHTML = formattedContent;
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

        // Handle messages from extension
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

        // Welcome message
        addMessage('assistant', 'Hello! I\\'m OpenCat 🐱 Ask me anything about code!');
    </script>
</body>
</html>`;
    }
}
