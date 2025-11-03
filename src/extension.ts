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
