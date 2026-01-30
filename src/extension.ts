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

                // Verify reset by getting stats
                const stats = await kbManager.getStats();
                const message = stats.patternCount === 0 && stats.indexedFilesCount === 0
                    ? '✅ Knowledge base has been reset successfully. You can now re-index your workspace.'
                    : `⚠️ Reset completed but some data may remain: ${stats.patternCount} patterns, ${stats.indexedFilesCount} indexed files. Please try again or restart VS Code.`;

                vscode.window.showInformationMessage(message);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('opencat.listPatterns', async () => {
            // Show features instead of individual patterns
            console.log('Browse KB: Fetching features...');

            let features;
            try {
                features = await kbManager.getAllFeatures();
                console.log(`Browse KB: Got ${features.length} features`);
            } catch (error) {
                console.error('Browse KB error:', error);
                vscode.window.showErrorMessage(`Error fetching features: ${error}`);
                return;
            }

            if (features.length === 0) {
                // Try to get feature stats to debug
                const stats = await kbManager.getFeatureStats();
                console.log('Browse KB: Feature stats:', JSON.stringify(stats));
                vscode.window.showInformationMessage('No features found. Run "OpenCat: Index Workspace" to analyze your codebase!');
                return;
            }

            // Build feature items with rich details
            const items = features.map(f => {
                const isFullStack = f.languages.includes('java') && f.languages.includes('typescript');
                const stackIcon = isFullStack ? '$(globe)' : f.languages.includes('java') ? '$(server)' : '$(browser)';
                const componentCount = f.components.length;
                const frameworks = f.frameworks.length > 0 ? f.frameworks.join(', ') : 'none';

                return {
                    label: `${stackIcon} ${f.name}`,
                    description: `${f.languages.join(' + ')} • ${componentCount} components • ${frameworks}`,
                    detail: `${f.description}`,
                    feature: f
                };
            });

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Browse ${features.length} features in your knowledge base`,
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selected) {
                const action = await vscode.window.showQuickPick([
                    { label: '$(list-tree) View Components', action: 'components' },
                    { label: '$(info) Show Feature Details', action: 'details' },
                    { label: '$(git-merge) View Data Flow', action: 'flow' }
                ], {
                    placeHolder: `What do you want to see for "${selected.feature.name}"?`
                });

                if (action?.action === 'components') {
                    // Get components for this feature
                    const components = await kbManager.getComponentsForFeature(selected.feature.id);

                    if (components.length === 0) {
                        vscode.window.showInformationMessage('No components found for this feature.');
                        return;
                    }

                    const componentItems = components.map(c => {
                        const isEntryPoint = selected.feature.entryPoints.includes(c.id);
                        const icon = isEntryPoint ? '$(rocket)' : c.type === 'service' ? '$(server)' : c.type === 'controller' ? '$(broadcast)' : '$(file-code)';
                        const relPath = vscode.workspace.asRelativePath(c.filePath);

                        return {
                            label: `${icon} ${c.name}${isEntryPoint ? ' [Entry Point]' : ''}`,
                            description: `${c.type} • ${c.language}`,
                            detail: `${relPath}:${c.startLine}`,
                            component: c
                        };
                    });

                    const selectedComponent = await vscode.window.showQuickPick(componentItems, {
                        placeHolder: `${components.length} components in "${selected.feature.name}"`
                    });

                    if (selectedComponent) {
                        // Open the file at the component's line
                        const doc = await vscode.workspace.openTextDocument(selectedComponent.component.filePath);
                        const editor = await vscode.window.showTextDocument(doc);
                        const line = selectedComponent.component.startLine - 1;
                        editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.InCenter);
                        editor.selection = new vscode.Selection(line, 0, line, 0);
                    }
                } else if (action?.action === 'details') {
                    // Show detailed feature information
                    const outputChannel = vscode.window.createOutputChannel('OpenCat Feature Details');
                    outputChannel.clear();
                    outputChannel.appendLine(`🎯 Feature: ${selected.feature.name}\n`);
                    outputChannel.appendLine('═'.repeat(60));
                    outputChannel.appendLine(`ID: ${selected.feature.id}`);
                    outputChannel.appendLine(`Description: ${selected.feature.description}`);
                    outputChannel.appendLine(`Languages: ${selected.feature.languages.join(', ')}`);
                    outputChannel.appendLine(`Frameworks: ${selected.feature.frameworks.join(', ') || 'none'}`);
                    outputChannel.appendLine(`Tags: ${selected.feature.tags.slice(0, 10).join(', ')}`);

                    outputChannel.appendLine(`\n📦 Components (${selected.feature.components.length}):`);
                    outputChannel.appendLine('─'.repeat(60));

                    const components = await kbManager.getComponentsForFeature(selected.feature.id);
                    for (const comp of components) {
                        const isEntry = selected.feature.entryPoints.includes(comp.id);
                        const entryLabel = isEntry ? ' [ENTRY POINT]' : '';
                        outputChannel.appendLine(`\n  ${comp.type.toUpperCase()}: ${comp.name}${entryLabel}`);
                        outputChannel.appendLine(`    File: ${vscode.workspace.asRelativePath(comp.filePath)}:${comp.startLine}`);
                        outputChannel.appendLine(`    Language: ${comp.language}`);
                        if (comp.annotations.length > 0) {
                            const anns = comp.annotations.filter(a => !a.startsWith('@param')).slice(0, 5);
                            if (anns.length > 0) {
                                outputChannel.appendLine(`    Annotations: ${anns.join(', ')}`);
                            }
                        }
                        if (comp.dependencies.length > 0) {
                            const deps = comp.dependencies.filter(d => d.endsWith('Service') || d.endsWith('Repository')).slice(0, 5);
                            if (deps.length > 0) {
                                outputChannel.appendLine(`    Dependencies: ${deps.join(', ')}`);
                            }
                        }
                    }

                    if (selected.feature.flow.length > 0) {
                        outputChannel.appendLine(`\n🔄 Data Flow:`);
                        outputChannel.appendLine('─'.repeat(60));
                        for (const flow of selected.feature.flow) {
                            outputChannel.appendLine(`  ${flow.description || `${flow.from} -> ${flow.to}`}`);
                        }
                    }

                    outputChannel.show();
                } else if (action?.action === 'flow') {
                    // Show data flow visualization
                    const outputChannel = vscode.window.createOutputChannel('OpenCat Data Flow');
                    outputChannel.clear();
                    outputChannel.appendLine(`🔄 Data Flow: ${selected.feature.name}\n`);
                    outputChannel.appendLine('═'.repeat(60));

                    if (selected.feature.flow.length === 0) {
                        outputChannel.appendLine('No data flow connections found for this feature.');
                    } else {
                        const components = await kbManager.getComponentsForFeature(selected.feature.id);
                        const compMap = new Map(components.map(c => [c.id, c]));

                        outputChannel.appendLine(`\nComponent Connections:\n`);
                        for (const flow of selected.feature.flow) {
                            const fromComp = compMap.get(flow.from);
                            const toComp = compMap.get(flow.to);
                            if (fromComp && toComp) {
                                const fromLang = fromComp.language === 'java' ? '[Java]' : '[TS]';
                                const toLang = toComp.language === 'java' ? '[Java]' : '[TS]';
                                outputChannel.appendLine(`  ${fromLang} ${fromComp.name} (${fromComp.type})`);
                                outputChannel.appendLine(`       │`);
                                outputChannel.appendLine(`       └──[${flow.type}]──>`);
                                outputChannel.appendLine(`              │`);
                                outputChannel.appendLine(`  ${toLang} ${toComp.name} (${toComp.type})\n`);
                            }
                        }
                    }

                    outputChannel.show();
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
