import * as vscode from 'vscode';
import * as path from 'path';
import { SessionV2, createSession } from './SessionV2';
import { SessionStore } from './SessionStore';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager';

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
    private sessionsCache: Map<string, SessionV2> = new Map();
    
    constructor(
        private context: vscode.ExtensionContext,
        private kbManager?: KnowledgeBaseManager
    ) {
        const storagePath = context.globalStorageUri.fsPath;
        this.sessionStore = new SessionStore({
            localPath: storagePath,
            autoSave: true
        });
    }
    
    async initialize(): Promise<void> {
        try {
            console.log('[SessionManagerV2] Starting initialization...');
            await this.sessionStore.initialize();
            console.log('[SessionManagerV2] Session store initialized');
            
            // Load or create default session for current workspace
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const workspacePath = workspaceFolders[0].uri.fsPath;
                const workspaceName = path.basename(workspacePath);
                console.log('[SessionManagerV2] Workspace detected:', workspaceName);
                
                // Try to load last session for this workspace
                const sessions = await this.sessionStore.list(workspacePath);
                console.log('[SessionManagerV2] Found', sessions.length, 'existing sessions');
                
                // Cache all sessions for sync access
                for (const sessionMeta of sessions) {
                    try {
                        const session = await this.sessionStore.load(sessionMeta.id);
                        this.sessionsCache.set(session.id, session);
                    } catch (err) {
                        console.error(`[SessionManagerV2] Failed to load session ${sessionMeta.id}:`, err);
                    }
                }
                
                if (sessions.length > 0) {
                    // Load most recent session
                    this.currentSession = await this.sessionStore.load(sessions[0].id);
                    console.log(`[SessionManagerV2] Loaded session: ${this.currentSession.name}`);
                } else {
                    // Create default session
                    this.currentSession = createSession('default', workspacePath);
                    await this.sessionStore.save(this.currentSession);
                    this.sessionsCache.set(this.currentSession.id, this.currentSession);
                    console.log(`[SessionManagerV2] Created default session for ${workspaceName}`);
                }
            }
            console.log('[SessionManagerV2] ✅ Initialization complete');
        } catch (error) {
            console.error('[SessionManagerV2] ❌ Initialization failed:', error);
            console.error('[SessionManagerV2] Error stack:', error instanceof Error ? error.stack : error);
            throw error;
        }
    }
    
    /**
     * Get current active session
     */
    getCurrentSessionSync(): SessionV2 | null {
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
        const workspaceSessions = existing.filter((s) => s.workspace === workspacePath);
        
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
        
        return sessions.map((s) => ({
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
                if (this.kbManager) {
                    const features = await this.kbManager.searchFeatures(featureName, 1);
                    if (features.length > 0) {
                        const f = features[0];
                        context += `- **${f.name}:** ${f.description}\n`;
                        context += `  - ${f.components.length} components (${f.languages.join(', ')})\n`;
                    }
                } else {
                    context += `- ${featureName}\n`;
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
    
    /**
     * Get a specific session by ID (for extension.ts compatibility)
     */
    async getSession(id: string): Promise<SessionV2 | null> {
        try {
            return await this.sessionStore.load(id);
        } catch {
            return null;
        }
    }
    
    /**
     * Rename a session (for extension.ts compatibility)
     */
    async renameSession(newName: string, id: string): Promise<void> {
        const session = await this.sessionStore.load(id);
        session.name = newName;
        await this.sessionStore.save(session);
        
        // Update current session if it's the one being renamed
        if (this.currentSession?.id === id) {
            this.currentSession.name = newName;
        }
    }
    
    /**
     * Export a session as JSON (for extension.ts compatibility)
     */
    async exportSession(id: string): Promise<string | null> {
        try {
            const session = await this.sessionStore.load(id);
            return JSON.stringify(session, (key, value) => {
                // Convert Sets to Arrays for JSON
                if (value instanceof Set) {
                    return Array.from(value);
                }
                return value;
            }, 2);
        } catch {
            return null;
        }
    }
    
    /**
     * Import a session from JSON (for extension.ts compatibility)
     */
    async importSession(sessionData: string): Promise<SessionV2 | null> {
        try {
            const parsed = JSON.parse(sessionData);
            
            // Convert arrays back to Sets if needed
            if (parsed.context) {
                if (Array.isArray(parsed.context.features)) {
                    parsed.context.features = new Set(parsed.context.features);
                }
                if (Array.isArray(parsed.context.components)) {
                    parsed.context.components = new Set(parsed.context.components);
                }
                if (Array.isArray(parsed.context.files)) {
                    parsed.context.files = new Set(parsed.context.files);
                }
                if (Array.isArray(parsed.context.patterns)) {
                    parsed.context.patterns = new Set(parsed.context.patterns);
                }
            }
            
            // Convert string dates back to Date objects
            if (parsed.createdAt) {
                parsed.createdAt = new Date(parsed.createdAt);
            }
            if (parsed.lastAccessedAt) {
                parsed.lastAccessedAt = new Date(parsed.lastAccessedAt);
            }
            if (parsed.timeline) {
                parsed.timeline.forEach((entry: any) => {
                    if (entry.timestamp) {
                        entry.timestamp = new Date(entry.timestamp);
                    }
                });
            }
            if (parsed.messages) {
                parsed.messages.forEach((msg: any) => {
                    if (msg.timestamp) {
                        msg.timestamp = new Date(msg.timestamp);
                    }
                });
            }
            
            const session = parsed as SessionV2;
            await this.sessionStore.save(session);
            return session;
        } catch (error) {
            console.error('Failed to import session:', error);
            return null;
        }
    }
    
    /**
     * Get all sessions (for extension.ts compatibility)
     * Returns cached sessions
     */
    getAllSessions(): any[] {
        // Return simplified session list compatible with V1 interface
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }
        
        // This is a simplified sync version - extension.ts tree provider needs it
        // Return cached data in V1 format
        return Array.from(this.sessionsCache.values()).map(s => ({
            id: s.id,
            name: s.name,
            workspaceFolder: s.workspace,
            createdAt: s.createdAt.toISOString(),
            lastAccessedAt: s.lastAccessedAt.toISOString(),
            conversationHistory: [], // V1 field - not used in V2
            metadata: {
                totalMessages: s.timeline.length,
                kbSnapshot: {
                    features: s.context.features.size,
                    components: s.context.components.size
                }
            }
        }));
    }
    
    /**
     * Switch session (alias for switchToSession for V1 compatibility)
     */
    async switchSession(id: string): Promise<SessionV2 | null> {
        try {
            return await this.switchToSession(id);
        } catch {
            return null;
        }
    }
    
    /**
     * Get current session for workspace (for extension.ts compatibility)
     */
    async getCurrentSession(workspacePath: string): Promise<SessionV2 | null> {
        return this.currentSession;
    }
    
    // Helper: Format timestamp as "X minutes ago"
    private formatTimeAgo(date: Date): string {
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        
        if (seconds < 60) {return 'just now';}
        if (seconds < 3600) {return `${Math.floor(seconds / 60)}m ago`;}
        if (seconds < 86400) {return `${Math.floor(seconds / 3600)}h ago`;}
        return `${Math.floor(seconds / 86400)}d ago`;
    }
}
