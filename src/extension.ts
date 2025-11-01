import * as vscode from 'vscode';

/**
 * Extension activation entry point
 * Called when extension is activated (on VS Code startup)
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 Codebase Assistant is now active!');

    // Register a simple command (for testing)
    const helloCommand = vscode.commands.registerCommand(
        'codebase-assistant.helloWorld',
        () => {
            vscode.window.showInformationMessage(
                '👋 Hello from Codebase Assistant!'
            );
        }
    );

    // Register the chat participant
    const chatParticipant = vscode.chat.createChatParticipant(
        'codebase',
        handleChatRequest
    );

    // Set participant metadata
    chatParticipant.iconPath = vscode.Uri.joinPath(
        context.extensionUri,
        'resources',
        'icon.png'
    );

    // Add to subscriptions for cleanup
    context.subscriptions.push(helloCommand, chatParticipant);

    console.log('✅ Codebase Assistant registered successfully');
}

/**
 * Chat request handler
 * This is called every time user sends a message to @codebase
 */
async function handleChatRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    
    // For now, just echo the message back
    stream.markdown(`**Echo:** ${request.prompt}\n\n`);
    stream.markdown(`I received your message! 🎉\n\n`);
    stream.markdown(`_(This is Story 1.1 - basic scaffolding)_`);

    return { metadata: { command: 'echo' } };
}

/**
 * Extension deactivation
 * Called when extension is deactivated
 */
export function deactivate() {
    console.log('👋 Codebase Assistant deactivated');
}
