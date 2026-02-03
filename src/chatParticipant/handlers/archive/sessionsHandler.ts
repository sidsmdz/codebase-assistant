import * as vscode from 'vscode';
import { SessionManager } from '../../SessionManager';

export async function handleSessions(
    stream: vscode.ChatResponseStream,
    sessionManager: SessionManager,
    token: vscode.CancellationToken
): Promise<void> {
    const sessions = sessionManager.getAllSessions();

    if (sessions.length === 0) {
        stream.markdown('No saved sessions found. Sessions are automatically created when you use AutoForge.');
        return;
    }

    stream.markdown(`## 💬 Conversation Sessions (${sessions.length})\n\n`);

    for (const session of sessions.slice(0, 20)) {
        const createdDate = new Date(session.createdAt).toLocaleDateString();
        const lastAccessed = new Date(session.lastAccessedAt).toLocaleString();
        const messageCount = session.metadata.totalMessages;

        stream.markdown(`### ${session.name}\n`);
        stream.markdown(`**ID:** \`${session.id}\`\n`);
        stream.markdown(`**Workspace:** ${session.workspaceFolder}\n`);
        stream.markdown(`**Created:** ${createdDate}\n`);
        stream.markdown(`**Last Used:** ${lastAccessed}\n`);
        stream.markdown(`**Messages:** ${messageCount}\n`);

        if (session.metadata.kbSnapshot) {
            stream.markdown(`**KB Snapshot:** ${session.metadata.kbSnapshot.features} features, ${session.metadata.kbSnapshot.components} components\n`);
        }

        stream.markdown(`\nTo switch to this session: \`@autoforge /session ${session.id}\`\n\n`);
        stream.markdown(`---\n\n`);
    }

    if (sessions.length > 20) {
        stream.markdown(`_...and ${sessions.length - 20} more sessions_\n`);
    }
}
