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
                `Patterns: ${stats.patternCount}\n` +
                `Path: ${stats.path}`
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('opencat.listPatterns', async () => {
            const patterns = await kbManager.getAllPatterns();
            
            if (patterns.length === 0) {
                vscode.window.showInformationMessage('No patterns saved yet. Generate code with OpenCat and save patterns!');
                return;
            }

            const items = patterns.map(p => ({
                label: `${p.name}`,
                description: `${p.language} • ${p.type}`,
                detail: p.description,
                pattern: p
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a pattern to view or delete'
            });

            if (selected) {
                const action = await vscode.window.showQuickPick([
                    { label: '👁️  View Code', action: 'view' },
                    { label: '🗑️  Delete', action: 'delete' }
                ], {
                    placeHolder: `What do you want to do with "${selected.label}"?`
                });

                if (action?.action === 'view') {
                    const doc = await vscode.workspace.openTextDocument({
                        content: selected.pattern.code,
                        language: selected.pattern.language
                    });
                    await vscode.window.showTextDocument(doc);
                } else if (action?.action === 'delete') {
                    const confirm = await vscode.window.showWarningMessage(
                        `Delete pattern "${selected.label}"?`,
                        'Delete', 'Cancel'
                    );
                    if (confirm === 'Delete') {
                        await kbManager.deletePattern(selected.pattern.id);
                        vscode.window.showInformationMessage(`Deleted pattern "${selected.label}"`);
                    }
                }
            }
        })
    );

    console.log('OpenCat activated successfully');
}

export function deactivate() {}

export function getKBManager(): KnowledgeBaseManager {
    return kbManager;
}