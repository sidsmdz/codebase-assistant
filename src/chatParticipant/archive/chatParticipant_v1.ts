import * as vscode from 'vscode';
import { KnowledgeBaseManager } from './knowledgeBase/KnowledgeBaseManager';
import { ContextBuilder } from './knowledgeBase/ContextBuilder';
import { IngestionService } from './ingestionService';
import { SelectionAnalyzer } from './analysis/SelectionAnalyzer';
import { SessionManagerV2 } from './session/SessionManagerV2';

/**
 * Represents context extracted from user's chat references (#file, #selection, etc.)
 */
interface ExtractedContext {
    files: Array<{ uri: vscode.Uri; content: string; description: string }>;
    selections: Array<{ uri: vscode.Uri; range: vscode.Range; content: string; description: string }>;
    hasContext: boolean;
}

/**
 * Register the AutoForge chat participant in Copilot Chat.
 * Users invoke via @autoforge in the chat panel.
 */
export function registerChatParticipant(
    extContext: vscode.ExtensionContext,
    kbManager: KnowledgeBaseManager,
    sessionManager: SessionManagerV2,
    onScanComplete?: () => void
): vscode.Disposable {

    const contextBuilder = new ContextBuilder(kbManager);
    const selectionAnalyzer = new SelectionAnalyzer(kbManager);

    const participant = vscode.chat.createChatParticipant(
        'autoforge.chatParticipant',
        async (
            request: vscode.ChatRequest,
            chatContext: vscode.ChatContext,
            stream: vscode.ChatResponseStream,
            token: vscode.CancellationToken
        ): Promise<vscode.ChatResult> => {
            // Route slash commands
            switch (request.command) {
                case 'scan':
                    await handleScan(stream, kbManager, token, onScanComplete);
                    return { metadata: { command: 'scan' } };
                case 'features':
                    await handleFeatures(stream, kbManager, token);
                    return { metadata: { command: 'features' } };
                case 'stats':
                    await handleStats(stream, kbManager, token);
                    return { metadata: { command: 'stats' } };
                case 'explain':
                    const explainResult = await handleExplain(request, stream, kbManager, contextBuilder, selectionAnalyzer, token);
                    return { metadata: { command: 'explain', hasCode: !!explainResult } };
                case 'reset':
                    await handleReset(stream, kbManager, token, onScanComplete);
                    return { metadata: { command: 'reset' } };
                case 'analyze':
                    const analyzeResult = await handleAnalyze(request, stream, kbManager, selectionAnalyzer, token);
                    return { metadata: { command: 'analyze', hasCode: !!analyzeResult } };
                case 'trace':
                    const traceResult = await handleTrace(request, stream, kbManager, selectionAnalyzer, token);
                    return { metadata: { command: 'trace', hasCode: !!traceResult } };
                case 'impact':
                    const impactResult = await handleImpact(request, stream, kbManager, selectionAnalyzer, token);
                    return { metadata: { command: 'impact', hasCode: !!impactResult } };
                case 'sessions':
                    await handleSessions(stream, sessionManager, token);
                    return { metadata: { command: 'sessions' } };
                case 'session':
                    await handleSession(request, stream, sessionManager, token);
                    return { metadata: { command: 'session' } };
                case 'ask':
                    await handleAsk(request, stream, kbManager, selectionAnalyzer, token);
                    return { metadata: { command: 'ask' } };
                case 'generate':
                    await handleGenerate(request, stream, kbManager, sessionManager, token);
                    return { metadata: { command: 'generate' } };
                default:
                    const questionResult = await handleQuestion(request, chatContext, stream, kbManager, contextBuilder, selectionAnalyzer, sessionManager, token);
                    return { 
                        metadata: { 
                            command: 'question', 
                            hasCode: questionResult?.hasCode,
                            analysisContext: questionResult?.analysisContext
                        } 
                    };
            }
        }
    );

    // Store last result metadata for command access
    let lastResultMetadata: any = null;
    
    // Add followup provider for analysis and understanding
    participant.followupProvider = {
        provideFollowups(result: vscode.ChatResult, context: vscode.ChatContext, token: vscode.CancellationToken) {
            // Store metadata for command access
            lastResultMetadata = result.metadata;

            const command = result.metadata?.command;

            // After handoff to @workspace (generate/ask), show "Back to AutoForge" options
            if (command === 'generate' || command === 'ask') {
                return [
                    {
                        prompt: 'Continue from where we left off and summarize what @workspace generated',
                        label: '🔙 Back to AutoForge'
                    },
                    {
                        prompt: 'Save the patterns from the generated code to the knowledge base',
                        command: 'scan',
                        label: '💾 Save Pattern to KB'
                    },
                    {
                        command: 'analyze',
                        prompt: 'Analyze the generated code for quality and dependencies',
                        label: '🔍 Analyze Generated Code'
                    },
                    {
                        command: 'impact',
                        prompt: 'Check the impact of the changes just made',
                        label: '💥 Check Impact'
                    }
                ];
            }

            // Default follow-ups for question/analysis commands
            const followups: vscode.ChatFollowup[] = [
                {
                    prompt: 'provide a more detailed explanation with implementation details, edge cases, and technical considerations',
                    label: '🔍 Tell Me More'
                },
                {
                    prompt: 'provide concrete code examples demonstrating how to use this, common usage patterns, and integration examples',
                    label: '📚 Give Examples'
                },
                {
                    prompt: 'explain the architectural design: how this fits into the system, design patterns used, and architectural decisions',
                    label: '🏗️ Explain Architecture'
                },
                {
                    prompt: 'suggest best practices: code quality improvements, testing strategies, and performance considerations',
                    label: '🎯 Show Best Practices'
                },
                {
                    command: 'generate',
                    prompt: 'Generate code based on our conversation context',
                    label: '⚡ Generate Code with Copilot'
                }
            ];

            return followups;
        }
    };
    
    // Export metadata accessor for commands
    (participant as any).getLastMetadata = () => lastResultMetadata;

    participant.iconPath = vscode.Uri.joinPath(extContext.extensionUri, 'media', 'icon.svg');

    return participant;
}

// ─── Default Handler: enriched question answering ──────────────────

async function handleQuestion(
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    contextBuilder: ContextBuilder,
    selectionAnalyzer: SelectionAnalyzer,
    sessionManager: SessionManagerV2,
    token: vscode.CancellationToken
): Promise<{ hasCode: boolean; analysisContext?: any }> {

    const userQuery = request.prompt.trim();

    // Ask LLM to understand user intent (action vs question)
    stream.progress('Understanding your intent...');
    const intent = await detectIntentWithLLM(userQuery, token);
    
    if (intent.isAction) {
        // User wants Copilot to DO something - forward with KB context
        stream.progress(`Routing to Copilot for: ${intent.actionType}`);
        await handleAsk(request, stream, kbManager, selectionAnalyzer, token); return { hasCode: false };
    }

    // User is asking about the codebase - AutoForge answers with KB

    // 0. Initialize session for current workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        await sessionManager.getCurrentSession(workspaceFolders[0].uri.fsPath);
    }

    // 1. Check if KB is indexed (first-time verification)
    const kbStatus = await checkKBStatus(kbManager);
    if (!kbStatus.isIndexed) {
        stream.markdown('⚠️ **Knowledge base not indexed yet**\n\n');
        stream.markdown('AutoForge works best when your workspace is indexed. This allows me to:\n');
        stream.markdown('- Understand your codebase structure\n');
        stream.markdown('- Find related features and components\n');
        stream.markdown('- Trace dependencies and data flows\n\n');
        
        const shouldAutoScan = await vscode.window.showInformationMessage(
            'AutoForge: Workspace not indexed. Would you like to scan now?',
            'Scan Now',
            'Ask Anyway',
            'Later'
        );

        if (shouldAutoScan === 'Scan Now') {
            stream.markdown('🚀 Starting workspace scan...\n\n');
            const ingestService = new IngestionService(kbManager);
            await ingestService.runIngestion();
            const stats = await kbManager.getDetailedStats();
            stream.markdown(`✅ **Indexed:** ${stats.totalFeatures} features, ${stats.totalComponents} components\n\n`);
        } else if (shouldAutoScan === 'Later') {
            stream.markdown('Run `/scan` when you\'re ready to index your workspace.\n\n');
            stream.markdown('For now, I\'ll answer without codebase-specific context.\n\n');
        } else {
            stream.markdown('Proceeding without KB context...\n\n');
        }
    } else if (kbStatus.shouldRefresh) {
        stream.markdown(`ℹ️ KB indexed ${kbStatus.daysSinceLastScan} days ago. Consider running \`/scan\` to refresh.\n\n`);
    }

    // 1. Gather workspace context automatically
    stream.progress('Gathering workspace context...');
    const workspaceContext = workspaceFolders ? await gatherWorkspaceContext(workspaceFolders, kbManager) : '';
    
    // 2. Extract context from references (#file, #selection, etc.)
    const extractedContext = await extractContextFromReferences(request.references);
    
    if (extractedContext.hasContext) {
        const fileCount = extractedContext.files.length;
        const selectionCount = extractedContext.selections.length;
        if (fileCount > 0 || selectionCount > 0) {
            stream.progress(`Processing ${fileCount} file${fileCount !== 1 ? 's' : ''} and ${selectionCount} selection${selectionCount !== 1 ? 's' : ''}...`);
        }
    }

    // 2. Analyze selections with SelectionAnalyzer
    const selectionAnalyses: string[] = [];
    for (const selection of extractedContext.selections) {
        try {
            stream.progress(`Analyzing selection from ${selection.uri.fsPath.split('/').pop()}...`);
            const document = await vscode.workspace.openTextDocument(selection.uri);
            const analysis = await selectionAnalyzer.analyzeSelection(document, selection.range);
            
            // Build context string
            const contextStr = selectionAnalyzer.buildContextString(analysis);
            selectionAnalyses.push(contextStr);
            
            // Show progress
            if (analysis.relatedFeatures.length > 0) {
                const topFeatures = analysis.relatedFeatures.slice(0, 3).map(f => f.name).join(', ');
                stream.progress(`Found related features: ${topFeatures}`);
            }
        } catch (err) {
            console.error('Selection analysis error:', err);
            // Continue with other selections
        }
    }

    // 3. Detect exhaustive queries ("list all", "show all", etc.)
    const isExhaustiveQuery = detectExhaustiveQuery(request.prompt);
    
    // 3. Build enriched prompt with KB context
    stream.progress('Searching knowledge base...');
    const { enrichedPrompt, featuresFound, featureNames } = await contextBuilder.buildContextWithMetadata(
        request.prompt,
        isExhaustiveQuery
    );

    if (featuresFound > 0) {
        stream.progress(`Found ${featuresFound} relevant feature${featuresFound > 1 ? 's' : ''}: ${featureNames.join(', ')}`);
    }

    // 4. Build enhanced prompt with context variables
    let finalPrompt = enrichedPrompt;
    
    // Add workspace context FIRST (sets the stage)
    if (workspaceContext) {
        finalPrompt = `# Workspace Context\n\n${workspaceContext}\n\n---\n\n${finalPrompt}`;
    }
    
    // Add selection analyses (most important for code questions)
    if (selectionAnalyses.length > 0) {
        finalPrompt = `${finalPrompt}\n\n## Smart Selection Analysis\n\n${selectionAnalyses.join('\n\n---\n\n')}`;
    }
    
    // Add file contexts
    if (extractedContext.files.length > 0) {
        const fileContexts = extractedContext.files.map(f => {
            return `## Referenced File: ${f.uri.fsPath}\n\`\`\`\n${f.content}\n\`\`\``;
        }).join('\n\n');
        
        finalPrompt = `${finalPrompt}\n\n## Additional Context from Files\n\n${fileContexts}`;
    }
    
    // Add selection contexts
    if (extractedContext.selections.length > 0) {
        const selectionContexts = extractedContext.selections.map(s => {
            return `## Code Selection from ${s.uri.fsPath} (Lines ${s.range.start.line + 1}-${s.range.end.line + 1})\n\`\`\`\n${s.content}\n\`\`\``;
        }).join('\n\n');
        
        finalPrompt = `${finalPrompt}\n\n## Code Selections\n\n${selectionContexts}`;
    }

    // 5. Show transparent context references (like Copilot's "Used N references")
    // Gather per-feature details for rich display
    const featureDetails: ContextReferenceInfo['features'] = [];
    if (kbManager) {
        for (const name of featureNames) {
            try {
                const features = await kbManager.searchFeatures(name, 1);
                if (features.length > 0) {
                    const f = features[0];
                    const components = await kbManager.getComponentsForFeature(f.id);
                    featureDetails.push({
                        name: f.name,
                        componentCount: components.length,
                        languages: f.languages,
                        dataFlowCount: f.flow?.length || 0
                    });
                }
            } catch {
                featureDetails.push({ name, componentCount: 0, languages: [], dataFlowCount: 0 });
            }
        }
    }

    await renderContextReferences(stream, {
        userQuery: request.prompt,
        features: featureDetails,
        selectionAnalyses: await Promise.all(selectionAnalyses.length > 0 ? extractedContext.selections.map(async (sel, idx) => ({
            filePath: sel.uri.fsPath,
            lines: `${sel.range.start.line + 1}-${sel.range.end.line + 1}`,
            language: (await vscode.workspace.openTextDocument(sel.uri)).languageId,
            analysisResult: selectionAnalyses[idx]
        })) : []),
        filesIncluded: extractedContext.files.map(f => ({
            path: f.uri.fsPath,
            size: f.content.length,
            lineCount: f.content.split('\n').length,
            reason: 'User referenced with #file'
        })),
        selectionsIncluded: extractedContext.selections.map(s => ({
            path: s.uri.fsPath,
            lines: `${s.range.start.line + 1}-${s.range.end.line + 1}`,
            size: s.content.length,
            language: 'code',
            reason: 'User referenced with #selection'
        })),
        totalContextSize: finalPrompt.length
    });

    // 6. Select model
    const model = await selectModel(token);
    if (!model) {
        stream.markdown('⚠️ No Copilot language model available. Ensure GitHub Copilot Chat is installed and active.');
        return { hasCode: false };
    }

    // 7. Build messages with conversation history
    const messages: vscode.LanguageModelChatMessage[] = [];

    // Include previous turns for multi-turn support
    for (const turn of chatContext.history) {
        if (turn instanceof vscode.ChatRequestTurn) {
            messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
        } else if (turn instanceof vscode.ChatResponseTurn) {
            const text = turn.response
                .filter((part): part is vscode.ChatResponseMarkdownPart => part instanceof vscode.ChatResponseMarkdownPart)
                .map(part => part.value.value)
                .join('');
            if (text) {
                messages.push(vscode.LanguageModelChatMessage.Assistant(text));
            }
        }
    }

    // Add the enriched prompt as the final user message
    messages.push(vscode.LanguageModelChatMessage.User(finalPrompt));

    // 8. Stream response
    let assistantResponse = '';
    try {
        const chatResponse = await model.sendRequest(messages, {}, token);
        for await (const fragment of chatResponse.text) {
            stream.markdown(fragment);
            assistantResponse += fragment;
        }

        // 9. Save conversation to session
        await sessionManager.addTurn('user', request.prompt, undefined, {
            features: featureNames,
            files: extractedContext.files.map(f => f.uri.fsPath)
        });
        await sessionManager.addTurn('assistant', assistantResponse);

        // Return hasCode flag and analysis context for followup provider
        return { 
            hasCode: extractedContext.selections.length > 0 || extractedContext.files.length > 0,
            analysisContext: {
                features: featureNames,
                files: extractedContext.files.map(f => f.uri.fsPath),
                selections: extractedContext.selections.map(s => ({
                    uri: s.uri.fsPath,
                    range: { start: s.range.start.line, end: s.range.end.line },
                    content: s.content.substring(0, 500)
                })),
                userQuery: request.prompt,
                hasKBContext: featuresFound > 0
            }
        };

    } catch (err) {
        if (err instanceof vscode.LanguageModelError) {
            stream.markdown(`⚠️ Model error: ${err.message}`);
        } else {
            throw err;
        }
        return { hasCode: false, analysisContext: undefined };
    }
}

// ─── /scan command ─────────────────────────────────────────────────

async function handleScan(
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    token: vscode.CancellationToken,
    onComplete?: () => void
): Promise<void> {
    stream.progress('Indexing workspace...');

    try {
        const ingestService = new IngestionService(kbManager);
        await ingestService.runIngestion();

        const stats = await kbManager.getDetailedStats();
        stream.markdown(`## ⚡ Workspace Indexed Successfully\n\n`);
        stream.markdown(`| Metric | Count |\n|--------|-------|\n`);
        stream.markdown(`| Features | ${stats.totalFeatures} |\n`);
        stream.markdown(`| Components | ${stats.totalComponents} |\n`);
        stream.markdown(`| Data Flows | ${stats.totalDataFlows} |\n`);
        stream.markdown(`| Indexed Files | ${stats.indexedFiles} |\n`);
        stream.markdown(`| Unique Terms | ${stats.totalTerms} |\n\n`);
        stream.markdown(`You can now ask questions about your codebase. Try: *"explain the authentication flow"* or *"how does the grid rendering work?"*\n`);

        onComplete?.();
    } catch (err) {
        stream.markdown(`⚠️ Indexing failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

// ─── /features command ─────────────────────────────────────────────

async function handleFeatures(
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    token: vscode.CancellationToken
): Promise<void> {
    const features = await kbManager.getAllFeatures();

    if (features.length === 0) {
        stream.markdown('No features found in the knowledge base. Run `/scan` to index your workspace first.');
        return;
    }

    stream.markdown(`## ⚡ Features (${features.length})\n\n`);

    for (const f of features) {
        const langs = f.languages.join(', ');
        const frameworks = f.frameworks.join(', ') || 'none';
        stream.markdown(`### ${f.name}\n`);
        stream.markdown(`${f.description}\n\n`);
        stream.markdown(`- **Languages:** ${langs}\n`);
        stream.markdown(`- **Components:** ${f.components.length}\n`);
        stream.markdown(`- **Entry Points:** ${f.entryPoints.length}\n`);
        stream.markdown(`- **Frameworks:** ${frameworks}\n`);
        if (f.tags.length > 0) {
            stream.markdown(`- **Tags:** ${f.tags.slice(0, 8).join(', ')}\n`);
        }
        stream.markdown(`\n`);
    }
}

// ─── /stats command ────────────────────────────────────────────────

async function handleStats(
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    token: vscode.CancellationToken
): Promise<void> {
    const stats = await kbManager.getDetailedStats();

    stream.markdown(`## ⚡ Knowledge Base Statistics\n\n`);
    stream.markdown(`| Metric | Count |\n|--------|-------|\n`);
    stream.markdown(`| Features | ${stats.totalFeatures} |\n`);
    stream.markdown(`| Components | ${stats.totalComponents} |\n`);
    stream.markdown(`| Data Flows | ${stats.totalDataFlows} |\n`);
    stream.markdown(`| Indexed Files | ${stats.indexedFiles} |\n`);
    stream.markdown(`| Patterns | ${stats.totalPatterns} |\n`);
    stream.markdown(`| AST Nodes | ${stats.totalASTNodes} |\n`);
    stream.markdown(`| Unique Terms | ${stats.totalTerms} |\n\n`);

    // Language breakdown
    const langEntries = Object.entries(stats.featuresByLanguage);
    if (langEntries.length > 0) {
        stream.markdown(`### Features by Language\n`);
        for (const [lang, count] of langEntries) {
            stream.markdown(`- **${lang}:** ${count}\n`);
        }
        stream.markdown(`\n`);
    }

    // Component type breakdown
    const typeEntries = Object.entries(stats.componentsByType);
    if (typeEntries.length > 0) {
        stream.markdown(`### Components by Type\n`);
        for (const [type, count] of typeEntries) {
            stream.markdown(`- **${type}:** ${count}\n`);
        }
        stream.markdown(`\n`);
    }

    // Framework breakdown
    const fwEntries = Object.entries(stats.featuresByFramework);
    if (fwEntries.length > 0) {
        stream.markdown(`### Frameworks Detected\n`);
        for (const [fw, count] of fwEntries) {
            stream.markdown(`- **${fw}:** ${count} features\n`);
        }
        stream.markdown(`\n`);
    }
}

// ─── /explain command ──────────────────────────────────────────────

async function handleExplain(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    contextBuilder: ContextBuilder,
    selectionAnalyzer: SelectionAnalyzer,
    token: vscode.CancellationToken
): Promise<{ hasCode: boolean }> {
    const query = request.prompt.trim();

    // Try to get code selection from chat references or active editor
    const selection = await getCodeSelection(request.references);
    
    if (selection) {
        stream.progress('Analyzing code...');
        
        try {
            const analysis = await selectionAnalyzer.analyzeSelection(selection.document, selection.range);
            
            // Build context from selection
            const selectionContext = selectionAnalyzer.buildContextString(analysis);
            const codeSnippet = selection.document.getText(selection.range);
            const fileName = selection.document.uri.fsPath.split('/').pop();
            
            const enrichedPrompt = `Please explain the following code in detail:\n\n**File:** ${fileName}\n**Lines:** ${selection.range.start.line + 1}-${selection.range.end.line + 1}\n\n\`\`\`${analysis.language}\n${codeSnippet}\n\`\`\`\n\n${selectionContext}`;
            
            const model = await selectModel(token);
            if (!model) {
                stream.markdown('⚠️ No Copilot language model available.');
                return { hasCode: false };
            }

            const messages = [vscode.LanguageModelChatMessage.User(enrichedPrompt)];
            const response = await model.sendRequest(messages, {}, token);
            for await (const fragment of response.text) {
                stream.markdown(fragment);
            }
            
            return { hasCode: true };
            
        } catch (err) {
            console.error('Selection explanation error:', err);
            // Fall through to query-based explanation
        }
    }

    // Fallback to query-based explanation
    if (!query) {
        stream.markdown('💡 **Tip:** Add a file with `#file` or select code, then use `/explain` to explain it.\n\n');
        stream.markdown('Or provide a query: `@autoforge /explain user authentication`');
        return { hasCode: false };
    }

    stream.progress(`Searching for features matching "${query}"...`);

    const features = await kbManager.searchFeatures(query, 3);
    if (features.length === 0) {
        stream.markdown(`No features found matching "${query}". Try running \`/scan\` first, or ask a more general question.`);
        return { hasCode: false };
    }

    // Build enriched prompt and send to LM
    const enrichedPrompt = await contextBuilder.buildContextForQuery(`Explain in detail the following aspect of this codebase: ${query}`);

    const model = await selectModel(token);
    if (!model) {
        stream.markdown('⚠️ No Copilot language model available.');
        return { hasCode: false };
    }

    try {
        const messages = [vscode.LanguageModelChatMessage.User(enrichedPrompt)];
        const response = await model.sendRequest(messages, {}, token);
        for await (const fragment of response.text) {
            stream.markdown(fragment);
        }
        return { hasCode: selection !== null };
    } catch (err) {
        if (err instanceof vscode.LanguageModelError) {
            stream.markdown(`⚠️ Model error: ${err.message}`);
        } else {
            throw err;
        }
        return { hasCode: false };
    }
}

// ─── /reset command ────────────────────────────────────────────────

async function handleReset(
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    token: vscode.CancellationToken,
    onComplete?: () => void
): Promise<void> {
    try {
        await kbManager.clearAllData();

        const stats = await kbManager.getStats();
        if (stats.patternCount === 0 && stats.featureCount === 0) {
            stream.markdown('Knowledge base has been reset successfully. Run `/scan` to re-index your workspace.');
        } else {
            stream.markdown('Reset completed but some data may remain. Try restarting VS Code if the issue persists.');
        }

        onComplete?.();
    } catch (err) {
        stream.markdown(`⚠️ Reset failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

// ─── /analyze command ──────────────────────────────────────────────

async function handleAnalyze(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    selectionAnalyzer: SelectionAnalyzer,
    token: vscode.CancellationToken
): Promise<{ hasCode: boolean }> {
    // Get code selection from chat references or active editor
    const selection = await getCodeSelection(request.references);
    
    if (!selection) {
        stream.markdown('⚠️ No code found to analyze.\n\n');
        stream.markdown('💡 **Tip:** Add a file with `#file`, select code, or use "Add selection to chat"');
        return { hasCode: false };
    }

    stream.progress('Analyzing code...');

    try {
        const analysis = await selectionAnalyzer.analyzeSelection(selection.document, selection.range);
        const fileName = selection.document.uri.fsPath.split('/').pop();
        
        // Show comprehensive analysis
        stream.markdown(`# Code Analysis\n\n`);
        stream.markdown(`**File:** ${analysis.uri.fsPath}\n`);
        stream.markdown(`**Lines:** ${analysis.range.start.line + 1}-${analysis.range.end.line + 1}\n`);
        stream.markdown(`**Language:** ${analysis.language}\n\n`);

        if (analysis.relatedFeatures.length > 0) {
            stream.markdown(`## 🎯 Related Features (${analysis.relatedFeatures.length})\n\n`);
            for (const feature of analysis.relatedFeatures.slice(0, 5)) {
                const confidence = (feature.confidence * 100).toFixed(0);
                stream.markdown(`- **${feature.name}** (${confidence}% confidence)\n`);
            }
            stream.markdown(`\n`);
        }

        if (analysis.relatedComponents.length > 0) {
            stream.markdown(`## 🧩 Related Components (${analysis.relatedComponents.length})\n\n`);
            for (const comp of analysis.relatedComponents.slice(0, 10)) {
                const link = vscode.Uri.file(comp.filePath);
                stream.markdown(`- [${comp.name}](${link.toString()}) (${comp.type})\n`);
                stream.reference(link);
            }
            stream.markdown(`\n`);
        }

        if (analysis.imports.length > 0) {
            stream.markdown(`## 📦 Dependencies (${analysis.imports.length})\n\n`);
            const importList = analysis.imports.slice(0, 15).map(imp => `- \`${imp}\``).join('\n');
            stream.markdown(importList + '\n\n');
        }

        if (analysis.methodCalls.length > 0) {
            stream.markdown(`## 🔧 Method Calls (${analysis.methodCalls.length})\n\n`);
            const callList = analysis.methodCalls.slice(0, 20).map(call => `- \`${call}()\``).join('\n');
            stream.markdown(callList + '\n\n');
        }

        if (analysis.typesReferenced.length > 0) {
            stream.markdown(`## 📋 Types Referenced (${analysis.typesReferenced.length})\n\n`);
            const typeList = analysis.typesReferenced.slice(0, 15).map(type => `- \`${type}\``).join('\n');
            stream.markdown(typeList + '\n\n');
        }

        if (analysis.relatedFiles.length > 0) {
            stream.markdown(`## 📁 Related Files (${analysis.relatedFiles.length})\n\n`);
            for (const file of analysis.relatedFiles.slice(0, 10)) {
                const uri = vscode.Uri.file(file);
                const fileName = file.split('/').pop();
                stream.markdown(`- [${fileName}](${uri.toString()})\n`);
                stream.reference(uri);
            }
            stream.markdown(`\n`);
        }

        return { hasCode: true };

    } catch (err) {
        stream.markdown(`⚠️ Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
        return { hasCode: false };
    }
}

// ─── /trace command ────────────────────────────────────────────────

async function handleTrace(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    selectionAnalyzer: SelectionAnalyzer,
    token: vscode.CancellationToken
): Promise<{ hasCode: boolean }> {
    const query = request.prompt.trim();

    // Try to get code selection from chat references or active editor
    const selection = await getCodeSelection(request.references);
    
    if (selection) {
        stream.progress('Tracing dependencies...');
        
        try {
            const analysis = await selectionAnalyzer.analyzeSelection(selection.document, selection.range);
            const fileName = selection.document.uri.fsPath.split('/').pop();
            
            stream.markdown(`## 🔍 Dependency Trace\n\n`);
            stream.markdown(`**File:** ${analysis.uri.fsPath}\n`);
            stream.markdown(`**Lines:** ${analysis.range.start.line + 1}-${analysis.range.end.line + 1}\n\n`);
            
            // Show imports/dependencies
            if (analysis.imports.length > 0) {
                stream.markdown(`### 📦 Direct Dependencies (${analysis.imports.length})\n\n`);
                for (const imp of analysis.imports.slice(0, 20)) {
                    stream.markdown(`- \`${imp}\`\n`);
                }
                if (analysis.imports.length > 20) {
                    stream.markdown(`\n_...and ${analysis.imports.length - 20} more_\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Show method calls (what this code calls)
            if (analysis.methodCalls.length > 0) {
                stream.markdown(`### 📞 Method Calls (${analysis.methodCalls.length})\n\n`);
                stream.markdown(`**What this code calls:**\n\n`);
                for (const call of analysis.methodCalls.slice(0, 25)) {
                    stream.markdown(`- \`${call}()\`\n`);
                }
                if (analysis.methodCalls.length > 25) {
                    stream.markdown(`\n_...and ${analysis.methodCalls.length - 25} more_\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Show related components (what might call this)
            if (analysis.relatedComponents.length > 0) {
                stream.markdown(`### 🔗 Related Components (${analysis.relatedComponents.length})\n\n`);
                for (const comp of analysis.relatedComponents.slice(0, 15)) {
                    const uri = vscode.Uri.file(comp.filePath);
                    stream.markdown(`- [${comp.name}](${uri.toString()}) (${comp.type})\n`);
                    stream.reference(uri);
                }
                if (analysis.relatedComponents.length > 15) {
                    stream.markdown(`\n_...and ${analysis.relatedComponents.length - 15} more_\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Show related features
            if (analysis.relatedFeatures.length > 0) {
                stream.markdown(`### 🎯 Related Features (${analysis.relatedFeatures.length})\n\n`);
                for (const feature of analysis.relatedFeatures.slice(0, 5)) {
                    stream.markdown(`- **${feature.name}** (${(feature.confidence * 100).toFixed(0)}% confidence)\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Show related files
            if (analysis.relatedFiles.length > 0) {
                stream.markdown(`### 📁 Related Files (${analysis.relatedFiles.length})\n\n`);
                for (const file of analysis.relatedFiles.slice(0, 10)) {
                    const uri = vscode.Uri.file(file);
                    const fileName = file.split('/').pop();
                    stream.markdown(`- [${fileName}](${uri.toString()})\n`);
                    stream.reference(uri);
                }
                if (analysis.relatedFiles.length > 10) {
                    stream.markdown(`\n_...and ${analysis.relatedFiles.length - 10} more_\n`);
                }
                stream.markdown(`\n`);
            }
            
            return { hasCode: true };

        } catch (err) {
            console.error('Selection trace error:', err);
            // Fall through to query-based trace
        }
    }

    // Fallback to query-based trace
    if (!query) {
        stream.markdown('💡 **Tip:** Select code or use `#file` / `#selection` in chat, then use `/trace` to trace dependencies. Or provide a component name.\n\n');
        stream.markdown('Example: `@autoforge /trace MessageHandler.processMessage`');
        return { hasCode: false };
    }

    stream.progress(`Tracing dependencies for "${query}"...`);

    try {
        // Search for features containing this component/method
        const features = await kbManager.searchFeatures(query, 5);

        if (features.length === 0) {
            stream.markdown(`No components found matching "${query}". Try running \`/scan\` first or use \`/analyze\` on selected code.`);
            return { hasCode: false };
        }

        stream.markdown(`## 🔍 Trace Results for "${query}"\n\n`);

        for (const feature of features.slice(0, 3)) {
            stream.markdown(`### Feature: ${feature.name}\n`);
            stream.markdown(`${feature.description}\n\n`);

            // Get components for this feature
            const components = await kbManager.getComponentsForFeature(feature.id);
            
            // Find the specific component being traced
            const targetComponent = components.find(c => 
                c.name.toLowerCase().includes(query.toLowerCase())
            );

            if (targetComponent) {
                stream.markdown(`#### Component: ${targetComponent.name} (${targetComponent.type})\n`);
                const uri = vscode.Uri.file(targetComponent.filePath);
                stream.markdown(`📄 [${targetComponent.filePath}](${uri.toString()}) (Lines ${targetComponent.startLine}-${targetComponent.endLine})\n\n`);
                stream.reference(uri.with({ fragment: `L${targetComponent.startLine}-L${targetComponent.endLine}` }));

                // Show dependencies
                if (targetComponent.dependencies && targetComponent.dependencies.length > 0) {
                    stream.markdown(`**Dependencies (${targetComponent.dependencies.length}):**\n`);
                    for (const depId of targetComponent.dependencies.slice(0, 10)) {
                        const depComp = components.find(c => c.id === depId);
                        if (depComp) {
                            stream.markdown(`- ${depComp.name} (${depComp.type})\n`);
                        }
                    }
                    stream.markdown(`\n`);
                }

                // Show dependents
                if (targetComponent.dependents && targetComponent.dependents.length > 0) {
                    stream.markdown(`**Dependents (${targetComponent.dependents.length}):**\n`);
                    for (const depId of targetComponent.dependents.slice(0, 10)) {
                        const depComp = components.find(c => c.id === depId);
                        if (depComp) {
                            stream.markdown(`- ${depComp.name} (${depComp.type})\n`);
                        }
                    }
                    stream.markdown(`\n`);
                }

                // Show imports
                if (targetComponent.imports && targetComponent.imports.length > 0) {
                    stream.markdown(`**Imports (${targetComponent.imports.length}):**\n`);
                    for (const imp of targetComponent.imports.slice(0, 15)) {
                        stream.markdown(`- \`${imp}\`\n`);
                    }
                    stream.markdown(`\n`);
                }
            }

            // Show data flow
            if (feature.flow && feature.flow.length > 0) {
                stream.markdown(`#### Data Flow\n`);
                for (const flow of feature.flow.slice(0, 10)) {
                    const fromComp = components.find(c => c.id === flow.from);
                    const toComp = components.find(c => c.id === flow.to);
                    if (fromComp && toComp) {
                        stream.markdown(`- ${fromComp.name} **${flow.type}** → ${toComp.name}\n`);
                    }
                }
                stream.markdown(`\n`);
            }
        }

        return { hasCode: true };

    } catch (err) {
        stream.markdown(`⚠️ Trace failed: ${err instanceof Error ? err.message : String(err)}`);
        return { hasCode: false };
    }
}

// ─── /impact command ───────────────────────────────────────────────

async function handleImpact(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    selectionAnalyzer: SelectionAnalyzer,
    token: vscode.CancellationToken
): Promise<{ hasCode: boolean }> {
    const query = request.prompt.trim();

    // Try to get code selection from chat references or active editor
    const selection = await getCodeSelection(request.references);
    
    if (selection) {
        stream.progress('Analyzing impact...');
        
        try {
            const analysis = await selectionAnalyzer.analyzeSelection(selection.document, selection.range);
            
            stream.markdown(`## 💥 Impact Analysis\n\n`);
            stream.markdown(`**File:** ${analysis.uri.fsPath}\n`);
            stream.markdown(`**Lines:** ${analysis.range.start.line + 1}-${analysis.range.end.line + 1}\n\n`);
            
            // Analyze what depends on this code
            const impactedComponents = new Set<string>();
            const impactedFeatures = new Set<string>();
            
            // Look at related components
            for (const comp of analysis.relatedComponents) {
                const features = await kbManager.searchFeatures(comp.name, 5);
                for (const feature of features) {
                    impactedFeatures.add(feature.name);
                    const components = await kbManager.getComponentsForFeature(feature.id);
                    
                    // Find components that might depend on the selected code
                    for (const c of components) {
                        // Check if component imports or depends on things in our selection
                        if (c.dependencies && c.dependencies.length > 0) {
                            impactedComponents.add(`${c.name} (${c.type})`);
                        }
                    }
                }
            }
            
            // Show impact summary
            if (analysis.relatedFeatures.length > 0) {
                stream.markdown(`### ⚠️ Potentially Affected Features (${analysis.relatedFeatures.length})\n\n`);
                for (const feature of analysis.relatedFeatures.slice(0, 10)) {
                    stream.markdown(`- **${feature.name}** (${(feature.confidence * 100).toFixed(0)}% confidence)\n`);
                }
                if (analysis.relatedFeatures.length > 10) {
                    stream.markdown(`\n_...and ${analysis.relatedFeatures.length - 10} more_\n`);
                }
                stream.markdown(`\n`);
            } else {
                stream.markdown(`### ✅ Low Impact\n\n`);
                stream.markdown(`This code doesn't appear to be part of any major features in the knowledge base.\n\n`);
            }
            
            // Show what calls the methods in this selection
            if (analysis.methodCalls.length > 0) {
                stream.markdown(`### 📞 Methods That Might Be Affected\n\n`);
                stream.markdown(`Changing this code may impact callers of:\n\n`);
                for (const call of analysis.methodCalls.slice(0, 15)) {
                    stream.markdown(`- \`${call}()\`\n`);
                }
                if (analysis.methodCalls.length > 15) {
                    stream.markdown(`\n_...and ${analysis.methodCalls.length - 15} more_\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Show related components
            if (analysis.relatedComponents.length > 0) {
                stream.markdown(`### 🧩 Components to Review (${analysis.relatedComponents.length})\n\n`);
                for (const comp of analysis.relatedComponents.slice(0, 10)) {
                    const uri = vscode.Uri.file(comp.filePath);
                    stream.markdown(`- [${comp.name}](${uri.toString()}) (${comp.type})\n`);
                    stream.reference(uri);
                }
                if (analysis.relatedComponents.length > 10) {
                    stream.markdown(`\n_...and ${analysis.relatedComponents.length - 10} more_\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Show imports (breaking changes risk)
            if (analysis.imports.length > 0) {
                stream.markdown(`### ⚠️ Breaking Changes Risk\n\n`);
                stream.markdown(`If you modify exported interfaces/types, these imports may break:\n\n`);
                for (const imp of analysis.imports.slice(0, 10)) {
                    stream.markdown(`- \`${imp}\`\n`);
                }
                if (analysis.imports.length > 10) {
                    stream.markdown(`\n_...and ${analysis.imports.length - 10} more_\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Add interactive follow-up buttons
            return { hasCode: true };
            
        } catch (err) {
            console.error('Selection impact error:', err);
            // Fall through to query-based impact
        }
    }

    // Fallback to file/component-based impact
    if (!query) {
        stream.markdown('💡 **Tip:** Select code or use `#file` / `#selection` in chat, then use `/impact` to analyze impact. Or provide a file/component name.\n\n');
        stream.markdown('Example: `@autoforge /impact MessageHandler.ts`');
        return { hasCode: false };
    }

    stream.progress(`Analyzing impact of changes to "${query}"...`);

    // Check if it's a file path or component name
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        const rootPath = workspaceFolders[0].uri.fsPath;
        const possiblePath = query.includes('/') ? query : `${rootPath}/${query}`;
        
        try {
            const uri = vscode.Uri.file(possiblePath);
            await vscode.workspace.fs.stat(uri);
            // File exists, analyze it
            await analyzeImpact(possiblePath, stream, kbManager); return { hasCode: false };
        } catch {
            // Not a valid file, treat as component name
        }
    }

    // Search for component
    try {
        const features = await kbManager.searchFeatures(query, 5);

        if (features.length === 0) {
            stream.markdown(`No components found matching "${query}". Try running \`/scan\` first.`);
            return { hasCode: false };
        }

        stream.markdown(`## 💥 Impact Analysis for "${query}"\n\n`);

        for (const feature of features.slice(0, 3)) {
            const components = await kbManager.getComponentsForFeature(feature.id);
            const targetComponent = components.find(c => 
                c.name.toLowerCase().includes(query.toLowerCase())
            );

            if (targetComponent) {
                stream.markdown(`### Component: ${targetComponent.name}\n`);
                stream.markdown(`**Type:** ${targetComponent.type}\n`);
                stream.markdown(`**Feature:** ${feature.name}\n\n`);

                // Count dependents
                const dependentCount = targetComponent.dependents?.length || 0;
                if (dependentCount > 0) {
                    stream.markdown(`⚠️ **${dependentCount} component(s) depend on this**\n\n`);
                    
                    if (targetComponent.dependents) {
                        stream.markdown(`#### Components that will be affected:\n`);
                        for (const depId of targetComponent.dependents.slice(0, 10)) {
                            const depComp = components.find(c => c.id === depId);
                            if (depComp) {
                                const uri = vscode.Uri.file(depComp.filePath);
                                stream.markdown(`- [${depComp.name}](${uri.toString()}) (${depComp.type})\n`);
                                stream.reference(uri);
                            }
                        }
                        if (targetComponent.dependents.length > 10) {
                            stream.markdown(`- ... and ${targetComponent.dependents.length - 10} more\n`);
                        }
                        stream.markdown(`\n`);
                    }
                } else {
                    stream.markdown(`✅ **No direct dependents** - changes should be safe\n\n`);
                }

                // Show related features
                stream.markdown(`#### Related Features (${features.length}):\n`);
                for (const f of features.slice(0, 5)) {
                    stream.markdown(`- ${f.name}\n`);
                }
                stream.markdown(`\n`);
            }
        }

        return { hasCode: true };

    } catch (err) {
        stream.markdown(`⚠️ Impact analysis failed: ${err instanceof Error ? err.message : String(err)}`);
        return { hasCode: false };
    }
}

async function analyzeImpact(filePath: string, stream: vscode.ChatResponseStream, kbManager: KnowledgeBaseManager): Promise<void> {
    stream.markdown(`## 💥 Impact Analysis for File\n\n`);
    stream.markdown(`**File:** ${filePath}\n\n`);

    // Find all components in this file
    const features = await kbManager.searchFeatures(filePath.split('/').pop() || '', 10);
    
    const affectedComponents = new Set<string>();
    const affectedFeatures = new Set<string>();
    
    for (const feature of features) {
        const components = await kbManager.getComponentsForFeature(feature.id);
        const fileComponents = components.filter(c => c.filePath === filePath);
        
        if (fileComponents.length > 0) {
            affectedFeatures.add(feature.name);
            
            for (const comp of fileComponents) {
                if (comp.dependents) {
                    for (const depId of comp.dependents) {
                        const depComp = components.find(c => c.id === depId);
                        if (depComp) {
                            affectedComponents.add(`${depComp.name} (${depComp.type})`);
                        }
                    }
                }
            }
        }
    }

    if (affectedFeatures.size > 0) {
        stream.markdown(`### Affected Features (${affectedFeatures.size}):\n`);
        for (const featureName of affectedFeatures) {
            stream.markdown(`- ${featureName}\n`);
        }
        stream.markdown(`\n`);
    }

    if (affectedComponents.size > 0) {
        stream.markdown(`### ⚠️ Components that depend on this file (${affectedComponents.size}):\n`);
        for (const compName of Array.from(affectedComponents).slice(0, 20)) {
            stream.markdown(`- ${compName}\n`);
        }
        if (affectedComponents.size > 20) {
            stream.markdown(`- ... and ${affectedComponents.size - 20} more\n`);
        }
        stream.markdown(`\n`);
    } else {
        stream.markdown(`✅ **No direct dependents found** - changes to this file should be isolated\n\n`);
    }
}

// ─── /sessions command ─────────────────────────────────────────────

async function handleSessions(
    stream: vscode.ChatResponseStream,
    sessionManager: SessionManagerV2,
    token: vscode.CancellationToken
): Promise<void> {
    const sessions = sessionManager.getAllSessions();

    if (sessions.length === 0) {
        stream.markdown('No saved sessions found. Sessions are automatically created when you use AutoForge.');
        return;
    }

    stream.markdown(`## 💬 Conversation Sessions (${sessions.length})\n\n`);

    for (const session of sessions.slice(0, 20)) {
        const createdDate = new Date(session.createdAt).toLocaleDateString();
        const lastAccessed = new Date(session.lastAccessedAt).toLocaleString();
        const messageCount = session.metadata.totalMessages;

        stream.markdown(`### ${session.name}\n`);
        stream.markdown(`**ID:** \`${session.id}\`\n`);
        stream.markdown(`**Workspace:** ${session.workspaceFolder}\n`);
        stream.markdown(`**Created:** ${createdDate}\n`);
        stream.markdown(`**Last Used:** ${lastAccessed}\n`);
        stream.markdown(`**Messages:** ${messageCount}\n`);

        if (session.metadata.kbSnapshot) {
            stream.markdown(`**KB Snapshot:** ${session.metadata.kbSnapshot.features} features, ${session.metadata.kbSnapshot.components} components\n`);
        }

        stream.markdown(`\nTo switch to this session: \`@autoforge /session ${session.id}\`\n\n`);
        stream.markdown(`---\n\n`);
    }

    if (sessions.length > 20) {
        stream.markdown(`_...and ${sessions.length - 20} more sessions_\n`);
    }
}

// ─── /session command ──────────────────────────────────────────────

async function handleSession(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    sessionManager: SessionManagerV2,
    token: vscode.CancellationToken
): Promise<void> {
    const query = request.prompt.trim();

    if (!query) {
        // Show current session details
        const history = sessionManager.getConversationHistory();
        
        if (history.length === 0) {
            stream.markdown('No conversation history in current session.');
            return;
        }

        stream.markdown(`## 📜 Current Session History (${history.length} turns)\n\n`);

        for (const turn of history.slice(-10)) {
            const timestamp = new Date(turn.timestamp).toLocaleTimeString();
            const emoji = turn.role === 'user' ? '👤' : '🤖';
            
            stream.markdown(`### ${emoji} ${turn.role === 'user' ? 'You' : 'AutoForge'} (${timestamp})\n`);
            
            if (turn.command) {
                stream.markdown(`**Command:** \`/${turn.command}\`\n\n`);
            }
            
            if (turn.contextUsed) {
                if (turn.contextUsed.features.length > 0) {
                    stream.markdown(`**Features:** ${turn.contextUsed.features.join(', ')}\n`);
                }
                if (turn.contextUsed.files.length > 0) {
                    stream.markdown(`**Files:** ${turn.contextUsed.files.length}\n`);
                }
                stream.markdown(`\n`);
            }

            const preview = turn.content.substring(0, 200);
            stream.markdown(`${preview}${turn.content.length > 200 ? '...' : ''}\n\n`);
            stream.markdown(`---\n\n`);
        }

        return;
    }

    // Switch to specific session by ID
    const session = await sessionManager.switchSession(query);
    
    if (session) {
        stream.markdown(`✅ Switched to session: **${session.name}**\n\n`);
        stream.markdown(`**Created:** ${new Date(session.createdAt).toLocaleDateString()}\n`);
        stream.markdown(`**Messages:** ${session.metadata.totalMessages}\n\n`);
        
        if (session.conversationHistory.length > 0) {
            stream.markdown(`Recent conversation:\n\n`);
            for (const turn of session.conversationHistory.slice(-5)) {
                const emoji = turn.role === 'user' ? '👤' : '🤖';
                const preview = turn.content.substring(0, 100);
                stream.markdown(`${emoji} ${preview}${turn.content.length > 100 ? '...' : ''}\n\n`);
            }
        }
    } else {
        stream.markdown(`⚠️ Session not found: \`${query}\`\n\nUse \`/sessions\` to see all available sessions.`);
    }
}

// ─── Helper: exhaustive query detection ─────────────────────────────

/**
 * Detects queries that want ALL features/components listed,
 * e.g. "list all features", "show me every component", "what are all the services"
 */
function detectExhaustiveQuery(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    const exhaustivePatterns = [
        /\b(list|show|display|get|give)\b.*\b(all|every|each)\b/,
        /\ball\b.*\b(features?|components?|services?|controllers?|modules?)\b/,
        /\bevery\b.*\b(feature|component|service|controller|module)\b/,
        /\bhow many\b.*\b(features?|components?)\b/,
        /\bwhat are\b.*\b(the|all)\b.*\b(features?|components?)\b/,
        /\boverview of\b.*\b(the|all|entire)\b/,
        /\bfull\b.*\b(list|overview|summary)\b/,
    ];
    return exhaustivePatterns.some(p => p.test(lower));
}

// ─── Helper: model selection ───────────────────────────────────────

async function selectModel(token: vscode.CancellationToken): Promise<vscode.LanguageModelChat | undefined> {
    // Try preferred models in order
    const families = ['gpt-4o', 'gpt-4', 'gpt-3.5-turbo', 'claude-3.5-sonnet'];

    for (const family of families) {
        try {
            const models = await vscode.lm.selectChatModels({ vendor: 'copilot', family });
            if (models.length > 0) {
                return models[0];
            }
        } catch {
            // Try next family
        }
    }

    // Fallback: any copilot model
    try {
        const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        if (models.length > 0) {
            return models[0];
        }
    } catch {
        // No models available
    }

    return undefined;
}

// ─── Helper: KB status check ───────────────────────────────────────

interface KBStatus {
    isIndexed: boolean;
    shouldRefresh: boolean;
    daysSinceLastScan: number;
    totalFeatures: number;
    totalComponents: number;
}

async function checkKBStatus(kbManager: KnowledgeBaseManager): Promise<KBStatus> {
    const stats = await kbManager.getDetailedStats();
    
    const isIndexed = stats.totalFeatures > 0 || stats.totalComponents > 0;
    
    // Check if we should suggest a refresh (if indexed more than 7 days ago)
    // For now, we don't track last scan time in the DB, so just check if indexed
    const shouldRefresh = false; // Can be enhanced later with timestamp tracking
    const daysSinceLastScan = 0;
    
    return {
        isIndexed,
        shouldRefresh,
        daysSinceLastScan,
        totalFeatures: stats.totalFeatures,
        totalComponents: stats.totalComponents
    };
}

// ─── Helper: render context references ──────────────────────────────

interface ContextReferenceInfo {
    userQuery: string;
    features: Array<{
        name: string;
        componentCount: number;
        languages: string[];
        dataFlowCount: number;
    }>;
    selectionAnalyses: Array<{
        filePath: string;
        lines: string;
        language: string;
        analysisResult: string;
    }>;
    filesIncluded: Array<{
        path: string;
        size: number;
        lineCount: number;
        reason: string;
    }>;
    selectionsIncluded: Array<{
        path: string;
        lines: string;
        size: number;
        language: string;
        reason: string;
    }>;
    totalContextSize: number;
}

async function renderContextReferences(stream: vscode.ChatResponseStream, info: ContextReferenceInfo): Promise<void> {
    const totalReferences = info.features.length +
                           info.filesIncluded.length +
                           info.selectionsIncluded.length +
                           info.selectionAnalyses.length;

    if (totalReferences === 0) {
        return;
    }

    // Count total data flows across features
    const totalDataFlows = info.features.reduce((sum, f) => sum + f.dataFlowCount, 0);
    const totalComponents = info.features.reduce((sum, f) => sum + f.componentCount, 0);
    const refCount = totalReferences + (totalDataFlows > 0 ? 1 : 0);

    stream.markdown('---\n\n');
    stream.markdown(`### Used ${refCount} references\n\n`);

    // KB Features
    if (info.features.length > 0) {
        stream.markdown(`**KB Features (${info.features.length}):**\n`);
        for (const feature of info.features) {
            const langs = feature.languages.join(', ');
            stream.markdown(`- ${feature.name} (${feature.componentCount} components, ${langs})\n`);
        }
        stream.markdown(`\n`);
    }

    // Code Files
    if (info.filesIncluded.length > 0) {
        stream.markdown(`**Code Files (${info.filesIncluded.length}):**\n`);
        for (const file of info.filesIncluded) {
            const fileName = file.path.split('/').pop() || file.path;
            stream.markdown(`- ${fileName} (${file.lineCount} lines)\n`);
        }
        stream.markdown(`\n`);
    }

    // Code Selections
    if (info.selectionsIncluded.length > 0) {
        stream.markdown(`**Code Selections (${info.selectionsIncluded.length}):**\n`);
        for (const sel of info.selectionsIncluded) {
            const fileName = sel.path.split('/').pop() || sel.path;
            stream.markdown(`- ${fileName}:${sel.lines} (${sel.language})\n`);
        }
        stream.markdown(`\n`);
    }

    // Selection Analyses
    if (info.selectionAnalyses.length > 0 && info.selectionsIncluded.length === 0) {
        stream.markdown(`**Analyzed Selections (${info.selectionAnalyses.length}):**\n`);
        for (const analysis of info.selectionAnalyses) {
            const fileName = analysis.filePath.split('/').pop() || analysis.filePath;
            stream.markdown(`- ${fileName}:${analysis.lines} (${analysis.language})\n`);
        }
        stream.markdown(`\n`);
    }

    // Data Flows
    if (totalDataFlows > 0) {
        stream.markdown(`**Data Flows:** ${totalDataFlows} connections across ${info.features.length} feature${info.features.length > 1 ? 's' : ''}\n\n`);
    }

    // Summary line
    const contextSizeKB = (info.totalContextSize / 1024).toFixed(1);
    const parts: string[] = [];
    if (totalComponents > 0) { parts.push(`${totalComponents} components`); }
    if (totalDataFlows > 0) { parts.push(`${totalDataFlows} data flows`); }
    parts.push(`${contextSizeKB} KB total`);
    stream.markdown(`**Total Context:** ${parts.join(' · ')}\n\n`);

    stream.markdown('---\n\n');
}

// ─── LLM-Based Intent Detection ───────────────────────────────────

/**
 * Use Copilot LLM to understand user intent
 * Much more accurate than keyword matching!
 */
async function detectIntentWithLLM(
    userQuery: string,
    token: vscode.CancellationToken
): Promise<{ isAction: boolean; actionType?: string }> {
    try {
        const models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
        if (models.length === 0) {
            // Fallback to safe default
            return { isAction: false };
        }

        const model = models[0];
        const intentPrompt = `Analyze this user request and determine if it's:
A) An ACTION request (user wants code generated, modified, refactored, tests created, etc.)
B) A QUESTION (user wants to understand existing code, find components, learn architecture, etc.)

User request: "${userQuery}"

Respond with ONLY one word: "ACTION" or "QUESTION"`;

        const messages = [
            vscode.LanguageModelChatMessage.User(intentPrompt)
        ];

        const response = await model.sendRequest(messages, {}, token);
        let result = '';
        
        for await (const chunk of response.text) {
            result += chunk;
        }

        const answer = result.trim().toUpperCase();
        
        if (answer.includes('ACTION')) {
            // Ask follow-up to categorize action type
            const typePrompt = `What type of action is this request asking for? "${userQuery}"
            
Respond with ONE of: generate_tests, refactor, add_feature, fix_bug, optimize, document, other`;

            const typeMessages = [vscode.LanguageModelChatMessage.User(typePrompt)];
            const typeResponse = await model.sendRequest(typeMessages, {}, token);
            let actionType = '';
            
            for await (const chunk of typeResponse.text) {
                actionType += chunk;
            }

            return { 
                isAction: true, 
                actionType: actionType.trim().replace(/_/g, ' ')
            };
        }

        return { isAction: false };

    } catch (err) {
        console.error('Intent detection failed:', err);
        // Safe default: treat as question (AutoForge can always answer)
        return { isAction: false };
    }
}

// ─── /generate command: Handoff to @workspace with KB context ─────

/**
 * /generate command - Prompts user for intent and hands off to @workspace with KB context
 * 
 * This bridges the gap between AutoForge's analysis and Copilot's code generation:
 * 1. User types: /generate <what they want to create>
 * 2. Gathers KB context from recent session
 * 3. Adds conversation history
 * 4. Opens @workspace with enriched prompt in same window
 */
async function handleGenerate(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    sessionManager: SessionManagerV2,
    token: vscode.CancellationToken
): Promise<void> {
    const userIntent = request.prompt.trim();

    if (!userIntent) {
        stream.markdown('## ⚡ Generate Code with Copilot\n\n');
        stream.markdown('This command helps you generate code using GitHub Copilot with AutoForge\'s knowledge base context.\n\n');
        stream.markdown('**Usage:** `/generate <what you want to create>`\n\n');
        stream.markdown('**Examples:**\n');
        stream.markdown('- `/generate Add PostgreSQL database connection`\n');
        stream.markdown('- `/generate Create REST API endpoint for user management`\n');
        stream.markdown('- `/generate Implement authentication middleware`\n');
        stream.markdown('- `/generate Add Redis caching layer`\n\n');
        stream.markdown('💡 **Tip:** After using @autoforge to analyze your codebase, use this to generate code that follows your existing patterns!\n');
        return;
    }

    stream.progress('Gathering context from knowledge base...');

    const workspaceFolders = vscode.workspace.workspaceFolders;
    let kbContext = '';

    // 1. Query KB directly for features related to the user's intent
    try {
        const relevantFeatures = await kbManager.searchFeatures(userIntent, 5);
        if (relevantFeatures.length > 0) {
            kbContext += `\n\n## Architecture Context from AutoForge Knowledge Base\n`;
            for (const feature of relevantFeatures.slice(0, 3)) {
                kbContext += `\n### Feature: ${feature.name}\n`;
                kbContext += `${feature.description}\n`;
                kbContext += `- **Languages:** ${feature.languages.join(', ')}\n`;
                if (feature.frameworks.length > 0) {
                    kbContext += `- **Frameworks:** ${feature.frameworks.join(', ')}\n`;
                }
                kbContext += `- **Components:** ${feature.components.length}\n`;

                // Get component details for richer context
                const components = await kbManager.getComponentsForFeature(feature.id);
                if (components.length > 0) {
                    kbContext += `- **Key components:** ${components.slice(0, 5).map(c => `${c.name} (${c.type})`).join(', ')}\n`;
                }

                // Include data flows
                if (feature.flow && feature.flow.length > 0) {
                    kbContext += `- **Data flows:** ${feature.flow.length} connections\n`;
                    for (const flow of feature.flow.slice(0, 5)) {
                        const fromComp = components.find(c => c.id === flow.from);
                        const toComp = components.find(c => c.id === flow.to);
                        if (fromComp && toComp) {
                            kbContext += `  - ${fromComp.name} → ${toComp.name} (${flow.type})\n`;
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error('Failed to query KB:', err);
    }

    // 2. Get recent session context for conversational continuity
    if (workspaceFolders) {
        try {
            const session = await sessionManager.getCurrentSession(workspaceFolders[0].uri.fsPath);
            if (session && session.conversationHistory.length > 0) {
                const recentTurns = session.conversationHistory.slice(-6);

                const mentionedFeatures = new Set<string>();
                const contextSnippets: string[] = [];

                for (const turn of recentTurns) {
                    if (turn.contextUsed?.features) {
                        turn.contextUsed.features.forEach((f: string) => mentionedFeatures.add(f));
                    }
                    if (turn.content.length < 300) {
                        contextSnippets.push(`${turn.role}: ${turn.content}`);
                    }
                }

                if (mentionedFeatures.size > 0) {
                    kbContext += `\n\n## Recently Discussed Features\n${Array.from(mentionedFeatures).join(', ')}\n`;
                }

                if (contextSnippets.length > 0) {
                    kbContext += `\n\n## Recent Discussion\n`;
                    contextSnippets.slice(-4).forEach(snippet => {
                        kbContext += `- ${snippet.substring(0, 200)}\n`;
                    });
                }
            }
        } catch (err) {
            console.error('Failed to get session context:', err);
        }
    }

    // Build final prompt for @workspace
    const finalPrompt = `${userIntent}${kbContext}\n\n**Please implement this following the architectural patterns and best practices identified above.**`;

    // Show context references for what's being forwarded to @workspace
    const generateFeatureDetails: ContextReferenceInfo['features'] = [];
    try {
        const relevantFeatures = await kbManager.searchFeatures(userIntent, 5);
        for (const f of relevantFeatures.slice(0, 3)) {
            const components = await kbManager.getComponentsForFeature(f.id);
            generateFeatureDetails.push({
                name: f.name,
                componentCount: components.length,
                languages: f.languages,
                dataFlowCount: f.flow?.length || 0
            });
        }
    } catch { /* already handled above */ }

    await renderContextReferences(stream, {
        userQuery: userIntent,
        features: generateFeatureDetails,
        selectionAnalyses: [],
        filesIncluded: [],
        selectionsIncluded: [],
        totalContextSize: finalPrompt.length
    });

    stream.markdown(`## 🚀 Handing off to GitHub Copilot\n\n`);
    stream.markdown(`**Your request:** ${userIntent}\n\n`);

    if (kbContext.trim()) {
        stream.markdown(`✅ Added context from AutoForge knowledge base\n\n`);
    }

    stream.markdown(`Opening @workspace with enriched context...\n\n`);
    stream.markdown(`*The same chat window will be used - no new windows!*\n\n`);
    stream.markdown(`💡 Use the follow-up buttons below to return to AutoForge after @workspace responds.\n`);

    // Trigger workspace participant in same window
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `@workspace ${finalPrompt}`
        });

        // Post-handoff notification with return option
        vscode.window.showInformationMessage(
            'AutoForge: Context sent to @workspace. Return to AutoForge when ready.',
            'Back to AutoForge',
            'Save Pattern'
        ).then(async choice => {
            if (choice === 'Back to AutoForge') {
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: `@autoforge Continue from where we left off. I was working on: ${userIntent}`
                });
            } else if (choice === 'Save Pattern') {
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: `@autoforge /scan`
                });
            }
        });
    } catch (err) {
        stream.markdown(`\n\n⚠️ Failed to open Copilot: ${err instanceof Error ? err.message : String(err)}\n`);
        stream.markdown(`\nYou can manually type: \`@workspace ${userIntent}\``);
    }
}

// ─── /ask command (also auto-triggered by LLM intent detection) ───

/**
 * Forwards action requests to Copilot with AutoForge KB context
 * Can be called via /ask command OR automatically detected from natural language
 * 
 * Examples (all work without /ask):
 *   @autoforge generate unit tests for this code
 *   @autoforge refactor to use dependency injection
 *   @autoforge add error handling
 */
async function handleAsk(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    selectionAnalyzer: SelectionAnalyzer,
    token: vscode.CancellationToken
): Promise<void> {
    const userRequest = request.prompt.trim();

    if (!userRequest) {
        stream.markdown('## 💬 Natural Language Actions\n\n');
        stream.markdown('Just tell me what you want to do - no `/ask` needed!\n\n');
        stream.markdown('**Examples:**\n');
        stream.markdown('- `@autoforge generate unit tests for this code`\n');
        stream.markdown('- `@autoforge refactor to use dependency injection`\n');
        stream.markdown('- `@autoforge add comprehensive error handling`\n');
        stream.markdown('- `@autoforge optimize for performance`\n');
        stream.markdown('- `@autoforge add JSDoc documentation`\n\n');
        stream.markdown('💡 **Tip:** Select code or add `#file` to provide context!\n');
        return;
    }

    stream.progress(`Understanding your request...`);

    stream.progress(`Gathering KB context for your request...`);

    // Get code selection from chat references or active editor (optional now)
    const selection = await getCodeSelection(request.references);

    stream.progress(`Gathering context...`);

    let contextPrompt = `## User Request\n${userRequest}\n\n`;
    let featureCount = 0;
    let componentCount = 0;

    // If we have a code selection, analyze it
    if (selection) {
        stream.progress(`Analyzing code dependencies...`);

        try {
            const analysis = await selectionAnalyzer.analyzeSelection(selection.document, selection.range);

            contextPrompt += `## Code Context\n`;
            contextPrompt += `**File:** ${analysis.uri.fsPath}\n`;
            contextPrompt += `**Lines:** ${analysis.range.start.line + 1}-${analysis.range.end.line + 1}\n\n`;
            contextPrompt += `\`\`\`${selection.document.languageId}\n`;
            contextPrompt += selection.document.getText(selection.range);
            contextPrompt += `\n\`\`\`\n\n`;

            if (analysis.relatedFeatures.length > 0) {
                contextPrompt += `## Related Features (from Knowledge Base)\n`;
                for (const feature of analysis.relatedFeatures.slice(0, 5)) {
                    contextPrompt += `- **${feature.name}** (${(feature.confidence * 100).toFixed(0)}% confidence)\n`;
                }
                contextPrompt += `\n`;
                featureCount = analysis.relatedFeatures.length;
            }

            if (analysis.imports.length > 0) {
                contextPrompt += `## Imports\n`;
                for (const imp of analysis.imports.slice(0, 10)) {
                    contextPrompt += `- \`${imp}\`\n`;
                }
                contextPrompt += `\n`;
            }

            if (analysis.methodCalls.length > 0) {
                contextPrompt += `## Methods Called\n`;
                for (const call of analysis.methodCalls.slice(0, 10)) {
                    contextPrompt += `- \`${call}()\`\n`;
                }
                contextPrompt += `\n`;
            }

            if (analysis.relatedComponents.length > 0) {
                contextPrompt += `## Related Components\n`;
                for (const comp of analysis.relatedComponents.slice(0, 5)) {
                    contextPrompt += `- ${comp.name} (${comp.type})\n`;
                }
                contextPrompt += `\n`;
                componentCount = analysis.relatedComponents.length;
            }
        } catch (err) {
            console.error('Selection analysis failed, falling back to KB context:', err);
        }
    }

    // Always search KB for context related to the user's request (even without selection)
    if (featureCount === 0) {
        stream.progress(`Searching knowledge base for "${userRequest}"...`);
        try {
            const features = await kbManager.searchFeatures(userRequest, 5);
            if (features.length > 0) {
                contextPrompt += `## Knowledge Base Context\n`;
                for (const feature of features.slice(0, 3)) {
                    contextPrompt += `\n### Feature: ${feature.name}\n`;
                    contextPrompt += `${feature.description}\n`;
                    contextPrompt += `- **Languages:** ${feature.languages.join(', ')}\n`;
                    if (feature.frameworks.length > 0) {
                        contextPrompt += `- **Frameworks:** ${feature.frameworks.join(', ')}\n`;
                    }
                    const components = await kbManager.getComponentsForFeature(feature.id);
                    if (components.length > 0) {
                        contextPrompt += `- **Components:** ${components.slice(0, 5).map(c => `${c.name} (${c.type})`).join(', ')}\n`;
                        componentCount += components.length;
                    }
                }
                contextPrompt += `\n`;
                featureCount = features.length;
            }
        } catch (err) {
            console.error('KB search failed:', err);
        }
    }

    // Build feature details for context references display
    const askFeatureDetails: ContextReferenceInfo['features'] = [];
    try {
        const allFeatures = await kbManager.searchFeatures(userRequest, 5);
        for (const f of allFeatures.slice(0, 3)) {
            const comps = await kbManager.getComponentsForFeature(f.id);
            askFeatureDetails.push({
                name: f.name,
                componentCount: comps.length,
                languages: f.languages,
                dataFlowCount: f.flow?.length || 0
            });
        }
    } catch { /* already handled above */ }

    // Show context references for what's being forwarded
    await renderContextReferences(stream, {
        userQuery: userRequest,
        features: askFeatureDetails,
        selectionAnalyses: [],
        filesIncluded: [],
        selectionsIncluded: selection ? [{
            path: selection.document.uri.fsPath,
            lines: `${selection.range.start.line + 1}-${selection.range.end.line + 1}`,
            size: selection.document.getText(selection.range).length,
            language: selection.document.languageId,
            reason: 'Code selection'
        }] : [],
        totalContextSize: contextPrompt.length
    });

    // Forward to Copilot with @workspace
    stream.markdown(`## 🚀 Forwarding to Copilot\n\n`);
    stream.markdown(`**Your Request:** ${userRequest}\n\n`);
    stream.markdown(`Opening @workspace with enriched context...\n\n`);
    stream.markdown(`💡 Use the follow-up buttons below to return to AutoForge after @workspace responds.\n\n`);

    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `@workspace ${contextPrompt}`
        });

        // Post-handoff notification with return option
        vscode.window.showInformationMessage(
            'AutoForge: Context sent to @workspace. Return to AutoForge when ready.',
            'Back to AutoForge',
            'Analyze Code'
        ).then(async choice => {
            if (choice === 'Back to AutoForge') {
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: `@autoforge Continue from where we left off. I was working on: ${userRequest}`
                });
            } else if (choice === 'Analyze Code') {
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: `@autoforge /analyze`
                });
            }
        });
    } catch (err) {
        stream.markdown(`⚠️ Failed to open Copilot: ${err instanceof Error ? err.message : String(err)}\n\n`);
        stream.markdown(`You can manually type: \`@workspace ${userRequest}\``);
    }
}

// ─── Helper: gather workspace context ──────────────────────────────

/**
 * Gathers comprehensive workspace context including:
 * - Workspace name and location
 * - Knowledge base stats (features, components, languages)
 * - README content
 * - package.json or pom.xml content
 */
async function gatherWorkspaceContext(
    workspaceFolders: readonly vscode.WorkspaceFolder[],
    kbManager: KnowledgeBaseManager | null
): Promise<string> {
    const contextParts: string[] = [];
    
    // Add workspace info
    if (workspaceFolders.length > 0) {
        const wsFolder = workspaceFolders[0];
        contextParts.push(`📁 **Workspace:** ${wsFolder.name}`);
        contextParts.push(`📍 **Location:** ${wsFolder.uri.fsPath}`);
    }
    
    // Add KB stats if available
    if (kbManager) {
        try {
            const stats = await kbManager.getDetailedStats();
            contextParts.push(`\n📊 **Knowledge Base Stats:**`);
            contextParts.push(`- Features: ${stats.totalFeatures}`);
            contextParts.push(`- Components: ${stats.totalComponents}`);
            contextParts.push(`- Data Flows: ${stats.totalDataFlows}`);
            
            // Get languages from stats
            if (stats.featuresByLanguage) {
                const languages = Object.keys(stats.featuresByLanguage);
                if (languages.length > 0) {
                    contextParts.push(`- Languages: ${languages.join(', ')}`);
                }
            }
            
            // Get frameworks from stats
            if (stats.featuresByFramework) {
                const frameworks = Object.keys(stats.featuresByFramework);
                if (frameworks.length > 0) {
                    contextParts.push(`- Frameworks: ${frameworks.join(', ')}`);
                }
            }
            
            // Get top features
            const allFeatures = await kbManager.getAllFeatures();
            if (allFeatures.length > 0) {
                contextParts.push(`\n🎯 **Key Features:**`);
                const topFeatures = allFeatures.slice(0, 5);
                for (const feature of topFeatures) {
                    contextParts.push(`- ${feature.name}: ${feature.description || 'No description'}`);
                }
                if (allFeatures.length > 5) {
                    contextParts.push(`- ... and ${allFeatures.length - 5} more features`);
                }
            }
        } catch (err) {
            console.error('Failed to get KB stats:', err);
        }
    }
    
    // Try to read README
    if (workspaceFolders.length > 0) {
        try {
            const wsFolder = workspaceFolders[0];
            const readmePatterns = ['README.md', 'README.MD', 'readme.md', 'Readme.md'];
            
            for (const pattern of readmePatterns) {
                try {
                    const readmeUri = vscode.Uri.joinPath(wsFolder.uri, pattern);
                    const readmeContent = await vscode.workspace.fs.readFile(readmeUri);
                    const text = Buffer.from(readmeContent).toString('utf8');
                    
                    // Get first 500 characters of README
                    const preview = text.substring(0, 500).trim();
                    contextParts.push(`\n📖 **README Preview:**\n${preview}${text.length > 500 ? '...' : ''}`);
                    break;
                } catch {
                    // Try next pattern
                }
            }
        } catch (err) {
            // README not found, skip
        }
    }
    
    // Try to read package.json for npm projects
    if (workspaceFolders.length > 0) {
        try {
            const wsFolder = workspaceFolders[0];
            const packageJsonUri = vscode.Uri.joinPath(wsFolder.uri, 'package.json');
            const packageJsonContent = await vscode.workspace.fs.readFile(packageJsonUri);
            const packageJson = JSON.parse(Buffer.from(packageJsonContent).toString('utf8'));
            
            contextParts.push(`\n📦 **Package Info:**`);
            if (packageJson.name) {
                contextParts.push(`- Name: ${packageJson.name}`);
            }
            if (packageJson.version) {
                contextParts.push(`- Version: ${packageJson.version}`);
            }
            if (packageJson.description) {
                contextParts.push(`- Description: ${packageJson.description}`);
            }
            
            if (packageJson.dependencies) {
                const deps = Object.keys(packageJson.dependencies);
                if (deps.length > 0) {
                    contextParts.push(`- Dependencies: ${deps.slice(0, 5).join(', ')}${deps.length > 5 ? ', ...' : ''}`);
                }
            }
        } catch {
            // package.json not found, skip
        }
    }
    
    return contextParts.join('\n');
}

// ─── Helper: extract context from references ───────────────────────

/**
 * Extracts file content and code selections from chat prompt references.
 * Supports #file and #selection context variables.
 */
async function extractContextFromReferences(references: readonly vscode.ChatPromptReference[]): Promise<ExtractedContext> {
    const context: ExtractedContext = {
        files: [],
        selections: [],
        hasContext: false
    };

    for (const ref of references) {
        try {
            // Handle file references (#file)
            if (ref.value instanceof vscode.Uri) {
                const uri = ref.value;
                const document = await vscode.workspace.openTextDocument(uri);
                const content = document.getText();
                
                context.files.push({
                    uri,
                    content,
                    description: ref.modelDescription || `File: ${uri.fsPath}`
                });
                context.hasContext = true;
            }
            // Handle selection/range references (#selection)
            else if (ref.value instanceof vscode.Location) {
                const location = ref.value;
                const document = await vscode.workspace.openTextDocument(location.uri);
                const content = document.getText(location.range);
                
                context.selections.push({
                    uri: location.uri,
                    range: location.range,
                    content,
                    description: ref.modelDescription || `Selection from ${location.uri.fsPath}`
                });
                context.hasContext = true;
            }
            // Handle string references (could be #codebase or other context)
            else if (typeof ref.value === 'string') {
                // For now, we'll skip pure string references
                // In the future, we could use these for semantic search
            }
        } catch (err) {
            console.error(`Failed to extract context from reference:`, err);
            // Continue processing other references
        }
    }

    return context;
}

/**
 * Get code selection from either chat references or active editor
 * Returns the first available selection
 */
async function getCodeSelection(
    references: readonly vscode.ChatPromptReference[]
): Promise<{ document: vscode.TextDocument; range: vscode.Range } | null> {
    // First, check chat references for #selection
    const context = await extractContextFromReferences(references);
    if (context.selections.length > 0) {
        const sel = context.selections[0];
        const document = await vscode.workspace.openTextDocument(sel.uri);
        return { document, range: sel.range };
    }
    
    // Check if there's a file reference that we can use
    if (context.files.length > 0) {
        const file = context.files[0];
        const document = await vscode.workspace.openTextDocument(file.uri);
        // Use entire file as "selection"
        const range = new vscode.Range(0, 0, document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);
        return { document, range };
    }
    
    // Fallback: check active editor
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
        return { document: editor.document, range: editor.selection };
    }
    
    return null;
}

// ─── Helper: show follow-up suggestions ────────────────────────────


