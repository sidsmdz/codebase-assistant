import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { ContextBuilder } from '../../knowledgeBase/ContextBuilder';
import { SelectionAnalyzer } from '../../analysis/SelectionAnalyzer';
import { SessionManager } from '../../SessionManager';
import { HandlerResult } from '../types';
import { selectModel, getCodeSelection } from '../utilities/helpers';
import { showDisambiguationUI, checkDisambiguationResponse } from '../utilities/disambiguator';

export async function handleExplain(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    contextBuilder: ContextBuilder,
    selectionAnalyzer: SelectionAnalyzer,
    sessionManager: SessionManager,
    token: vscode.CancellationToken
): Promise<HandlerResult> {
    const query = request.prompt.trim();

    // Check if user is responding to a disambiguation prompt
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        const session = await sessionManager.getCurrentSession(workspaceFolders[0].uri.fsPath);
        const disambiguationResponse = await checkDisambiguationResponse(query, sessionManager);
        
        if (disambiguationResponse) {
            const pendingOptions = sessionManager.getPendingDisambiguation();
            if (pendingOptions && Array.isArray(pendingOptions)) {
                const selectedFeature = pendingOptions[disambiguationResponse.featureIndex];
                stream.progress(`Explaining ${selectedFeature.name}...`);
                
                // Rebuild prompt with selected feature
                const enrichedPrompt = await contextBuilder.buildContextForQuery(
                    `Explain in detail the following aspect of this codebase: ${selectedFeature.name}`
                );
                
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
                    return { hasCode: false };
                } catch (err) {
                    if (err instanceof vscode.LanguageModelError) {
                        stream.markdown(`⚠️ Model error: ${err.message}`);
                    } else {
                        throw err;
                    }
                    return { hasCode: false };
                }
            }
        }
    }

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

    const features = await kbManager.searchFeatures(query, 5);
    if (features.length === 0) {
        stream.markdown(`No features found matching "${query}". Try running \`/scan\` first, or ask a more general question.`);
        return { hasCode: false };
    }

    // Show disambiguation UI if 2-5 features match
    if (workspaceFolders && features.length >= 2 && features.length <= 5) {
        const session = await sessionManager.getCurrentSession(workspaceFolders[0].uri.fsPath);
        const shown = await showDisambiguationUI(features, query, session, sessionManager, kbManager, stream);
        if (shown) {
            return { hasCode: false };
        }
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
