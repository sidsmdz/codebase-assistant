import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';

export async function handleReset(
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    token: vscode.CancellationToken
): Promise<void> {
    stream.progress('Resetting knowledge base...');
    
    try {
        await kbManager.clearAllData();
        stream.markdown('✅ Knowledge base reset complete. Run `/scan` to re-index your workspace.');
    } catch (err) {
        stream.markdown(`⚠️ Failed to reset knowledge base: ${err instanceof Error ? err.message : String(err)}`);
    }
}
