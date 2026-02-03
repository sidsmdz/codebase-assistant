import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager';
import { SessionManagerV2 } from '../session/SessionManagerV2';

/**
 * CHAT PARTICIPANT V2 - SIMPLIFIED ARCHITECTURE ✨
 * 
 * DESIGN PHILOSOPHY:
 * - Piggyback on Copilot instead of competing with it
 * - Provide rich context through session management
 * - Expose knowledge base through chat variables (#kb:name)
 * - Keep commands minimal and focused
 * 
 * ONLY 5 COMMANDS:
 * ✅ /scan     - Index codebase (features + components)
 * ✅ /find     - Search knowledge base (unified search)
 * ✅ /map      - Visualize architecture (features/components)
 * ✅ /session  - Switch/create sessions with auto-context loading
 * ✅ /sessions - List all sessions with timeline view
 * 
 * REMOVED (let Copilot handle these):
 * ❌ /explain, /analyze, /generate, /implement, /ask
 * ❌ /trace, /impact, /features, /stats, /modules, /reset
 * 
 * V2 FEATURES:
 * - Sessions automatically track features, components, files
 * - Context restoration when switching sessions
 * - Timeline tracking for all interactions
 * - Chat variables for easy context injection
 */

// V2 Handlers - Only 5 essential commands
import { handleScan } from './handlers/scanHandler';
import { handleFind } from './handlers/findHandler';
import { handleMap } from './handlers/mapHandler';
import { handleSession } from './handlers/sessionHandlerV2';
import { handleSessions } from './handlers/sessionsHandlerV2';
export function registerChatParticipant(
    extContext: vscode.ExtensionContext,
    kbManager: KnowledgeBaseManager,
    sessionManagerV2: SessionManagerV2,
    onScanComplete?: () => void
): vscode.Disposable {

    // Managers are already initialized by extension.ts before this is called
    console.log('Registering AutoForge chat participant...');

    const participant = vscode.chat.createChatParticipant(
        'autoforge.chatParticipant',
        async (
            request: vscode.ChatRequest,
            chatContext: vscode.ChatContext,
            stream: vscode.ChatResponseStream,
            token: vscode.CancellationToken
        ): Promise<vscode.ChatResult> => {
            
            console.log(`[AutoForge] Request received - command: ${request.command}, prompt: ${request.prompt}`);
            
            try {
                // Route to appropriate handler based on command
                switch (request.command) {
                    case 'scan':
                        console.log('[AutoForge] Executing /scan');
                        await handleScan(stream, kbManager, token, onScanComplete);
                        return { metadata: { command: 'scan' } };

                    case 'find':
                        console.log('[AutoForge] Executing /find');
                        await handleFind(request, stream, kbManager, token);
                        return { metadata: { command: 'find' } };

                    case 'map':
                        console.log('[AutoForge] Executing /map');
                        await handleMap(request, stream, kbManager, token);
                        return { metadata: { command: 'map' } };

                    case 'session':
                        console.log('[AutoForge] Executing /session');
                        await handleSession(request, stream, sessionManagerV2, token);
                        return { metadata: { command: 'session' } };

                    case 'sessions':
                        console.log('[AutoForge] Executing /sessions');
                        await handleSessions(request, stream, sessionManagerV2, token);
                        return { metadata: { command: 'sessions' } };

                    default:
                        console.log('[AutoForge] Showing help (no command)');
                        // No command → show help
                        stream.markdown(`## 🤖 AutoForge - Context Provider for Copilot\n\n`);
                        stream.markdown(`AutoForge enhances GitHub Copilot with rich codebase context and session management.\n\n`);
                        
                        stream.markdown(`### 📖 Available Commands:\n\n`);
                        stream.markdown(`- \`/scan\` - Index codebase (features + components)\n`);
                        stream.markdown(`- \`/find <query>\` - Search knowledge base\n`);
                        stream.markdown(`- \`/map\` - Visualize architecture\n`);
                        stream.markdown(`- \`/session <name>\` - Switch/create session\n`);
                        stream.markdown(`- \`/sessions\` - List all sessions\n\n`);
                        
                        stream.markdown(`### 💡 How to Use:\n\n`);
                        stream.markdown(`1. **Index your codebase:** \`@autoforge /scan\`\n`);
                        stream.markdown(`2. **Search for features:** \`@autoforge /find authentication\`\n`);
                        stream.markdown(`3. **Create a session:** \`@autoforge /session auth-work\`\n`);
                        stream.markdown(`4. **Use with Copilot:** \`@workspace implement login based on auth-work session\`\n\n`);
                        
                        stream.markdown(`### 🎯 Key Features:\n\n`);
                        stream.markdown(`- **Automatic Context:** Sessions track features, components, and files\n`);
                        stream.markdown(`- **Timeline Tracking:** See your interaction history\n`);
                        stream.markdown(`- **Context Restoration:** Switch sessions and restore full context\n`);
                        stream.markdown(`- **Seamless Integration:** Context flows to @workspace automatically\n\n`);
                        
                        stream.markdown(`💡 **Tip:** Use \`@autoforge /find <query>\` to explore, then let \`@workspace\` handle code generation!\n`);
                        
                        return { metadata: { command: 'help' } };
                }
            } catch (error) {
                stream.markdown(`⚠️ An error occurred: ${error instanceof Error ? error.message : String(error)}`);
                console.error('Chat participant error:', error);
                return { metadata: { command: request.command, error: true } };
            }
        }
    );

    // V2 Follow-up suggestions
    participant.followupProvider = {
        provideFollowups(result: vscode.ChatResult, context: vscode.ChatContext, token: vscode.CancellationToken) {
            const command = result.metadata?.command;

            // Command-specific follow-ups
            if (command === 'scan') {
                return [
                    {
                        command: 'find',
                        prompt: 'Search for authentication features',
                        label: '🔎 Search Features'
                    },
                    {
                        command: 'map',
                        prompt: 'Show architecture map',
                        label: '🗺️ View Architecture'
                    }
                ];
            }

            if (command === 'find') {
                return [
                    {
                        command: 'session',
                        prompt: 'Create a session for this work',
                        label: '📂 Create Session'
                    },
                    {
                        prompt: '@workspace implement this feature',
                        label: '🤖 Implement with Copilot'
                    }
                ];
            }

            if (command === 'map') {
                return [
                    {
                        command: 'find',
                        prompt: 'Search for specific components',
                        label: '🔎 Search'
                    },
                    {
                        command: 'session',
                        prompt: 'Create session for this area',
                        label: '📂 Create Session'
                    }
                ];
            }

            if (command === 'session' || command === 'sessions') {
                return [
                    {
                        command: 'find',
                        prompt: 'Search knowledge base',
                        label: '🔎 Search'
                    },
                    {
                        prompt: '@workspace continue work on this session',
                        label: '🤖 Continue with Copilot'
                    }
                ];
            }

            // Default follow-ups
            return [
                {
                    command: 'find',
                    prompt: 'Search knowledge base',
                    label: '🔎 Search'
                },
                {
                    command: 'sessions',
                    prompt: 'View all sessions',
                    label: '📚 My Sessions'
                }
            ];
        }
    };

    participant.iconPath = vscode.Uri.joinPath(extContext.extensionUri, 'media', 'icon.svg');

    return participant;
}
