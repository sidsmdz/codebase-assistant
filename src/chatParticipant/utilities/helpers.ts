import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { ExtractedContext, KBStatus, ContextReferenceInfo, IntentResult } from '../types';

/**
 * Detects if a query wants ALL features/components listed
 */
export function detectExhaustiveQuery(prompt: string): boolean {
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

/**
 * Select best available Copilot language model
 */
export async function selectModel(token: vscode.CancellationToken): Promise<vscode.LanguageModelChat | undefined> {
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

/**
 * Check knowledge base indexing status
 */
export async function checkKBStatus(kbManager: KnowledgeBaseManager): Promise<KBStatus> {
    const stats = await kbManager.getDetailedStats();
    
    const isIndexed = stats.totalFeatures > 0 || stats.totalComponents > 0;
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

/**
 * Render context references used in response (like Copilot's "Used N references")
 */
export async function renderContextReferences(stream: vscode.ChatResponseStream, info: ContextReferenceInfo): Promise<void> {
    const totalReferences = info.features.length +
                           info.filesIncluded.length +
                           info.selectionsIncluded.length +
                           info.selectionAnalyses.length;

    if (totalReferences === 0) {
        return;
    }

    const totalDataFlows = info.features.reduce((sum: number, f: any) => sum + f.dataFlowCount, 0);
    const totalComponents = info.features.reduce((sum: number, f: any) => sum + f.componentCount, 0);
    const refCount = totalReferences + (totalDataFlows > 0 ? 1 : 0);

    stream.markdown('---\n\n');
    stream.markdown(`### Used ${refCount} references\n\n`);

    if (info.features.length > 0) {
        stream.markdown(`**KB Features (${info.features.length}):**\n`);
        for (const feature of info.features) {
            const langs = feature.languages.join(', ');
            stream.markdown(`- ${feature.name} (${feature.componentCount} components, ${langs})\n`);
        }
        stream.markdown(`\n`);
    }

    if (info.filesIncluded.length > 0) {
        stream.markdown(`**Code Files (${info.filesIncluded.length}):**\n`);
        for (const file of info.filesIncluded) {
            const fileName = file.path.split('/').pop() || file.path;
            stream.markdown(`- ${fileName} (${file.lineCount} lines)\n`);
        }
        stream.markdown(`\n`);
    }

    if (info.selectionsIncluded.length > 0) {
        stream.markdown(`**Code Selections (${info.selectionsIncluded.length}):**\n`);
        for (const sel of info.selectionsIncluded) {
            const fileName = sel.path.split('/').pop() || sel.path;
            stream.markdown(`- ${fileName}:${sel.lines} (${sel.language})\n`);
        }
        stream.markdown(`\n`);
    }

    if (info.selectionAnalyses.length > 0 && info.selectionsIncluded.length === 0) {
        stream.markdown(`**Analyzed Selections (${info.selectionAnalyses.length}):**\n`);
        for (const analysis of info.selectionAnalyses) {
            const fileName = analysis.filePath.split('/').pop() || analysis.filePath;
            stream.markdown(`- ${fileName}:${analysis.lines} (${analysis.language})\n`);
        }
        stream.markdown(`\n`);
    }

    if (totalDataFlows > 0) {
        stream.markdown(`**Data Flows:** ${totalDataFlows} connections across ${info.features.length} feature${info.features.length > 1 ? 's' : ''}\n\n`);
    }

    const contextSizeKB = (info.totalContextSize / 1024).toFixed(1);
    const parts: string[] = [];
    if (totalComponents > 0) { parts.push(`${totalComponents} components`); }
    if (totalDataFlows > 0) { parts.push(`${totalDataFlows} data flows`); }
    parts.push(`${contextSizeKB} KB total`);
    stream.markdown(`**Total Context:** ${parts.join(' · ')}\n\n`);

    stream.markdown('---\n\n');
}

/**
 * Use Copilot LLM to detect user intent (action vs question)
 */
export async function detectIntentWithLLM(
    userQuery: string,
    token: vscode.CancellationToken
): Promise<IntentResult> {
    try {
        const models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
        if (models.length === 0) {
            return { isAction: false };
        }

        const model = models[0];
        const intentPrompt = `Analyze this user request and determine if it's:
A) An ACTION request (user wants code generated, modified, refactored, tests created, etc.)
B) A QUESTION (user wants to understand existing code, find components, learn architecture, etc.)

User request: "${userQuery}"

Respond with ONLY one word: "ACTION" or "QUESTION"`;

        const messages = [vscode.LanguageModelChatMessage.User(intentPrompt)];
        const response = await model.sendRequest(messages, {}, token);
        let result = '';
        
        for await (const chunk of response.text) {
            result += chunk;
        }

        const answer = result.trim().toUpperCase();
        
        if (answer.includes('ACTION')) {
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
        return { isAction: false };
    }
}

/**
 * Extract context from chat references (#file, #selection, etc.)
 */
export async function extractContextFromReferences(references: readonly vscode.ChatPromptReference[]): Promise<ExtractedContext> {
    const context: ExtractedContext = {
        files: [],
        selections: [],
        hasContext: false
    };

    for (const ref of references) {
        try {
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
        } catch (err) {
            console.error(`Failed to extract context from reference:`, err);
        }
    }

    return context;
}

/**
 * Get code selection from chat references or active editor
 * SMART FALLBACK: Tries chat refs first, then active editor
 */
export async function getCodeSelection(
    references: readonly vscode.ChatPromptReference[]
): Promise<{ document: vscode.TextDocument; range: vscode.Range } | null> {
    // Priority 1: Chat references (#selection, #file)
    const context = await extractContextFromReferences(references);
    if (context.selections.length > 0) {
        const sel = context.selections[0];
        const document = await vscode.workspace.openTextDocument(sel.uri);
        return { document, range: sel.range };
    }
    
    if (context.files.length > 0) {
        const file = context.files[0];
        const document = await vscode.workspace.openTextDocument(file.uri);
        const range = new vscode.Range(0, 0, document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);
        return { document, range };
    }
    
    // Priority 2: Active editor selection or full file
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        if (!editor.selection.isEmpty) {
            return { document: editor.document, range: editor.selection };
        }
        // Use full file if no selection
        const range = new vscode.Range(0, 0, editor.document.lineCount - 1, 
            editor.document.lineAt(editor.document.lineCount - 1).text.length);
        return { document: editor.document, range };
    }
    
    return null;
}

/**
 * Gather workspace context (name, stats, README, package.json)
 */
export async function gatherWorkspaceContext(
    workspaceFolders: readonly vscode.WorkspaceFolder[],
    kbManager: KnowledgeBaseManager
): Promise<string> {
    const workspaceFolder = workspaceFolders[0];
    const workspaceName = workspaceFolder.name;
    
    let context = `# Workspace: ${workspaceName}\n\n`;
    
    try {
        const stats = await kbManager.getDetailedStats();
        context += `## Knowledge Base Stats\n`;
        context += `- Features: ${stats.totalFeatures}\n`;
        context += `- Components: ${stats.totalComponents}\n`;
        context += `- Data Flows: ${stats.totalDataFlows}\n`;
        context += `- Indexed Files: ${stats.indexedFiles}\n\n`;
    } catch (err) {
        console.error('Failed to get KB stats:', err);
    }
    
    try {
        const readmeUri = vscode.Uri.joinPath(workspaceFolder.uri, 'README.md');
        const readmeDoc = await vscode.workspace.openTextDocument(readmeUri);
        const readmeContent = readmeDoc.getText().substring(0, 2000);
        context += `## README\n\n${readmeContent}\n\n`;
    } catch {
        // README not found
    }
    
    try {
        const packageUri = vscode.Uri.joinPath(workspaceFolder.uri, 'package.json');
        const packageDoc = await vscode.workspace.openTextDocument(packageUri);
        const packageContent = packageDoc.getText().substring(0, 1000);
        context += `## package.json\n\n\`\`\`json\n${packageContent}\n\`\`\`\n\n`;
    } catch {
        // package.json not found
    }
    
    return context;
}
