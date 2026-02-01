import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Represents a conversation session with context
 */
export interface Session {
    id: string;
    name: string;
    workspaceFolder: string;
    createdAt: string;
    lastAccessedAt: string;
    conversationHistory: ConversationTurn[];
    metadata: {
        totalMessages: number;
        kbSnapshot?: {
            features: number;
            components: number;
        };
    };
}

export interface ConversationTurn {
    timestamp: string;
    role: 'user' | 'assistant';
    content: string;
    command?: string;
    contextUsed?: {
        features: string[];
        files: string[];
    };
}

/**
 * Manages conversation sessions and project context
 * Similar to Claude's Projects feature
 */
export class SessionManager {
    private sessionsPath: string;
    private currentSession: Session | null = null;
    private sessions: Map<string, Session> = new Map();

    constructor(private context: vscode.ExtensionContext) {
        this.sessionsPath = path.join(context.globalStorageUri.fsPath, 'sessions');
    }

    /**
     * Initialize session manager and load existing sessions
     */
    async initialize(): Promise<void> {
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(this.sessionsPath));
            await this.loadSessions();
        } catch (err) {
            console.error('Failed to initialize SessionManager:', err);
        }
    }

    /**
     * Load all saved sessions
     */
    private async loadSessions(): Promise<void> {
        try {
            const files = await fs.readdir(this.sessionsPath);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.sessionsPath, file);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const session: Session = JSON.parse(content);
                    this.sessions.set(session.id, session);
                }
            }
            
            console.log(`Loaded ${this.sessions.size} sessions`);
        } catch (err) {
            console.error('Failed to load sessions:', err);
        }
    }

    /**
     * Get or create a session for the current workspace
     */
    async getCurrentSession(workspaceFolder: string): Promise<Session> {
        if (this.currentSession && this.currentSession.workspaceFolder === workspaceFolder) {
            return this.currentSession;
        }

        // Find existing session for this workspace
        for (const session of this.sessions.values()) {
            if (session.workspaceFolder === workspaceFolder) {
                this.currentSession = session;
                session.lastAccessedAt = new Date().toISOString();
                await this.saveSession(session);
                return session;
            }
        }

        // Create new session
        const session = await this.createSession(workspaceFolder);
        this.currentSession = session;
        return session;
    }

    /**
     * Create a new session
     */
    private async createSession(workspaceFolder: string, name?: string): Promise<Session> {
        const timestamp = new Date().toISOString();
        const session: Session = {
            id: `session-${Date.now()}`,
            name: name || `Session ${new Date().toLocaleDateString()}`,
            workspaceFolder,
            createdAt: timestamp,
            lastAccessedAt: timestamp,
            conversationHistory: [],
            metadata: {
                totalMessages: 0
            }
        };

        this.sessions.set(session.id, session);
        await this.saveSession(session);
        return session;
    }

    /**
     * Add a turn to the current session
     */
    async addTurn(
        role: 'user' | 'assistant',
        content: string,
        command?: string,
        contextUsed?: { features: string[]; files: string[] }
    ): Promise<void> {
        if (!this.currentSession) {
            return;
        }

        const turn: ConversationTurn = {
            timestamp: new Date().toISOString(),
            role,
            content,
            command,
            contextUsed
        };

        this.currentSession.conversationHistory.push(turn);
        this.currentSession.metadata.totalMessages++;
        this.currentSession.lastAccessedAt = new Date().toISOString();

        // Auto-generate descriptive title after first few turns
        if (this.currentSession.conversationHistory.length === 3 && this.currentSession.name.startsWith('Session ')) {
            this.currentSession.name = this.generateSessionTitle(this.currentSession);
        }

        // Keep only last 50 turns to avoid huge files
        if (this.currentSession.conversationHistory.length > 50) {
            this.currentSession.conversationHistory = this.currentSession.conversationHistory.slice(-50);
        }

        await this.saveSession(this.currentSession);
    }

    /**
     * Generate a descriptive session title from conversation content
     */
    private generateSessionTitle(session: Session): string {
        const features = new Set<string>();
        const commands = new Set<string>();
        let primaryFile = '';

        // Extract features, files, and commands from history
        for (const turn of session.conversationHistory.slice(0, 10)) {
            if (turn.command) {
                commands.add(turn.command);
            }
            if (turn.contextUsed?.features) {
                turn.contextUsed.features.forEach(f => features.add(f));
            }
            if (turn.contextUsed?.files && !primaryFile) {
                primaryFile = turn.contextUsed.files[0]?.split('/').pop() || '';
            }
        }

        // Build title from extracted info
        const parts: string[] = [];
        
        if (primaryFile) {
            parts.push(primaryFile.replace(/\.(java|ts|js|py)$/, ''));
        }
        
        if (features.size > 0) {
            const topFeature = Array.from(features)[0];
            if (!parts.includes(topFeature)) {
                parts.push(topFeature);
            }
        }

        if (commands.size > 0) {
            const commandList = Array.from(commands).join(', ');
            parts.push(`(${commandList})`);
        }

        if (parts.length === 0) {
            return `Session ${new Date(session.createdAt).toLocaleDateString()}`;
        }

        return parts.join(' - ').substring(0, 50);
    }

    /**
     * Get conversation history for context
     */
    getConversationHistory(limit: number = 10): ConversationTurn[] {
        if (!this.currentSession) {
            return [];
        }

        return this.currentSession.conversationHistory.slice(-limit);
    }

    /**
     * List all sessions
     */
    getAllSessions(): Session[] {
        return Array.from(this.sessions.values()).sort((a, b) => 
            new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime()
        );
    }

    /**
     * Get a specific session by ID
     */
    getSession(id: string): Session | undefined {
        return this.sessions.get(id);
    }

    /**
     * Switch to a different session
     */
    async switchSession(id: string): Promise<Session | null> {
        const session = this.sessions.get(id);
        if (session) {
            this.currentSession = session;
            session.lastAccessedAt = new Date().toISOString();
            await this.saveSession(session);
            return session;
        }
        return null;
    }

    /**
     * Rename current session
     */
    async renameSession(newName: string, sessionId?: string): Promise<void> {
        const session = sessionId ? this.sessions.get(sessionId) : this.currentSession;
        if (session) {
            session.name = newName;
            await this.saveSession(session);
        }
    }

    /**
     * Delete a session
     */
    async deleteSession(id: string): Promise<void> {
        const session = this.sessions.get(id);
        if (session) {
            this.sessions.delete(id);
            const filePath = path.join(this.sessionsPath, `${id}.json`);
            try {
                await fs.unlink(filePath);
            } catch (err) {
                console.error('Failed to delete session file:', err);
            }
        }

        if (this.currentSession?.id === id) {
            this.currentSession = null;
        }
    }

    /**
     * Clear conversation history for current session
     */
    async clearCurrentHistory(): Promise<void> {
        if (this.currentSession) {
            this.currentSession.conversationHistory = [];
            this.currentSession.metadata.totalMessages = 0;
            await this.saveSession(this.currentSession);
        }
    }

    /**
     * Save session to disk
     */
    private async saveSession(session: Session): Promise<void> {
        try {
            const filePath = path.join(this.sessionsPath, `${session.id}.json`);
            await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
        } catch (err) {
            console.error('Failed to save session:', err);
        }
    }

    /**
     * Update KB snapshot for current session
     */
    async updateKBSnapshot(features: number, components: number): Promise<void> {
        if (this.currentSession) {
            this.currentSession.metadata.kbSnapshot = { features, components };
            await this.saveSession(this.currentSession);
        }
    }

    /**
     * Export session for backup/sharing
     */
    async exportSession(id: string): Promise<string | null> {
        const session = this.sessions.get(id);
        if (session) {
            return JSON.stringify(session, null, 2);
        }
        return null;
    }

    /**
     * Import session from backup
     */
    async importSession(sessionData: string): Promise<Session | null> {
        try {
            const session: Session = JSON.parse(sessionData);
            // Generate new ID to avoid conflicts
            session.id = `session-${Date.now()}`;
            this.sessions.set(session.id, session);
            await this.saveSession(session);
            return session;
        } catch (err) {
            console.error('Failed to import session:', err);
            return null;
        }
    }
}
