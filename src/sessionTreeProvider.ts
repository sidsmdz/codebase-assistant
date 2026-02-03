import * as vscode from 'vscode';
import { SessionManagerV2 } from './session/SessionManagerV2';

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private sessionManager: SessionManagerV2) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SessionTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: SessionTreeItem): Promise<SessionTreeItem[]> {
        if (!element) {
            // Root level - show all sessions
            const sessions = this.sessionManager.getAllSessions();
            
            if (sessions.length === 0) {
                return [];
            }

            return sessions.map(session => 
                new SessionTreeItem(
                    session as any,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    false
                )
            );
        } else if (element.session) {
            // Show session details
            return this.getSessionDetails(element.session);
        }

        return [];
    }

    private getSessionDetails(session: any): SessionTreeItem[] {
        const items: SessionTreeItem[] = [];

        // Workspace
        const workspaceName = session.workspaceFolder.split('/').pop() || session.workspaceFolder;
        items.push(new SessionTreeItem(
            session,
            vscode.TreeItemCollapsibleState.None,
            true,
            `📁 ${workspaceName}`,
            'workspace'
        ));

        // Created date
        const created = new Date(session.createdAt).toLocaleDateString();
        items.push(new SessionTreeItem(
            session,
            vscode.TreeItemCollapsibleState.None,
            true,
            `📅 Created: ${created}`,
            'date'
        ));

        // Last accessed
        const lastAccessed = new Date(session.lastAccessedAt).toLocaleDateString();
        items.push(new SessionTreeItem(
            session,
            vscode.TreeItemCollapsibleState.None,
            true,
            `🕒 Last used: ${lastAccessed}`,
            'date'
        ));

        // Message count
        items.push(new SessionTreeItem(
            session,
            vscode.TreeItemCollapsibleState.None,
            true,
            `💬 Messages: ${session.metadata.totalMessages}`,
            'count'
        ));

        // KB Snapshot if available
        if (session.metadata.kbSnapshot) {
            items.push(new SessionTreeItem(
                session,
                vscode.TreeItemCollapsibleState.None,
                true,
                `📚 KB: ${session.metadata.kbSnapshot.features} features, ${session.metadata.kbSnapshot.components} components`,
                'kb'
            ));
        }

        // Recent features discussed
        const recentFeatures = this.extractRecentFeatures(session);
        if (recentFeatures.length > 0) {
            items.push(new SessionTreeItem(
                session,
                vscode.TreeItemCollapsibleState.None,
                true,
                `🎯 Features: ${recentFeatures.slice(0, 3).join(', ')}`,
                'features'
            ));
        }

        // Recent commands used
        const recentCommands = this.extractRecentCommands(session);
        if (recentCommands.length > 0) {
            items.push(new SessionTreeItem(
                session,
                vscode.TreeItemCollapsibleState.None,
                true,
                `⚡ Commands: ${recentCommands.join(', ')}`,
                'commands'
            ));
        }

        return items;
    }

    private extractRecentFeatures(session: any): string[] {
        // SessionV2 uses context.features (Set) not conversationHistory
        if (session.context?.features) {
            return Array.from(session.context.features as Set<string>).slice(0, 10);
        }
        return [];
    }

    private extractRecentCommands(session: any): string[] {
        const commands = new Set<string>();
        // SessionV2 uses timeline entries not conversationHistory
        if (session.timeline) {
            for (const entry of session.timeline.slice(-10)) {
                commands.add(entry.type);
            }
        }
        return Array.from(commands);
    }
}

export class SessionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly session: any,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly isDetail: boolean = false,
        label?: string,
        public readonly detailType?: string
    ) {
        super(label || session.name, collapsibleState);

        if (!isDetail) {
            // Session root item
            this.tooltip = this.buildTooltip();
            this.contextValue = 'session';
            this.iconPath = new vscode.ThemeIcon('history');
            
            // Add command to switch session on click
            this.command = {
                command: 'autoforge.session.switch',
                title: 'Switch to Session',
                arguments: [session.id]
            };

            // Show indicator if this is current session
            this.description = `${session.metadata.totalMessages} messages`;
        } else {
            // Detail item
            this.contextValue = `session-detail-${detailType}`;
            this.iconPath = undefined;
        }
    }

    private buildTooltip(): string {
        const s = this.session;
        const created = new Date(s.createdAt).toLocaleString();
        const lastUsed = new Date(s.lastAccessedAt).toLocaleString();
        
        let tooltip = `${s.name}\n\n`;
        tooltip += `Created: ${created}\n`;
        tooltip += `Last used: ${lastUsed}\n`;
        tooltip += `Messages: ${s.metadata.totalMessages}\n`;
        
        if (s.metadata.kbSnapshot) {
            tooltip += `\nKB Snapshot:\n`;
            tooltip += `  Features: ${s.metadata.kbSnapshot.features}\n`;
            tooltip += `  Components: ${s.metadata.kbSnapshot.components}\n`;
        }

        return tooltip;
    }
}
