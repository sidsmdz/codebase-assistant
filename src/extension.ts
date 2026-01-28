import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';
import { KnowledgeBaseManager } from './knowledgeBase/KnowledgeBaseManager';
import { IngestionService } from './ingestionService';

let kbManager: KnowledgeBaseManager;

export async function activate(context: vscode.ExtensionContext) {
    console.log('OpenCat extension activating...');

    kbManager = new KnowledgeBaseManager(context);
    await kbManager.initialize();

    const provider = new ChatViewProvider(context.extensionUri, kbManager);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('opencat.chatViewV2', provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('opencat.openChat', () => {
            vscode.commands.executeCommand('opencat.chatViewV2.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('opencat.ingestWorkspace', async () => {
            const ingestService = new IngestionService(kbManager);
            await ingestService.runIngestion();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('opencat.showKBStats', async () => {
            const detailedStats = await kbManager.getDetailedStats();

            // Build detailed stats message
            let message = `📊 OpenCat Knowledge Base Statistics\n\n`;
            message += `📦 Total Patterns: ${detailedStats.totalPatterns}\n`;
            message += `🌳 AST Nodes: ${detailedStats.totalASTNodes}\n`;
            message += `📝 Indexed Terms: ${detailedStats.totalTerms}\n`;
            message += `📁 Indexed Files: ${detailedStats.indexedFiles}\n\n`;

            // Languages breakdown
            if (Object.keys(detailedStats.patternsByLanguage).length > 0) {
                message += `💻 By Language:\n`;
                Object.entries(detailedStats.patternsByLanguage)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([lang, count]) => {
                        message += `   • ${lang}: ${count}\n`;
                    });
                message += `\n`;
            }

            // Node types breakdown
            if (Object.keys(detailedStats.patternsByType).length > 0) {
                message += `🔍 By Type:\n`;
                Object.entries(detailedStats.patternsByType)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([type, count]) => {
                        message += `   • ${type}: ${count}\n`;
                    });
                message += `\n`;
            }

            // Frameworks breakdown
            if (Object.keys(detailedStats.patternsByFramework).length > 0) {
                message += `🛠️  By Framework:\n`;
                Object.entries(detailedStats.patternsByFramework)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([fw, count]) => {
                        message += `   • ${fw}: ${count}\n`;
                    });
                message += `\n`;
            }

            // Top tags
            if (detailedStats.topTags.length > 0) {
                message += `🏷️  Top Tags:\n`;
                detailedStats.topTags.forEach(({ tag, count }) => {
                    message += `   • ${tag}: ${count}\n`;
                });
            }

            // Create output channel to show stats
            const outputChannel = vscode.window.createOutputChannel('OpenCat Knowledge Base');
            outputChannel.clear();
            outputChannel.appendLine(message);
            outputChannel.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('opencat.resetKnowledgeBase', async () => {
            const confirm = await vscode.window.showWarningMessage(
                '⚠️ This will delete ALL patterns and indexed data from the knowledge base. This cannot be undone!',
                { modal: true },
                'Reset Knowledge Base',
                'Cancel'
            );

            if (confirm === 'Reset Knowledge Base') {
                await kbManager.clearAllData();
                vscode.window.showInformationMessage('✅ Knowledge base has been reset. You can now re-index your workspace.');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('opencat.listPatterns', async () => {
            const patterns = await kbManager.getAllPatterns();

            if (patterns.length === 0) {
                vscode.window.showInformationMessage('No patterns saved. Run "OpenCat: Index Workspace" to get started!');
                return;
            }

            // Enhanced items with more details
            const items = patterns.map(p => {
                const framework = p.metadata?.framework || 'none';
                const category = p.metadata?.category || 'general';
                const filePath = p.metadata?.filePath;
                const relPath = filePath ? vscode.workspace.asRelativePath(filePath) : 'unknown';

                return {
                    label: `$(symbol-${p.tags.includes('class') ? 'class' : p.tags.includes('method') ? 'method' : 'function'}) ${p.name}`,
                    description: `${p.language} • ${framework} • ${category}`,
                    detail: `📁 ${relPath} • 🏷️  ${p.tags.slice(0, 5).join(', ')}`,
                    pattern: p
                };
            });

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Select from ${patterns.length} patterns`,
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selected) {
                const action = await vscode.window.showQuickPick([
                    { label: '$(eye) View Code', action: 'view' },
                    { label: '$(info) Show Details', action: 'details' },
                    { label: '$(go-to-file) Open File', action: 'open' },
                    { label: '$(trash) Delete', action: 'delete' }
                ], {
                    placeHolder: `What do you want to do with "${selected.pattern.name}"?`
                });

                if (action?.action === 'view') {
                    const doc = await vscode.workspace.openTextDocument({
                        content: selected.pattern.code,
                        language: selected.pattern.language
                    });
                    await vscode.window.showTextDocument(doc);
                } else if (action?.action === 'details') {
                    // Show detailed information in output channel
                    const outputChannel = vscode.window.createOutputChannel('OpenCat Pattern Details');
                    outputChannel.clear();
                    outputChannel.appendLine(`📋 Pattern Details: ${selected.pattern.name}\n`);
                    outputChannel.appendLine(`ID: ${selected.pattern.id}`);
                    outputChannel.appendLine(`Language: ${selected.pattern.language}`);
                    outputChannel.appendLine(`Description: ${selected.pattern.description}`);
                    outputChannel.appendLine(`Saved At: ${selected.pattern.savedAt}`);
                    outputChannel.appendLine(`\n📁 File Information:`);
                    outputChannel.appendLine(`   Path: ${selected.pattern.metadata?.filePath || 'N/A'}`);
                    outputChannel.appendLine(`   Framework: ${selected.pattern.metadata?.framework || 'N/A'}`);
                    outputChannel.appendLine(`   Category: ${selected.pattern.metadata?.category || 'N/A'}`);
                    outputChannel.appendLine(`\n🏷️  Tags (${selected.pattern.tags.length}):`);
                    selected.pattern.tags.forEach(tag => outputChannel.appendLine(`   • ${tag}`));
                    outputChannel.appendLine(`\n💻 Code Preview:`);
                    outputChannel.appendLine('─'.repeat(80));
                    outputChannel.appendLine(selected.pattern.code.split('\n').slice(0, 30).join('\n'));
                    if (selected.pattern.code.split('\n').length > 30) {
                        outputChannel.appendLine('\n... (truncated)');
                    }
                    outputChannel.show();
                } else if (action?.action === 'open') {
                    const filePath = selected.pattern.metadata?.filePath;
                    if (filePath) {
                        const doc = await vscode.workspace.openTextDocument(filePath);
                        await vscode.window.showTextDocument(doc);
                    } else {
                        vscode.window.showWarningMessage('File path not available for this pattern');
                    }
                } else if (action?.action === 'delete') {
                    const confirm = await vscode.window.showWarningMessage(
                        `Delete pattern "${selected.pattern.name}"?`,
                        'Delete', 'Cancel'
                    );
                    if (confirm === 'Delete') {
                        await kbManager.deletePattern(selected.pattern.id);
                        vscode.window.showInformationMessage(`Deleted pattern "${selected.pattern.name}"`);
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
