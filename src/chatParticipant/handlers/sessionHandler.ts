import * as vscode from 'vscode';
import { SessionManager } from '../../SessionManager';

export async function handleSession(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    sessionManager: SessionManager,
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
