import * as vscode from 'vscode';
import { ContextProvider, HybridContext } from '../ContextProvider';

/**
 * Add hybrid context to stream with collapsible "Thinking..." section
 * This provides transparency about what context is being used
 */
export async function addContextToStream(
    stream: vscode.ChatResponseStream,
    contextProvider: ContextProvider,
    showFull: boolean = false
): Promise<HybridContext | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return null;
    }

    try {
        // Build the hybrid context
        const context = await contextProvider.buildContext(
            editor.document,
            editor.selection.active,
            true // includeNeighbors
        );

        // Format as prompt
        const contextPrompt = contextProvider.formatAsPrompt(context);

        // Show summary in collapsible section
        stream.markdown('\n<details>\n');
        stream.markdown('<summary>🧠 <b>Context Added</b> - Active Code Graph Injected</summary>\n\n');
        
        stream.markdown('**⚡ GROUND TRUTH CONTEXT - Use these definitions without asking for clarification:**\n\n');
        
        // Context summary
        stream.markdown('**📊 Context Summary:**\n');
        stream.markdown(`- 📍 **Focal Point:** \`${context.activeCode.symbolName || 'Current selection'}\`\n`);
        stream.markdown(`- 📄 **File:** \`${vscode.workspace.asRelativePath(context.activeCode.filePath)}\` (${context.activeCode.language})\n`);
        stream.markdown(`- 🗺️ **Related Files:** ${context.skeletonMap.length} file(s) with signatures\n`);
        stream.markdown(`- 🔗 **External Dependencies:** ${context.dependencies.length} cross-file reference(s)\n`);
        if (context.lspContext.diagnostics.length > 0) {
            stream.markdown(`- ⚠️ **Diagnostics:** ${context.lspContext.diagnostics.length} issue(s) detected\n`);
        }
        stream.markdown('\n');

        if (context.skeletonMap.length > 0) {
            stream.markdown('**🗺️ Skeleton Map (Available Symbols):**\n');
            for (const file of context.skeletonMap) {
                const relativePath = vscode.workspace.asRelativePath(file.filePath);
                stream.markdown(`- \`${relativePath}\` (${file.language}) - ${file.outline.length} symbol(s)\n`);
            }
            stream.markdown('\n');
        }

        if (context.dependencies.length > 0) {
            stream.markdown('**🔗 Cross-File Dependencies (LSP Resolved):**\n');
            for (const dep of context.dependencies.slice(0, 5)) {
                const relativePath = vscode.workspace.asRelativePath(dep.filePath);
                stream.markdown(`- \`${dep.symbolName}\` → \`${relativePath}\` (${dep.language})\n`);
            }
            if (context.dependencies.length > 5) {
                stream.markdown(`- ...and ${context.dependencies.length - 5} more\n`);
            }
            stream.markdown('\n');
        }

        if (context.lspContext.diagnostics.length > 0) {
            stream.markdown('**⚠️ Active Diagnostics:**\n');
            for (const diag of context.lspContext.diagnostics.slice(0, 3)) {
                stream.markdown(`- ${diag.severity}: ${diag.message}\n`);
            }
            if (context.lspContext.diagnostics.length > 3) {
                stream.markdown(`- ...and ${context.lspContext.diagnostics.length - 3} more\n`);
            }
            stream.markdown('\n');
        }

        // Optionally show full context
        if (showFull) {
            stream.markdown('<details>\n');
            stream.markdown('<summary>📋 <b>Full Context Details</b> (click to expand)</summary>\n\n');
            stream.markdown('```markdown\n');
            stream.markdown(contextPrompt);
            stream.markdown('\n```\n');
            stream.markdown('</details>\n\n');
        }

        stream.markdown('**💡 How to use this context:**\n');
        stream.markdown('- All symbols above are DEFINITIVE - answer without requesting clarification\n');
        stream.markdown('- Cross-language references are pre-resolved (Java ↔ TypeScript)\n');
        stream.markdown('- Token efficiency: ~90% reduction vs full-file dumps\n');
        stream.markdown('</details>\n\n');

        return context;
    } catch (error) {
        console.error('Failed to build context:', error);
        stream.markdown('\n<details>\n');
        stream.markdown('<summary>⚠️ <b>Context Error</b></summary>\n\n');
        stream.markdown(`Failed to build context: ${error instanceof Error ? error.message : String(error)}\n`);
        stream.markdown('</details>\n\n');
        return null;
    }
}

/**
 * Add context summary as a badge (compact version)
 */
export function addContextBadge(
    stream: vscode.ChatResponseStream,
    context: HybridContext
): void {
    const badge = `🧠 Context: ${context.activeCode.symbolName || 'active'} + ${context.skeletonMap.length} files + ${context.dependencies.length} deps`;
    stream.markdown(`*${badge}*\n\n`);
}

/**
 * Check if we should auto-add context based on the request
 */
export function shouldAddContext(request: vscode.ChatRequest): boolean {
    // Keywords that suggest user needs code context
    const contextKeywords = [
        'explain', 'analyze', 'understand', 'what does', 'how does',
        'refactor', 'improve', 'optimize', 'fix', 'debug',
        'add', 'implement', 'create', 'modify', 'change',
        'why', 'where', 'when', 'which', 'who'
    ];

    const prompt = request.prompt.toLowerCase();
    return contextKeywords.some(keyword => prompt.includes(keyword));
}
