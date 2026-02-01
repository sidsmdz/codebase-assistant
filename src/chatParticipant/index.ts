import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager';
import { ContextBuilder } from '../knowledgeBase/ContextBuilder';
import { SelectionAnalyzer } from '../analysis/SelectionAnalyzer';
import { SessionManager } from '../SessionManager';

// Command routing
import { resolveCommandAlias } from './commandRouter';

// Handlers - All extracted!
import { handleScan } from './handlers/scanHandler';
import { handleExplain } from './handlers/explainHandler';
import { handleAnalyze } from './handlers/analyzeHandler';
import { handleFeatures } from './handlers/featuresHandler';
import { handleStats } from './handlers/statsHandler';
import { handleReset } from './handlers/resetHandler';
import { handleTrace } from './handlers/traceHandler';
import { handleImpact } from './handlers/impactHandler';
import { handleSessions } from './handlers/sessionsHandler';
import { handleSession } from './handlers/sessionHandler';
import { handleGenerate } from './handlers/generateHandler';
import { handleAsk } from './handlers/askHandler';
import { handleQuestion } from './handlers/questionHandler';
import { handleModules } from './handlers/modulesHandler';

/**
 * MODULAR ARCHITECTURE - COMPLETE ✅
 * 
 * All handlers have been successfully extracted from the monolithic chatParticipant.ts.
 * 
 * Completed:
 * ✅ Command aliases supported (/g, /e, /a, /i, /t, /s, /f)
 * ✅ All utilities extracted (helpers, continueHandler, disambiguator)
 * ✅ All 13 handlers extracted:
 *    - scanHandler, explainHandler, analyzeHandler, featuresHandler, statsHandler
 *    - resetHandler, traceHandler, impactHandler, sessionsHandler, sessionHandler
 *    - generateHandler, askHandler, questionHandler
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
            
            // ✨ Resolve command aliases (/g → /generate, /e → /explain, etc.)
            const resolvedCommand = resolveCommandAlias(request.command);
            
            try {
                // Route to appropriate handler based on command
                switch (resolvedCommand) {
                    case 'scan':
                        await handleScan(stream, kbManager, token, onScanComplete);
                        return { metadata: { command: 'scan' } };

                    case 'explain':
                        await handleExplain(request, stream, kbManager, contextBuilder, selectionAnalyzer, sessionManager, token);
                        return { metadata: { command: 'explain' } };

                    case 'analyze':
                        await handleAnalyze(request, stream, kbManager, selectionAnalyzer, token);
                        return { metadata: { command: 'analyze' } };

                    case 'features':
                        await handleFeatures(stream, kbManager, token);
                        return { metadata: { command: 'features' } };

                    case 'stats':
                        await handleStats(stream, kbManager, token);
                        return { metadata: { command: 'stats' } };

                    case 'reset':
                        await handleReset(stream, kbManager, token);
                        return { metadata: { command: 'reset' } };

                    case 'trace':
                        await handleTrace(request, stream, kbManager, selectionAnalyzer, token);
                        return { metadata: { command: 'trace' } };

                    case 'impact':
                        await handleImpact(request, stream, kbManager, selectionAnalyzer, token);
                        return { metadata: { command: 'impact' } };

                    case 'sessions':
                        await handleSessions(stream, sessionManager, token);
                        return { metadata: { command: 'sessions' } };

                    case 'session':
                        await handleSession(request, stream, sessionManager, token);
                        return { metadata: { command: 'session' } };

                    case 'generate':
                        await handleGenerate(request, stream, kbManager, sessionManager, token);
                        return { metadata: { command: 'generate' } };

                    case 'ask':
                        await handleAsk(request, stream, kbManager, selectionAnalyzer, token);
                        return { metadata: { command: 'ask' } };

                    case 'modules':
                        const modulesResult = await handleModules(request, stream, kbManager, token);
                        return { metadata: { command: 'modules', hasCode: modulesResult.hasCode } };

                    default:
                        // No command or unrecognized command → handle as question
                        const result = await handleQuestion(request, chatContext, stream, kbManager, contextBuilder, selectionAnalyzer, sessionManager, token);
                        return { 
                            metadata: { 
                                command: 'question',
                                ...result.analysisContext
                            } 
                        };
                }
            } catch (error) {
                stream.markdown(`⚠️ An error occurred: ${error instanceof Error ? error.message : String(error)}`);
                console.error('Chat participant error:', error);
                return { metadata: { command: resolvedCommand, error: true } };
            }
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
