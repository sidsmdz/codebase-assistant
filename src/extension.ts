import * as vscode from 'vscode';
import { KnowledgeBaseManager } from './knowledgeBase/KnowledgeBaseManager';
import { IngestionService } from './ingestionService';
import { registerChatParticipant } from './chatParticipant/index'; // V2 simplified version
import { KBTreeProvider } from './kbTreeProvider';
import { SessionManagerV2 } from './session/SessionManagerV2';
import { SessionTreeProvider } from './sessionTreeProvider';
import { ContextProvider } from './chatParticipant/ContextProvider';
import { TreeSitterWasmManager } from './parsers/TreeSitterWasmManager';
import { LSPProvider } from './indexing/LSPProvider';
import { FeatureGraphProvider } from './tools/FeatureGraphProvider';

let kbManager: KnowledgeBaseManager;
let sessionManager: SessionManagerV2;
let contextProvider: ContextProvider;
let featureGraphProvider: FeatureGraphProvider;

export async function activate(context: vscode.ExtensionContext) {
    console.log('AutoForge extension activating...');

    // Store extension context globally for access in chat participant
    (global as any).autoforgeExtensionContext = context;

    console.log('Initializing Knowledge Base Manager...');
    kbManager = new KnowledgeBaseManager(context);
    await kbManager.initialize();
    console.log('Knowledge Base Manager initialized');

    console.log('Initializing Session Manager V2...');
    sessionManager = new SessionManagerV2(context, kbManager);
    await sessionManager.initialize();
    console.log('Session Manager V2 initialized');

    console.log('Initializing Context Provider...');
    const treeSitter = new TreeSitterWasmManager(context.extensionPath);
    await treeSitter.initialize();
    await treeSitter.loadLanguages();
    const lspProvider = new LSPProvider();
    contextProvider = new ContextProvider(treeSitter, lspProvider);
    console.log('Context Provider initialized');

    console.log('Initializing Feature Graph Provider (Decision Engine)...');
    featureGraphProvider = new FeatureGraphProvider(treeSitter, lspProvider, kbManager);
    console.log('Feature Graph Provider initialized');

    // ==================== LANGUAGE MODEL TOOLS REGISTRATION ====================
    // These tools allow @workspace to query AutoForge autonomously
    
    console.log('Registering Language Model Tools...');
    
    // TOOL 1: Analyze Impact
    // When to use: Before modifying/refactoring/deleting any symbol
    context.subscriptions.push(
        vscode.lm.registerTool('autoforge_analyzeImpact', {
            async invoke(options, token) {
                let { symbolName } = options.input as { symbolName: string };
                
                // Defensive parsing: Extract just the class/function name
                // Handle cases like "refactor PermissionService" or "the PermissionService class"
                const words = symbolName.trim().split(/\s+/);
                for (const word of words) {
                    // Look for a word that starts with uppercase (likely a class name)
                    if (/^[A-Z][a-zA-Z0-9_]*$/.test(word)) {
                        symbolName = word;
                        break;
                    }
                }
                
                console.log(`[AutoForge Tool] analyzeImpact called with raw: "${options.input}", parsed: "${symbolName}"`);
                
                try {
                    const impact = await featureGraphProvider.analyzeImpact(symbolName);
                    
                    // Format as structured JSON for LLM
                    const result = {
                        summary: `${impact.symbolName} (${impact.symbolType}) has ${impact.affectedFiles} references across ${impact.affectedLanguages.join(', ')}`,
                        riskScore: impact.riskScore,
                        recommendation: impact.recommendation,
                        details: {
                            location: impact.location,
                            structure: impact.structure,
                            references: impact.references.length,
                            crossLanguageLinks: impact.crossLanguageLinks.length
                        },
                        fullAnalysis: impact
                    };
                    
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
                    ]);
                } catch (error: any) {
                    console.error(`[AutoForge Tool] Error in analyzeImpact:`, error);
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(JSON.stringify({
                            error: error.message,
                            symbolName
                        }))
                    ]);
                }
            },
            
            async prepareInvocation(options, token) {
                const { symbolName } = options.input as { symbolName: string };
                return {
                    invocationMessage: `🔍 AutoForge is analyzing impact of: ${symbolName}...`
                };
            }
        })
    );
    
    // TOOL 2: Find Feature
    // When to use: User asks about features in natural language
    context.subscriptions.push(
        vscode.lm.registerTool('autoforge_findFeature', {
            async invoke(options, token) {
                const { featureQuery } = options.input as { featureQuery: string };
                
                console.log(`[AutoForge Tool] findFeature called for: ${featureQuery}`);
                
                try {
                    const feature = await featureGraphProvider.findFeature(featureQuery);
                    
                    const result = {
                        summary: `Found feature: ${feature.featureName} (confidence: ${(feature.confidence * 100).toFixed(0)}%)`,
                        entryPoints: feature.entryPoints,
                        keywords: feature.keywords,
                        relatedSymbols: feature.relatedSymbols,
                        confidence: feature.confidence,
                        fullGraph: feature
                    };
                    
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
                    ]);
                } catch (error: any) {
                    console.error(`[AutoForge Tool] Error in findFeature:`, error);
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(JSON.stringify({
                            error: error.message,
                            query: featureQuery
                        }))
                    ]);
                }
            },
            
            async prepareInvocation(options, token) {
                const { featureQuery } = options.input as { featureQuery: string };
                return {
                    invocationMessage: `🎯 AutoForge is finding feature: "${featureQuery}"...`
                };
            }
        })
    );
    
    // TOOL 3: Validate Refactor
    // When to use: BEFORE any refactoring operation (Check-Before-Act)
    context.subscriptions.push(
        vscode.lm.registerTool('autoforge_validateRefactor', {
            async invoke(options, token) {
                const { symbolName, proposedChange } = options.input as { 
                    symbolName: string; 
                    proposedChange: string;
                };
                
                console.log(`[AutoForge Tool] validateRefactor called for: ${symbolName} -> ${proposedChange}`);
                
                try {
                    const validation = await featureGraphProvider.validateRefactor(symbolName, proposedChange);
                    
                    const result = {
                        canProceed: validation.canProceed,
                        summary: validation.canProceed 
                            ? `✅ Safe to proceed (${validation.strategy.approach})` 
                            : `⛔ Blocked: ${validation.blockers.join(', ')}`,
                        blockers: validation.blockers,
                        warnings: validation.warnings,
                        affectedFiles: validation.affectedFiles.length,
                        strategy: validation.strategy,
                        fullValidation: validation
                    };
                    
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
                    ]);
                } catch (error: any) {
                    console.error(`[AutoForge Tool] Error in validateRefactor:`, error);
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(JSON.stringify({
                            error: error.message,
                            symbolName,
                            proposedChange
                        }))
                    ]);
                }
            },
            
            async prepareInvocation(options, token) {
                const { symbolName, proposedChange } = options.input as { 
                    symbolName: string; 
                    proposedChange: string;
                };
                return {
                    invocationMessage: `⚖️ AutoForge is validating refactor: ${symbolName} (${proposedChange})...`
                };
            }
        })
    );
    
    console.log('Language Model Tools registered');
    // ==================== END TOOLS REGISTRATION ====================

    // Sidebar tree view for KB browsing
    const treeProvider = new KBTreeProvider(kbManager);
    const treeView = vscode.window.createTreeView('autoforge.kbExplorer', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    // Sidebar tree view for Sessions
    const sessionTreeProvider = new SessionTreeProvider(sessionManager);
    const sessionTreeView = vscode.window.createTreeView('autoforge.sessionsExplorer', {
        treeDataProvider: sessionTreeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(sessionTreeView);

    console.log('Registering chat participant...');
    // Chat participant (@autoforge in Copilot Chat)
    const participant = registerChatParticipant(context, kbManager, sessionManager, contextProvider, () => {
        treeProvider.refresh();
        sessionTreeProvider.refresh();
    });
    context.subscriptions.push(participant);
    console.log('Chat participant registered');
    
    // Store participant reference for command access
    context.workspaceState.update('autoforge.participant', participant);

    // Command: Index workspace
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.ingestWorkspace', async () => {
            const ingestService = new IngestionService(kbManager);
            await ingestService.runIngestion();
            treeProvider.refresh();
        })
    );

    // Command: Show KB stats (output channel)
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.showKBStats', async () => {
            const detailedStats = await kbManager.getDetailedStats();

            let message = `AutoForge Knowledge Base Statistics\n\n`;
            message += `Features: ${detailedStats.totalFeatures}\n`;
            message += `Components: ${detailedStats.totalComponents}\n`;
            message += `Data Flows: ${detailedStats.totalDataFlows}\n`;
            message += `Indexed Files: ${detailedStats.indexedFiles}\n`;
            message += `Indexed Terms: ${detailedStats.totalTerms}\n`;

            if (detailedStats.totalPatterns > 0) {
                message += `Saved Patterns: ${detailedStats.totalPatterns}\n`;
            }
            if (detailedStats.totalASTNodes > 0) {
                message += `AST Nodes: ${detailedStats.totalASTNodes}\n`;
            }
            message += `\n`;

            if (Object.keys(detailedStats.featuresByLanguage).length > 0) {
                message += `Features by Language:\n`;
                Object.entries(detailedStats.featuresByLanguage)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([lang, count]) => {
                        message += `   ${lang}: ${count}\n`;
                    });
                message += `\n`;
            }

            if (Object.keys(detailedStats.componentsByType).length > 0) {
                message += `Components by Type:\n`;
                Object.entries(detailedStats.componentsByType)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([type, count]) => {
                        message += `   ${type}: ${count}\n`;
                    });
                message += `\n`;
            }

            if (Object.keys(detailedStats.featuresByFramework).length > 0) {
                message += `Frameworks Detected:\n`;
                Object.entries(detailedStats.featuresByFramework)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([fw, count]) => {
                        message += `   ${fw}: ${count} features\n`;
                    });
                message += `\n`;
            }

            if (detailedStats.topTags.length > 0) {
                message += `Top Tags:\n`;
                detailedStats.topTags.forEach(({ tag, count }) => {
                    message += `   ${tag}: ${count}\n`;
                });
            }

            const outputChannel = vscode.window.createOutputChannel('AutoForge Knowledge Base');
            outputChannel.clear();
            outputChannel.appendLine(message);
            outputChannel.show();
        })
    );

    // Command: Reset knowledge base
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.resetKnowledgeBase', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'This will delete ALL patterns and indexed data from the knowledge base. This cannot be undone!',
                { modal: true },
                'Reset Knowledge Base',
                'Cancel'
            );

            if (confirm === 'Reset Knowledge Base') {
                await kbManager.clearAllData();
                treeProvider.refresh();

                const stats = await kbManager.getStats();
                const msg = stats.patternCount === 0 && stats.indexedFilesCount === 0
                    ? 'Knowledge base has been reset successfully. You can now re-index your workspace.'
                    : `Reset completed but some data may remain: ${stats.patternCount} patterns, ${stats.indexedFilesCount} indexed files. Please try again or restart VS Code.`;

                vscode.window.showInformationMessage(msg);
            }
        })
    );

    // Command: List patterns (quick pick feature browser)
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.listPatterns', async () => {
            const features = await kbManager.getAllFeatures();

            if (features.length === 0) {
                vscode.window.showInformationMessage('No features found. Run "AutoForge: Index Workspace" to analyze your codebase!');
                return;
            }

            const items = features.map(f => ({
                label: f.name,
                description: `${f.languages.join(' + ')} · ${f.components.length} components`,
                detail: f.description,
                feature: f
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Browse ${features.length} features in your knowledge base`,
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selected) {
                const components = await kbManager.getComponentsForFeature(selected.feature.id);
                if (components.length === 0) { return; }

                const componentItems = components.map(c => {
                    const isEntry = selected.feature.entryPoints.includes(c.id);
                    return {
                        label: `${c.name}${isEntry ? ' [Entry Point]' : ''}`,
                        description: `${c.type} · ${c.language}`,
                        detail: `${vscode.workspace.asRelativePath(c.filePath)}:${c.startLine}`,
                        component: c
                    };
                });

                const selectedComp = await vscode.window.showQuickPick(componentItems, {
                    placeHolder: `${components.length} components in "${selected.feature.name}"`
                });

                if (selectedComp) {
                    const doc = await vscode.workspace.openTextDocument(selectedComp.component.filePath);
                    const editor = await vscode.window.showTextDocument(doc);
                    const line = selectedComp.component.startLine - 1;
                    editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.InCenter);
                    editor.selection = new vscode.Selection(line, 0, line, 0);
                }
            }
        })
    );

    // ──────────────────────────────────────────────────────────────
    // Session Management Commands
    // ──────────────────────────────────────────────────────────────

    // Command: Switch to session (from tree view click)
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.session.switch', async (sessionId: string) => {
            const session = await sessionManager.switchSession(sessionId);
            if (session) {
                sessionTreeProvider.refresh();
                vscode.window.showInformationMessage(`Switched to session: ${session.name}`);
            }
        })
    );

    // Command: Rename session (from context menu)
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.session.rename', async (item: any) => {
            const sessionId = item?.session?.id;
            if (!sessionId) {
                return;
            }

            const session = await sessionManager.getSession(sessionId);
            if (!session) {
                return;
            }

            const newName = await vscode.window.showInputBox({
                prompt: 'Enter new session name',
                value: session.name,
                validateInput: (value) => {
                    return value.trim() ? null : 'Name cannot be empty';
                }
            });

            if (newName && newName !== session.name) {
                await sessionManager.renameSession(newName, sessionId);
                sessionTreeProvider.refresh();
                vscode.window.showInformationMessage(`Session renamed to: ${newName}`);
            }
        })
    );

    // Command: Delete session (from context menu)
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.session.delete', async (item: any) => {
            const sessionId = item?.session?.id;
            if (!sessionId) {
                return;
            }

            const session = await sessionManager.getSession(sessionId);
            if (!session) {
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `Delete session "${session.name}"? This cannot be undone.`,
                { modal: true },
                'Delete'
            );

            if (confirm === 'Delete') {
                await sessionManager.deleteSession(sessionId);
                sessionTreeProvider.refresh();
                vscode.window.showInformationMessage(`Session "${session.name}" deleted`);
            }
        })
    );

    // Command: Export session (from context menu)
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.session.export', async (item: any) => {
            const sessionId = item?.session?.id;
            if (!sessionId) {
                return;
            }

            const sessionData = await sessionManager.exportSession(sessionId);
            if (!sessionData) {
                vscode.window.showErrorMessage('Failed to export session');
                return;
            }

            // Get session synchronously from exportSession result
            const fileName = `session.json`.replace(/[^a-z0-9-]/gi, '_');

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(fileName),
                filters: { 'JSON': ['json'] }
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(sessionData, 'utf-8'));
                vscode.window.showInformationMessage(`Session exported to ${uri.fsPath}`);
            }
        })
    );

    // Command: Import session
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.session.import', async () => {
            const uri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: { 'JSON': ['json'] },
                title: 'Import AutoForge Session'
            });

            if (uri && uri[0]) {
                const content = await vscode.workspace.fs.readFile(uri[0]);
                const sessionData = Buffer.from(content).toString('utf-8');
                
                const session = await sessionManager.importSession(sessionData);
                if (session) {
                    sessionTreeProvider.refresh();
                    vscode.window.showInformationMessage(`Session imported: ${session.name}`);
                } else {
                    vscode.window.showErrorMessage('Failed to import session');
                }
            }
        })
    );

    // Command: Refresh sessions view
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.session.refresh', () => {
            sessionTreeProvider.refresh();
        })
    );

    // ──────────────────────────────────────────────────────────────
    // Follow-up Button Commands
    // ──────────────────────────────────────────────────────────────

    // Command: Generate Tests
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.action.generateTests', async (context: any) => {
            await openCopilotWithContext(context, 'Generate comprehensive unit tests for this code', {
                includeTestFramework: true,
                includeEdgeCases: true,
                includeMocks: true
            });
        })
    );

    // Command: Refactor Code
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.action.refactor', async (context: any) => {
            await openCopilotWithContext(context, 'Refactor this code to improve quality', {
                considerPatterns: true,
                improveReadability: true,
                reduceCoupling: true
            });
        })
    );

    // Command: Add Feature
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.action.addFeature', async (context: any) => {
            const featureName = await vscode.window.showInputBox({
                prompt: 'What feature would you like to add?',
                placeHolder: 'e.g., Add validation, Add logging, Add caching...',
                validateInput: (value) => value.trim() ? null : 'Please describe the feature'
            });

            if (featureName) {
                await openCopilotWithContext(context, `Add the following feature: ${featureName}`, {
                    maintainCompatibility: true,
                    addTests: true
                });
            }
        })
    );

    // Command: Edit with Copilot
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.edit.withCopilot', async (context: any) => {
            // Open the file and select the code range
            if (context.filePath) {
                try {
                    const doc = await vscode.workspace.openTextDocument(context.filePath);
                    const editor = await vscode.window.showTextDocument(doc);
                    
                    // If we have the analysis with range info, select that range
                    if (context.analysis?.range) {
                        const range = context.analysis.range;
                        editor.selection = new vscode.Selection(
                            range.start.line,
                            range.start.character,
                            range.end.line,
                            range.end.character
                        );
                        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                    }
                    
                    // Build context-aware prompt for Copilot
                    let prompt = `Improve and refactor this code`;
                    
                    if (context.type === 'explain') {
                        prompt = `Based on the previous explanation, suggest improvements to this code`;
                    } else if (context.type === 'analyze') {
                        prompt = `Based on the dependency analysis, refactor this code to improve maintainability`;
                    } else if (context.type === 'trace') {
                        prompt = `Based on the dependency trace, suggest ways to reduce coupling in this code`;
                    } else if (context.type === 'impact') {
                        prompt = `Based on the impact analysis, suggest safer refactoring approaches`;
                    }
                    
                    // Add KB context if available
                    if (context.analysis?.relatedFeatures && context.analysis.relatedFeatures.length > 0) {
                        const features = context.analysis.relatedFeatures.map((f: any) => f.name).join(', ');
                        prompt += `\n\nThis code is part of: ${features}`;
                    }
                    
                    // Open Copilot chat with the context
                    await vscode.commands.executeCommand('workbench.action.chat.open', {
                        query: `@workspace ${prompt}\n\nConsider:\n- Code quality and readability\n- Performance implications\n- Testing requirements\n- Breaking change risks`
                    });
                    
                } catch (err) {
                    vscode.window.showErrorMessage(`Failed to open file: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        })
    );

    // Command: Follow-up - Tell Me More
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.followup.more', async (context: any) => {
            // Trigger a new chat request with enhanced prompt
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: `@autoforge Based on the previous ${context.type} analysis, provide a more detailed explanation. Include implementation details, edge cases, and technical considerations.\n\n${context.code ? `Code:\n\`\`\`\n${context.code.substring(0, 500)}\n\`\`\`` : ''}`
            });
        })
    );

    // Command: Follow-up - Give Examples
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.followup.examples', async (context: any) => {
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: `@autoforge Based on the previous ${context.type} analysis, provide concrete code examples demonstrating:\n1. How to use this code\n2. Common usage patterns\n3. Integration examples with related components\n\n${context.code ? `Code:\n\`\`\`\n${context.code.substring(0, 500)}\n\`\`\`` : ''}`
            });
        })
    );

    // Command: Follow-up - Explain Architecture
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.followup.architecture', async (context: any) => {
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: `@autoforge Based on the previous ${context.type} analysis, explain the architectural design:\n1. How does this fit into the overall system architecture?\n2. What design patterns are used?\n3. What are the key architectural decisions?\n\n${context.code ? `Code:\n\`\`\`\n${context.code.substring(0, 500)}\n\`\`\`` : ''}`
            });
        })
    );

    // Command: Follow-up - Show Best Practices
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.followup.practices', async (context: any) => {
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: `@autoforge Based on the previous ${context.type} analysis, suggest best practices:\n1. Code quality improvements\n2. Testing strategies\n3. Maintainability recommendations\n4. Performance considerations\n\n${context.code ? `Code:\n\`\`\`\n${context.code.substring(0, 500)}\n\`\`\`` : ''}`
            });
        })
    );

    // Command: Handoff to Copilot with KB Context
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.handoffToCopilot', async () => {
            // Get last analysis context from participant
            const participant = context.workspaceState.get('autoforge.participant') as any;
            const lastMetadata = participant?.getLastMetadata?.();
            const analysisCtx = lastMetadata?.analysisContext;
            
            // Prompt user for their specific intent
            const userIntent = await vscode.window.showInputBox({
                prompt: 'What would you like Copilot to generate or implement?',
                placeHolder: 'e.g., Add PostgreSQL database connection, Create REST API endpoint, Implement authentication...',
                validateInput: (value) => value.trim() ? null : 'Please describe what you want to generate'
            });

            if (!userIntent) {
                return; // User cancelled
            }

            // Build context from AutoForge's analysis
            let kbContext = '';
            
            // Add KB insights if available
            if (analysisCtx?.features && analysisCtx.features.length > 0) {
                kbContext += `\n\n## Architecture Context\nRelated features: ${analysisCtx.features.join(', ')}`;
            }
            
            if (analysisCtx?.files && analysisCtx.files.length > 0) {
                kbContext += `\n\n## Relevant Files\n`;
                for (const file of analysisCtx.files.slice(0, 5)) {
                    kbContext += `- ${file}\n`;
                }
            }
            
            if (analysisCtx?.selections && analysisCtx.selections.length > 0) {
                kbContext += `\n\n## Code Context\n`;
                for (const sel of analysisCtx.selections) {
                    kbContext += `From ${sel.uri} (lines ${sel.range.start}-${sel.range.end}):\n\`\`\`\n${sel.content}\n\`\`\`\n\n`;
                }
            }

            // Get recent session context from AutoForge
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                const session = await sessionManager.getCurrentSession(workspaceFolders[0].uri.fsPath);
                if (session && session.messages.length > 0) {
                    const recentTurns = session.messages.slice(-4); // Last 4 turns (2 exchanges)
                    kbContext += `\n\n## Recent Context from @autoforge\n`;
                    for (const turn of recentTurns) {
                        const preview = turn.content.length > 150 ? turn.content.substring(0, 150) + '...' : turn.content;
                        kbContext += `- ${turn.role}: ${preview}\n`;
                    }
                }
            }

            // Open @workspace in the same chat window with enriched context
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: `@workspace ${userIntent}${kbContext}\n\nPlease implement this following best practices for the existing codebase architecture.`
            });
        })
    );

    // ──────────────────────────────────────────────────────────────
    // Return from @workspace Command
    // ──────────────────────────────────────────────────────────────

    // Command: Return to AutoForge from @workspace with session context
    context.subscriptions.push(
        vscode.commands.registerCommand('autoforge.returnFromWorkspace', async () => {
            // Build a context-aware return prompt from session history
            let returnPrompt = 'Continue from where we left off.';

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                try {
                    const session = await sessionManager.getCurrentSession(workspaceFolders[0].uri.fsPath);
                    if (session && session.messages.length > 0) {
                        const lastUserTurn = [...session.messages]
                            .reverse()
                            .find(t => t.role === 'user');
                        if (lastUserTurn) {
                            returnPrompt = `Continue from where we left off. My last request was: ${lastUserTurn.content.substring(0, 200)}`;
                        }
                    }
                } catch {
                    // Use default prompt
                }
            }

            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: `@autoforge ${returnPrompt}`
            });
        })
    );

    console.log('AutoForge activated successfully');
}

// ─── Helper: Open Copilot with Context ─────────────────────────────

/**
 * Opens Copilot Chat with rich context from AutoForge analysis
 */
async function openCopilotWithContext(
    context: any,
    userRequest: string,
    options: {
        includeTestFramework?: boolean;
        includeEdgeCases?: boolean;
        includeMocks?: boolean;
        considerPatterns?: boolean;
        improveReadability?: boolean;
        reduceCoupling?: boolean;
        maintainCompatibility?: boolean;
        addTests?: boolean;
    } = {}
): Promise<void> {
    // Open file and select code if available
    if (context.filePath) {
        try {
            const doc = await vscode.workspace.openTextDocument(context.filePath);
            const editor = await vscode.window.showTextDocument(doc);
            
            if (context.analysis?.range) {
                const range = context.analysis.range;
                editor.selection = new vscode.Selection(
                    range.start.line,
                    range.start.character,
                    range.end.line,
                    range.end.character
                );
                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            }
        } catch (err) {
            console.error('Failed to open file:', err);
        }
    }

    // Build comprehensive prompt
    let prompt = `${userRequest}\n\n`;
    
    // Add code context
    if (context.code) {
        prompt += `## Code\n\`\`\`\n${context.code.substring(0, 1000)}\n\`\`\`\n\n`;
    }
    
    // Add KB insights
    if (context.analysis?.relatedFeatures && context.analysis.relatedFeatures.length > 0) {
        const features = context.analysis.relatedFeatures.map((f: any) => f.name).join(', ');
        prompt += `## Architecture Context\nThis code is part of: ${features}\n\n`;
    }
    
    if (context.analysis?.imports && context.analysis.imports.length > 0) {
        prompt += `## Dependencies\n`;
        for (const imp of context.analysis.imports.slice(0, 5)) {
            prompt += `- ${imp}\n`;
        }
        prompt += `\n`;
    }
    
    // Add options-specific guidance
    const guidelines: string[] = [];
    
    if (options.includeTestFramework) {
        guidelines.push('Use appropriate testing framework (Jest/JUnit/pytest)');
    }
    if (options.includeEdgeCases) {
        guidelines.push('Include edge cases and error scenarios');
    }
    if (options.includeMocks) {
        guidelines.push('Mock external dependencies appropriately');
    }
    if (options.considerPatterns) {
        guidelines.push('Apply relevant design patterns');
    }
    if (options.improveReadability) {
        guidelines.push('Improve code readability and documentation');
    }
    if (options.reduceCoupling) {
        guidelines.push('Reduce coupling between components');
    }
    if (options.maintainCompatibility) {
        guidelines.push('Maintain backward compatibility');
    }
    if (options.addTests) {
        guidelines.push('Include unit tests for new functionality');
    }
    
    if (guidelines.length > 0) {
        prompt += `## Guidelines\n`;
        for (const guideline of guidelines) {
            prompt += `- ${guideline}\n`;
        }
        prompt += `\n`;
    }
    
    // Open Copilot with @workspace for full context
    await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: `@workspace ${prompt}`
    });
}

export function deactivate() {}

export function getKBManager(): KnowledgeBaseManager {
    return kbManager;
}
