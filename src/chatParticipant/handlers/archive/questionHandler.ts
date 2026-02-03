import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { ContextBuilder } from '../../knowledgeBase/ContextBuilder';
import { SelectionAnalyzer } from '../../analysis/SelectionAnalyzer';
import { SessionManager } from '../../SessionManager';
import { ExtractedContext, ContextReferenceInfo, HandlerResult } from '../types';
import {
    checkKBStatus,
    renderContextReferences,
    detectIntentWithLLM,
    extractContextFromReferences,
    selectModel,
    detectExhaustiveQuery,
    gatherWorkspaceContext
} from '../utilities/helpers';
import { detectContinuePattern, handleContinueRequest } from '../utilities/continueHandler';
import { IngestionService } from '../../ingestionService';

export async function handleQuestion(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    contextBuilder: ContextBuilder,
    selectionAnalyzer: SelectionAnalyzer,
    sessionManager: SessionManager,
    token: vscode.CancellationToken
): Promise<HandlerResult> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    // Check for "continue from where we left off" pattern
    const continueMatch = detectContinuePattern(request.prompt);
    if (continueMatch && workspaceFolders) {
        const session = await sessionManager.getCurrentSession(workspaceFolders[0].uri.fsPath);
        await handleContinueRequest(session, sessionManager, stream);
        return { hasCode: false };
    }
    
    // Better question detection - identify code generation intent
    const codeGenerationPatterns = [
        /\b(generate|create|build|implement|add|write|make)\b.*\b(code|function|class|component|service|api|endpoint|handler)\b/i,
        /\b(how (do|can) (i|we))\b.*\b(implement|create|add|build)\b/i,
        /\bcan you (help (me|us) )?(create|generate|implement|add|write)\b/i,
        /\b(refactor|optimize|improve|enhance|update)\b.*\b(this|the|my)\b/i
    ];
    
    const isCodeGeneration = codeGenerationPatterns.some(pattern => pattern.test(request.prompt));
    
    if (isCodeGeneration) {
        // Show a hint that this looks like code generation
        stream.markdown(`💡 *This looks like a code generation request. Using @workspace for best results...*\n\n`);
    }

    // Check KB status and offer to scan if needed
    const kbStatus = await checkKBStatus(kbManager);
    
    if (!kbStatus.isIndexed) {
        stream.markdown(`## 📊 Workspace Not Indexed\n\n`);
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
    for (const turn of context.history) {
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
