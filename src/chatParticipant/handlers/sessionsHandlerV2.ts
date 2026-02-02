import * as vscode from 'vscode';
import { SessionManagerV2 } from '../../session/SessionManagerV2';

/**
 * /sessions command - List and manage all sessions
 * 
 * NEW in V2: Shows rich timeline, context stats, and quick-switch
 * 
 * Examples:
 *   @autoforge /sessions              - List all sessions
 *   @autoforge /sessions --detailed   - Show detailed view with timeline
 */
export async function handleSessions(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    sessionManager: SessionManagerV2,
    token: vscode.CancellationToken
): Promise<void> {
    const args = request.prompt.trim().toLowerCase();
    const detailed = args.includes('--detailed') || args.includes('-d');
    
    try {
        stream.progress('Loading sessions...');
        
        const sessions = await sessionManager.listAllSessions();
        const currentSession = sessionManager.getCurrentSession();
        
        if (sessions.length === 0) {
            stream.markdown(`## No Sessions Found\n\n`);
            stream.markdown(`Create your first session with: \`/session <name>\`\n`);
            return;
        }
        
        stream.markdown(`## 📚 All Sessions (${sessions.length})\n\n`);
        
        // Sort sessions: current first, then by last accessed
        const sortedSessions = [...sessions].sort((a, b) => {
            if (currentSession && a.id === currentSession.id) return -1;
            if (currentSession && b.id === currentSession.id) return 1;
            return b.lastAccessed.getTime() - a.lastAccessed.getTime();
        });
        
        if (detailed) {
            // Detailed view with full context
            for (const session of sortedSessions) {
                const isCurrent = currentSession?.id === session.id;
                await renderDetailedSession(stream, session, isCurrent);
            }
        } else {
            // Compact view
            stream.markdown(`| Session | Features | Components | Files | Interactions | Last Active |\n`);
            stream.markdown(`|---------|----------|------------|-------|--------------|-------------|\n`);
            
            for (const session of sortedSessions) {
                const isCurrent = currentSession?.id === session.id;
                const name = isCurrent ? `**${session.name}** ⭐` : session.name;
                const features = session.context.features.size;
                const components = session.context.components.size;
                const files = session.context.files.size;
                const interactions = session.timeline.length;
                const lastActive = formatTimeAgo(session.lastAccessed);
                
                stream.markdown(
                    `| ${name} | ${features} | ${components} | ${files} | ${interactions} | ${lastActive} |\n`
                );
            }
            
            stream.markdown(`\n`);
        }
        
        stream.markdown(`---\n\n`);
        stream.markdown(`**Commands:**\n`);
        stream.markdown(`- \`/session <name>\` - Switch to a session\n`);
        stream.markdown(`- \`/sessions --detailed\` - Show detailed view\n`);
        
    } catch (error) {
        console.error('Sessions list error:', error);
        stream.markdown(`⚠️ Failed to list sessions: ${error instanceof Error ? error.message : String(error)}\n`);
    }
}

/**
 * Render detailed session view
 */
async function renderDetailedSession(
    stream: vscode.ChatResponseStream,
    session: any,
    isCurrent: boolean
): Promise<void> {
    const marker = isCurrent ? ' ⭐ **CURRENT**' : '';
    stream.markdown(`### 📂 ${session.name}${marker}\n\n`);
    
    // Context summary
    stream.markdown(`**Context:**\n`);
    stream.markdown(`- ${session.context.features.size} features\n`);
    stream.markdown(`- ${session.context.components.size} components\n`);
    stream.markdown(`- ${session.context.files.size} files\n`);
    stream.markdown(`- ${session.timeline.length} interactions\n`);
    stream.markdown(`- Last active: ${formatTimeAgo(session.lastAccessed)}\n\n`);
    
    // Show features
    if (session.context.features.size > 0) {
        stream.markdown(`**Features:**\n`);
        const features = Array.from(session.context.features).slice(0, 3);
        for (const feature of features) {
            stream.markdown(`- ${feature}\n`);
        }
        if (session.context.features.size > 3) {
            stream.markdown(`- ...and ${session.context.features.size - 3} more\n`);
        }
        stream.markdown(`\n`);
    }
    
    // Show components
    if (session.context.components.size > 0) {
        stream.markdown(`**Key Components:**\n`);
        const components = Array.from(session.context.components).slice(0, 5);
        for (const component of components) {
            stream.markdown(`- \`${component}\`\n`);
        }
        if (session.context.components.size > 5) {
            stream.markdown(`- ...and ${session.context.components.size - 5} more\n`);
        }
        stream.markdown(`\n`);
    }
    
    // Show recent timeline
    if (session.timeline.length > 0) {
        stream.markdown(`**Recent Activity:**\n`);
        const recentEntries = session.timeline.slice(-3).reverse();
        for (const entry of recentEntries) {
            const timeAgo = formatTimeAgo(entry.timestamp);
            const icon = getIconForType(entry.type);
            stream.markdown(`- ${icon} ${timeAgo}: ${entry.query}\n`);
        }
        stream.markdown(`\n`);
    }
    
    stream.markdown(`---\n\n`);
}

/**
 * Format timestamp as "X minutes ago"
 */
function formatTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(date).toLocaleDateString();
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
