import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager';
import { ContextBuilder } from '../knowledgeBase/ContextBuilder';
import { SelectionAnalyzer } from '../analysis/SelectionAnalyzer';
import { SessionManager } from '../SessionManager';

// Command routing
import { resolveCommandAlias } from './commandRouter';

// Handlers (gradually extract these from chatParticipant.ts)
import { handleScan } from './handlers/scanHandler';

// Import remaining handlers from old file (temporary - will extract these next)
import { 
    registerChatParticipant as legacyRegister
} from '../chatParticipant';

/**
 * NEW MODULAR ARCHITECTURE
 * 
 * This is the new entry point for the refactored chat participant.
 * We're gradually extracting handlers from the monolithic chatParticipant.ts
 * into modular files.
 * 
 * Progress:
 * ✅ Command aliases supported
 * ✅ Utilities extracted (helpers, continueHandler, disambiguator)
 * ✅ scanHandler extracted
 * 🔄 Remaining handlers: To be extracted incrementally
 */
export function registerChatParticipant(
    extContext: vscode.ExtensionContext,
    kbManager: KnowledgeBaseManager,
    sessionManager: SessionManager,
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
            
            // ✨ NEW: Resolve command aliases (/g → /generate, etc.)
            const resolvedCommand = resolveCommandAlias(request.command);
            
            // Route to appropriate handler
            // As we extract handlers, we'll replace the switch cases
            // For now, delegate to the legacy implementation for most commands
            
            if (resolvedCommand === 'scan') {
                // ✅ Using extracted handler
                await handleScan(stream, kbManager, token, onScanComplete);
                return { metadata: { command: 'scan' } };
            }
            
            // For other commands, delegate to legacy implementation
            // (We'll extract these handlers incrementally)
            const legacyParticipant = legacyRegister(extContext, kbManager, sessionManager, onScanComplete);
            
            // Create a modified request with resolved command
            const modifiedRequest = {
                ...request,
                command: resolvedCommand
            };
            
            // Call the legacy handler (temporary)
            const result = await (legacyParticipant as any)._handler(
                modifiedRequest,
                chatContext,
                stream,
                token
            );
            
            // Clean up the temporary participant
            legacyParticipant.dispose();
            
            return result;
        }
    );

    // Follow-up provider
    participant.followupProvider = {
        provideFollowups(result: vscode.ChatResult, context: vscode.ChatContext, token: vscode.CancellationToken) {
            const command = result.metadata?.command;

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

    participant.iconPath = vscode.Uri.joinPath(extContext.extensionUri, 'media', 'icon.svg');

    return participant;
}
