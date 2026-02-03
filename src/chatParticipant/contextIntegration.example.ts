/**
 * EXAMPLE: Integrating ContextProvider into AutoForge Chat Participant
 * 
 * This demonstrates how to use the hybrid context approach to provide
 * structured, token-efficient context to Copilot.
 */

import * as vscode from 'vscode';
import { ContextProvider } from './ContextProvider';
import { LSPProvider } from '../indexing/LSPProvider';
import { TreeSitterWasmManager } from '../parsers/TreeSitterWasmManager';

/**
 * Example: Enhance Copilot with structured context
 * 
 * This can be integrated into the chat participant to automatically
 * provide context when users ask questions or request code generation.
 */
export async function provideContextToCopilot(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    contextProvider: ContextProvider
): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        stream.markdown('💡 Open a file to get contextual assistance.\n\n');
        return;
    }

    // Build hybrid context for current position
    const context = await contextProvider.buildContext(
        editor.document,
        editor.selection.active,
        true // includeNeighbors
    );

    // Format as structured prompt
    const contextPrompt = contextProvider.formatAsPrompt(context);

    // Stream the context to user (optional - for transparency)
    stream.markdown('## 📊 Context Analysis\n\n');
    stream.markdown('I\'ve analyzed the following context to help with your request:\n\n');
    
    // Show summary
    stream.markdown(`**Active Code:** ${context.activeCode.symbolName || 'Current selection'}\n`);
    stream.markdown(`**Related Files:** ${context.skeletonMap.length}\n`);
    stream.markdown(`**External Dependencies:** ${context.dependencies.length}\n`);
    stream.markdown(`**Diagnostics:** ${context.lspContext.diagnostics.length}\n\n`);

    // Add the full context as a reference (collapsed by default)
    stream.markdown('<details>\n');
    stream.markdown('<summary>📋 Full Context (click to expand)</summary>\n\n');
    stream.markdown('```\n');
    stream.markdown(contextPrompt);
    stream.markdown('```\n');
    stream.markdown('</details>\n\n');

    // The contextPrompt can now be passed to Copilot's API or used
    // to augment the user's request before forwarding to @workspace
}

/**
 * Example: Initialize ContextProvider in extension.ts
 */
export function initializeContextProvider(
    extensionPath: string,
    lspProvider: LSPProvider
): ContextProvider {
    const treeSitter = new TreeSitterWasmManager(extensionPath);
    return new ContextProvider(treeSitter, lspProvider);
}

/**
 * Example: Use ContextProvider on-demand
 * 
 * This can be triggered by a command like /context or automatically
 * when the user asks certain types of questions.
 */
export async function handleContextCommand(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    contextProvider: ContextProvider,
    token: vscode.CancellationToken
): Promise<void> {
    stream.progress('Building context...');

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        stream.markdown('❌ No active editor. Open a file to analyze context.\n');
        return;
    }

    try {
        // Build context
        const context = await contextProvider.buildContext(
            editor.document,
            editor.selection.active,
            true
        );

        // Format and display
        const prompt = contextProvider.formatAsPrompt(context);
        
        stream.markdown('## 🎯 Structured Context\n\n');
        stream.markdown('This is the context that will be used to assist you:\n\n');
        stream.markdown('```markdown\n');
        stream.markdown(prompt);
        stream.markdown('\n```\n\n');

        stream.markdown('💡 **Next Steps:**\n');
        stream.markdown('- Use `@workspace` to leverage this context for code generation\n');
        stream.markdown('- Ask specific questions about the code structure\n');
        stream.markdown('- Request implementations that will use the resolved dependencies\n');

    } catch (error) {
        stream.markdown(`❌ Error building context: ${error instanceof Error ? error.message : String(error)}\n`);
        console.error('Context building error:', error);
    }
}

/**
 * Example: Integration with session management
 * 
 * Sessions can store the hybrid context for restoration later
 */
export interface SessionWithContext {
    id: string;
    name: string;
    createdAt: Date;
    lastContext?: {
        activeFile: string;
        activeSymbol?: string;
        dependencies: string[];
        timestamp: Date;
    };
}

export async function saveContextToSession(
    sessionId: string,
    context: any, // HybridContext from ContextProvider
    sessionManager: any // SessionManagerV2
): Promise<void> {
    // Extract key context information to store in session
    const contextSummary = {
        activeFile: context.activeCode.filePath,
        activeSymbol: context.activeCode.symbolName,
        dependencies: context.dependencies.map((d: any) => d.filePath),
        timestamp: new Date()
    };

    // Store in session (implementation depends on SessionManagerV2 schema)
    // sessionManager.updateSessionContext(sessionId, contextSummary);
}

/**
 * Example: Auto-context on chat interactions
 * 
 * Hook into chat participant to automatically inject context
 * when users start a new conversation or switch topics
 */
export class AutoContextDecorator {
    private lastContextFile?: string;
    private lastContextSymbol?: string;

    constructor(private contextProvider: ContextProvider) {}

    /**
     * Check if context needs refresh
     */
    shouldRefreshContext(document: vscode.TextDocument, symbolName?: string): boolean {
        // Refresh if file or symbol changed
        return (
            this.lastContextFile !== document.uri.fsPath ||
            this.lastContextSymbol !== symbolName
        );
    }

    /**
     * Get fresh context and cache it
     */
    async getFreshContext(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<string> {
        const context = await this.contextProvider.buildContext(document, position, true);
        
        this.lastContextFile = context.activeCode.filePath;
        this.lastContextSymbol = context.activeCode.symbolName;

        return this.contextProvider.formatAsPrompt(context);
    }

    /**
     * Decorate user prompt with context
     */
    async decoratePrompt(userPrompt: string): Promise<string> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return userPrompt;
        }

        const context = await this.getFreshContext(
            editor.document,
            editor.selection.active
        );

        return `${context}\n\n### USER REQUEST\n${userPrompt}`;
    }
}

/**
 * Example: Register context provider as a chat participant command
 */
export function registerContextCommand(
    participant: vscode.ChatParticipant,
    contextProvider: ContextProvider
): void {
    // Add /context command to participant
    // This would be added to the switch statement in index.ts
    
    /*
    case 'context':
        console.log('[AutoForge] Executing /context');
        await handleContextCommand(request, stream, contextProvider, token);
        return { metadata: { command: 'context' } };
    */
}
