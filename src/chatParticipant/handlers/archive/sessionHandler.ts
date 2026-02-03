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
        stream.markdown(`## 🔄 Switched to Previous Session\n\n`);
        stream.markdown(`📌 **Session:** ${session.name}\n`);
        stream.markdown(`📅 **Created:** ${new Date(session.createdAt).toLocaleDateString()}\n`);
        stream.markdown(`💬 **Messages:** ${session.metadata.totalMessages}\n`);
        
        // Show KB snapshot if available
        if (session.metadata.kbSnapshot) {
            stream.markdown(`📊 **KB Snapshot:** ${session.metadata.kbSnapshot.features} features, ${session.metadata.kbSnapshot.components} components\n`);
        }
        stream.markdown(`\n`);
        
        // Show features discussed
        const history = session.conversationHistory || [];
        const featuresDiscussed = new Set<string>();
        const filesDiscussed = new Set<string>();
        
        for (const turn of history) {
            if (turn.contextUsed?.features) {
                turn.contextUsed.features.forEach((f: string) => featuresDiscussed.add(f));
            }
            if (turn.contextUsed?.files) {
                turn.contextUsed.files.forEach((f: string) => filesDiscussed.add(f));
            }
        }
        
        if (featuresDiscussed.size > 0) {
            stream.markdown(`### 🎯 Features Discussed (${featuresDiscussed.size})\n`);
            Array.from(featuresDiscussed).slice(0, 5).forEach(f => {
                stream.markdown(`- ${f}\n`);
            });
            if (featuresDiscussed.size > 5) {
                stream.markdown(`- ...and ${featuresDiscussed.size - 5} more\n`);
            }
            stream.markdown(`\n`);
        }
        
        if (filesDiscussed.size > 0) {
            stream.markdown(`### 📁 Files Discussed (${filesDiscussed.size})\n`);
            Array.from(filesDiscussed).slice(0, 3).forEach(f => {
                const fileName = f.split('/').pop() || f;
                stream.markdown(`- ${fileName}\n`);
            });
            if (filesDiscussed.size > 3) {
                stream.markdown(`- ...and ${filesDiscussed.size - 3} more\n`);
            }
            stream.markdown(`\n`);
        }
        
        // Show conversation history in collapsible section
        if (session.conversationHistory.length > 0) {
            stream.markdown(`<details>\n<summary>📜 View Conversation History (${session.conversationHistory.length} turns)</summary>\n\n`);
            for (const turn of session.conversationHistory.slice(-10)) {
                const emoji = turn.role === 'user' ? '👤' : '🤖';
                const timestamp = new Date(turn.timestamp).toLocaleTimeString();
                const preview = turn.content.substring(0, 150);
                stream.markdown(`**${emoji} ${turn.role === 'user' ? 'You' : 'AutoForge'}** (${timestamp})\n`);
                stream.markdown(`${preview}${turn.content.length > 150 ? '...' : ''}\n\n`);
            }
            stream.markdown(`</details>\n\n`);
        }
        
        stream.markdown(`💡 **You're now in this session.** All new messages will be added to this conversation history.\n`);
    } else {
        stream.markdown(`⚠️ Session not found: \`${query}\`\n\nUse \`/sessions\` to see all available sessions.`);
    }
}
