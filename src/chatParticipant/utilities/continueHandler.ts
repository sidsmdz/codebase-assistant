import * as vscode from 'vscode';
import { SessionManager } from '../../SessionManager';

/**
 * Detects if user is asking to continue from where they left off
 */
export function detectContinuePattern(query: string): boolean {
    const continuePattern = /continue|resume|pick up|where (we|I) left off|last discussion|previous conversation/i;
    return continuePattern.test(query);
}

/**
 * Handles "continue from where we left off" by showing session context
 * Returns true if handled, false if should proceed with normal flow
 */
export async function handleContinueRequest(
    session: any,
    sessionManager: SessionManager,
    stream: vscode.ChatResponseStream
): Promise<boolean> {
    if (!session || session.conversationHistory.length === 0) {
        return false;
    }

    stream.markdown(`## 📋 Continuing from Last Session\n\n`);
    
    // Get last 3 user turns
    const userTurns = session.conversationHistory
        .filter((turn: any) => turn.role === 'user')
        .slice(-3);
    
    if (userTurns.length > 0) {
        stream.markdown(`### Recent Discussion:\n\n`);
        for (const turn of userTurns) {
            const preview = turn.content.length > 150 
                ? turn.content.substring(0, 147) + '...' 
                : turn.content;
            stream.markdown(`- ${preview}\n`);
        }
        stream.markdown(`\n`);
    }
    
    // Show KB context used
    const recentTurns = session.conversationHistory.slice(-5);
    const usedFeatures = new Set<string>();
    const usedCommands = new Set<string>();
    
    for (const turn of recentTurns) {
        if (turn.contextUsed?.features) {
            turn.contextUsed.features.forEach((f: string) => usedFeatures.add(f));
        }
        if (turn.contextUsed?.command) {
            usedCommands.add(turn.contextUsed.command);
        }
    }
    
    if (usedFeatures.size > 0) {
        stream.markdown(`### Knowledge Base Context Used:\n\n`);
        stream.markdown(`${Array.from(usedFeatures).slice(0, 5).join(', ')}\n\n`);
    }
    
    if (usedCommands.size > 0) {
        stream.markdown(`### Commands Used:\n\n`);
        stream.markdown(`${Array.from(usedCommands).map(c => `/${c}`).join(', ')}\n\n`);
    }
    
    // Show last mentioned file
    const lastFile = sessionManager.getLastMentionedFile();
    if (lastFile) {
        stream.markdown(`### Last File Mentioned:\n\n`);
        stream.markdown(`${lastFile}\n\n`);
    }
    
    // Show contextual follow-up suggestions
    stream.markdown(`### 💡 Suggested Actions:\n\n`);
    stream.button({
        command: 'workbench.action.chat.open',
        arguments: ['@autoforge /analyze'],
        title: '🔍 Analyze code'
    });
    stream.button({
        command: 'workbench.action.chat.open',
        arguments: ['@autoforge /trace dependencies'],
        title: '🔗 Trace dependencies'
    });
    stream.button({
        command: 'workbench.action.chat.open',
        arguments: ['@autoforge /generate tests'],
        title: '✨ Generate code'
    });
    stream.markdown(`\n`);
    
    return true;
}
