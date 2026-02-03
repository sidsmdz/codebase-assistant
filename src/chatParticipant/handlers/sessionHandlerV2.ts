import * as vscode from 'vscode';
import { SessionManagerV2 } from '../../session/SessionManagerV2';

/**
 * /session command - Switch to or create a session with automatic context loading
 * 
 * NEW in V2: Automatically loads rich context when switching
 * 
 * Examples:
 *   @autoforge /session                    - Show current session
 *   @autoforge /session auth-impl          - Switch to auth-impl session
 *   @autoforge /session "payment feature"  - Create/switch to payment feature session
 */
export async function handleSession(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    sessionManager: SessionManagerV2,
    token: vscode.CancellationToken
): Promise<void> {
    const sessionName = request.prompt.trim();

    // No argument: show current session
    if (!sessionName) {
        await showCurrentSession(stream, sessionManager);
        return;
    }

    try {
        stream.progress(`Switching to session "${sessionName}"...`);
        
        // Switch to or create session
        const session = await sessionManager.switchToSessionByName(sessionName);
        
        // Show session details
        stream.markdown(`## 📂 Session: ${session.name}\n\n`);
        
        const isNew = session.timeline.length === 0;
        if (isNew) {
            stream.markdown(`✨ **New session created**\n\n`);
            stream.markdown(`This session will track:\n`);
            stream.markdown(`- Features and components you explore\n`);
            stream.markdown(`- Interactions and searches\n`);
            stream.markdown(`- Files created or modified\n\n`);
            stream.markdown(`💡 Start by using \`/find\` or \`/map\` to explore the codebase!\n`);
        } else {
            // Existing session - show context
            stream.markdown(`✅ **Session loaded**\n\n`);
            
            stream.markdown(`**Context:**\n`);
            stream.markdown(`- ${session.context.features.size} features\n`);
            stream.markdown(`- ${session.context.components.size} components\n`);
            stream.markdown(`- ${session.context.files.size} files\n`);
            stream.markdown(`- ${session.timeline.length} interactions\n\n`);
            
            // Show last activity
            if (session.timeline.length > 0) {
                const lastEntry = session.timeline[session.timeline.length - 1];
                const timeAgo = formatTimeAgo(lastEntry.timestamp);
                stream.markdown(`**Last activity:** ${timeAgo}\n`);
                stream.markdown(`*${lastEntry.query}*\n\n`);
            }
            
            // Show features being worked on
            if (session.context.features.size > 0) {
                stream.markdown(`**Features in this session:**\n`);
                const features = Array.from(session.context.features).slice(0, 5);
                for (const feature of features) {
                    stream.markdown(`- ${feature}\n`);
                }
                if (session.context.features.size > 5) {
                    stream.markdown(`- ...and ${session.context.features.size - 5} more\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Show components being worked on
            if (session.context.components.size > 0) {
                stream.markdown(`**Components in this session:**\n`);
                const components = Array.from(session.context.components).slice(0, 8);
                for (const component of components) {
                    stream.markdown(`- \`${component}\`\n`);
                }
                if (session.context.components.size > 8) {
                    stream.markdown(`- ...and ${session.context.components.size - 8} more\n`);
                }
                stream.markdown(`\n`);
            }
            
            // Show recent timeline
            if (session.timeline.length > 0) {
                stream.markdown(`**Recent activity:**\n`);
                const recentEntries = session.timeline.slice(-5).reverse();
                for (const entry of recentEntries) {
                    const timeAgo = formatTimeAgo(entry.timestamp);
                    const icon = getIconForType(entry.type);
                    stream.markdown(`- ${icon} ${timeAgo}: ${entry.query}\n`);
                }
                stream.markdown(`\n`);
            }
            
            stream.markdown(`---\n\n`);
            stream.markdown(`💡 **Next steps:**\n`);
            stream.markdown(`- Use \`@workspace\` for code generation - this context will be automatically included!\n`);
            stream.markdown(`- Use \`/find\` or \`/map\` to explore more of the codebase\n`);
            stream.markdown(`- Use \`/sessions\` to see all your sessions\n`);
        }
        
    } catch (error) {
        console.error('Session switch error:', error);
        stream.markdown(`⚠️ Failed to switch session: ${error instanceof Error ? error.message : String(error)}\n`);
    }
}

/**
 * Show current session details
 */
async function showCurrentSession(
    stream: vscode.ChatResponseStream,
    sessionManager: SessionManagerV2
): Promise<void> {
    const session = sessionManager.getCurrentSessionSync();
    
    if (!session) {
        stream.markdown(`## No Active Session\n\n`);
        stream.markdown(`Create a session with: \`/session <name>\`\n`);
        return;
    }
    
    stream.markdown(`## 📂 Current Session: ${session.name}\n\n`);
    
    stream.markdown(`**Context:**\n`);
    stream.markdown(`- ${session.context.features.size} features\n`);
    stream.markdown(`- ${session.context.components.size} components\n`);
    stream.markdown(`- ${session.context.files.size} files\n`);
    stream.markdown(`- ${session.timeline.length} interactions\n\n`);
    
    if (session.timeline.length > 0) {
        const lastEntry = session.timeline[session.timeline.length - 1];
        const timeAgo = formatTimeAgo(lastEntry.timestamp);
        stream.markdown(`**Last activity:** ${timeAgo}\n\n`);
    }
    
    stream.markdown(`💡 **Tip:**\n`);
    stream.markdown(`- Switch sessions: \`/session <name>\`\n`);
    stream.markdown(`- List all sessions: \`/sessions\`\n`);
}

/**
 * Format timestamp as "X minutes ago"
 */
function formatTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) {return 'just now';}
    if (seconds < 3600) {return `${Math.floor(seconds / 60)}m ago`;}
    if (seconds < 86400) {return `${Math.floor(seconds / 3600)}h ago`;}
    return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Get icon for timeline entry type
 */
function getIconForType(type: string): string {
    switch (type) {
        case 'scan': return '🔍';
        case 'find': return '🔎';
        case 'map': return '🗺️';
        case 'query': return '💬';
        case 'variable_resolution': return '🔗';
        default: return '•';
    }
}
