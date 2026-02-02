import * as vscode from 'vscode';
import * as path from 'path';
import { SessionV2, createSession } from '../../session/SessionV2';
import { SessionStore } from '../../session/SessionStore';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';

/**
 * Enhanced SessionManager V2
 * 
 * Key improvements:
 * - Rich context tracking (features, components, files, patterns)
 * - Timeline of interactions
 * - Auto-save after each interaction
 * - Context restoration when switching sessions
 */
export class SessionManagerV2 {
    private currentSession: SessionV2 | null = null;
    private sessionStore: SessionStore;
    
    constructor(
        private context: vscode.ExtensionContext,
        private kbManager: KnowledgeBaseManager
    ) {
        const storagePath = context.globalStorageUri.fsPath;
        this.sessionStore = new SessionStore({
            localPath: storagePath,
            autoSave: true
        });
    }
    
    async initialize(): Promise<void> {
        await this.sessionStore.initialize();
        
        // Load or create default session for current workspace
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspacePath = workspaceFolders[0].uri.fsPath;
            const workspaceName = path.basename(workspacePath);
            
            // Try to load last session for this workspace
            const sessions = await this.sessionStore.list(workspacePath);
            if (sessions.length > 0) {
                // Load most recent session
                this.currentSession = await this.sessionStore.load(sessions[0].id);
                console.log(`Loaded session: ${this.currentSession.name}`);
            } else {
                // Create default session
                this.currentSession = createSession('default', workspacePath);
                await this.sessionStore.save(this.currentSession);
                console.log(`Created default session for ${workspaceName}`);
            }
        }
    }
    
    /**
     * Get current active session
     */
    getCurrentSession(): SessionV2 | null {
        return this.currentSession;
    }
    
    /**
     * Switch to a different session by ID
     * Loads full context automatically
     */
    async switchToSession(id: string): Promise<SessionV2> {
        this.currentSession = await this.sessionStore.load(id);
        return this.currentSession;
    }
    
    /**
     * Switch to or create session by name
     */
    async switchToSessionByName(name: string): Promise<SessionV2> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder open');
        }
        
        const workspacePath = workspaceFolders[0].uri.fsPath;
        
        // Try to find existing session
        const existing = await this.sessionStore.findByName(name);
        const workspaceSessions = existing.filter(s => s.workspace === workspacePath);
        
        if (workspaceSessions.length > 0) {
            // Load existing
            return await this.switchToSession(workspaceSessions[0].id);
        } else {
            // Create new
            this.currentSession = createSession(name, workspacePath);
            await this.sessionStore.save(this.currentSession);
            return this.currentSession;
        }
    }
    
    /**
     * Create a new session
     */
    async createSession(name: string): Promise<SessionV2> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder open');
        }
        
        const workspacePath = workspaceFolders[0].uri.fsPath;
        this.currentSession = createSession(name, workspacePath);
        await this.sessionStore.save(this.currentSession);
        
        return this.currentSession;
    }
    
    /**
     * List all sessions for current workspace
     */
    async listSessions(): Promise<Array<{
        id: string;
        name: string;
        featureCount: number;
        componentCount: number;
        interactionCount: number;
        lastAccessed: Date;
        isActive: boolean;
    }>> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }
        
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const sessions = await this.sessionStore.list(workspacePath);
        
        return sessions.map(s => ({
            id: s.id,
            name: s.name,
            featureCount: s.featureCount,
            componentCount: s.componentCount,
            interactionCount: s.interactionCount,
            lastAccessed: new Date(s.lastAccessedAt),
            isActive: this.currentSession?.id === s.id
        }));
    }
    
    /**
     * Add a timeline entry to current session
     */
    async addTimelineEntry(entry: {
        type: 'scan' | 'find' | 'map' | 'query' | 'variable_resolution';
        query: string;
        kbContext: {
            features: string[];
            components: string[];
        };
        result?: string;
        filesAffected?: string[];
    }): Promise<void> {
        if (!this.currentSession) {
            return;
        }
        
        this.currentSession.timeline.push({
            timestamp: new Date(),
            ...entry
        });
        
        // Update context
        entry.kbContext.features.forEach(f => this.currentSession!.context.features.add(f));
        entry.kbContext.components.forEach(c => this.currentSession!.context.components.add(c));
        
        if (entry.filesAffected) {
            entry.filesAffected.forEach(f => this.currentSession!.context.files.add(f));
        }
        
        await this.sessionStore.save(this.currentSession);
    }
    
    /**
     * Build context string from current session
     * Used when user switches sessions
     */
    async buildSessionContext(): Promise<string> {
        if (!this.currentSession) {
            return '';
        }
        
        let context = `## Session Context: ${this.currentSession.name}\n\n`;
        
        // Features
        if (this.currentSession.context.features.size > 0) {
            context += `### Features (${this.currentSession.context.features.size})\n`;
            for (const featureName of Array.from(this.currentSession.context.features).slice(0, 5)) {
                const features = await this.kbManager.searchFeatures(featureName, 1);
                if (features.length > 0) {
                    const f = features[0];
                    context += `- **${f.name}:** ${f.description}\n`;
                    context += `  - ${f.components.length} components (${f.languages.join(', ')})\n`;
                }
            }
            context += `\n`;
        }
        
        // Components
        if (this.currentSession.context.components.size > 0) {
            context += `### Components (${this.currentSession.context.components.size})\n`;
            const components = Array.from(this.currentSession.context.components).slice(0, 10);
            for (const compName of components) {
                context += `- ${compName}\n`;
            }
            if (this.currentSession.context.components.size > 10) {
                context += `- ...and ${this.currentSession.context.components.size - 10} more\n`;
            }
            context += `\n`;
        }
        
        // Recent interactions
        if (this.currentSession.timeline.length > 0) {
            context += `### Recent Activity\n`;
            const recentEntries = this.currentSession.timeline.slice(-3);
            for (const entry of recentEntries) {
                const timeAgo = this.formatTimeAgo(entry.timestamp);
                context += `- ${timeAgo}: ${entry.query}\n`;
            }
            context += `\n`;
        }
        
        return context;
    }
    
    /**
     * Delete a session
     */
    async deleteSession(id: string): Promise<void> {
        await this.sessionStore.delete(id);
        
        // If we deleted the current session, switch to another
        if (this.currentSession?.id === id) {
            const sessions = await this.listSessions();
            if (sessions.length > 0) {
                await this.switchToSession(sessions[0].id);
            } else {
                // Create new default session
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders) {
                    this.currentSession = createSession('default', workspaceFolders[0].uri.fsPath);
                    await this.sessionStore.save(this.currentSession);
                }
            }
        }
    }
    
    // Helper: Format timestamp as "X minutes ago"
    private formatTimeAgo(date: Date): string {
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }
}
