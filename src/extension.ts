import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';

export function activate(context: vscode.ExtensionContext) {
    const provider = new ChatViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('opencat.chatView', provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('opencat.openChat', () => {
            vscode.commands.executeCommand('opencat.chatView.focus');
        })
    );
}

export function deactivate() {}