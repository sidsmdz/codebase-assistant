import * as fs from 'fs/promises';
import * as path from 'path';
import { SessionV2, SerializedSession, SessionSerializer } from './SessionV2';

export interface SessionStoreConfig {
    localPath: string;              // Path to .autoforge/sessions/
    autoSave: boolean;               // Auto-save after each change
}

export interface SessionMetadata {
    id: string;
    name: string;
    workspace: string;
    createdAt: string;
    lastAccessedAt: string;
    featureCount: number;
    componentCount: number;
    interactionCount: number;
}

/**
 * SessionStore - Local file-based session storage
 * 
 * Storage structure:
 * .autoforge/
 * └── sessions/
 *     ├── index.json                  # Session metadata for quick listing
 *     ├── auth-impl-123456.json       # Individual session files
 *     └── payment-feature-789.json
 */
export class SessionStore {
    private config: SessionStoreConfig;
    private sessionsDir: string;
    private indexPath: string;
    
    constructor(config: SessionStoreConfig) {
        this.config = config;
        this.sessionsDir = path.join(config.localPath, 'sessions');
        this.indexPath = path.join(this.sessionsDir, 'index.json');
    }
    
    /**
     * Initialize storage directory
     */
    async initialize(): Promise<void> {
        try {
            await fs.mkdir(this.sessionsDir, { recursive: true });
            
            // Create index if it doesn't exist
            try {
                await fs.access(this.indexPath);
            } catch {
                await this.saveIndex([]);
            }
            
            console.log('SessionStore initialized at:', this.sessionsDir);
        } catch (error) {
            console.error('Failed to initialize SessionStore:', error);
            throw error;
        }
    }
    
    /**
     * Save a session to disk
     */
    async save(session: SessionV2): Promise<void> {
        try {
            // Update last accessed
            session.lastAccessedAt = new Date();
            
            // Serialize and save
            const serialized = SessionSerializer.serialize(session);
            const filePath = this.getSessionPath(session.id);
            await fs.writeFile(
                filePath,
                JSON.stringify(serialized, null, 2),
                'utf-8'
            );
            
            // Update index
            await this.updateIndex(session);
            
            console.log(`Session saved: ${session.name} (${session.id})`);
        } catch (error) {
            console.error(`Failed to save session ${session.id}:`, error);
            throw error;
        }
    }
    
    /**
     * Load a session from disk
     */
    async load(id: string): Promise<SessionV2> {
        try {
            const filePath = this.getSessionPath(id);
            const content = await fs.readFile(filePath, 'utf-8');
            const serialized: SerializedSession = JSON.parse(content);
            
            const session = SessionSerializer.deserialize(serialized);
            session.lastAccessedAt = new Date();
            
            // Auto-save to update lastAccessedAt
            if (this.config.autoSave) {
                await this.save(session);
            }
            
            console.log(`Session loaded: ${session.name} (${session.id})`);
            return session;
        } catch (error) {
            console.error(`Failed to load session ${id}:`, error);
            throw new Error(`Session not found: ${id}`);
        }
    }
    
    /**
     * List all sessions for a workspace
     */
    async list(workspace?: string): Promise<SessionMetadata[]> {
        try {
            const index = await this.loadIndex();
            
            if (workspace) {
                return index.filter(meta => meta.workspace === workspace);
            }
            
            return index;
        } catch (error) {
            console.error('Failed to list sessions:', error);
            return [];
        }
    }
    
    /**
     * Delete a session
     */
    async delete(id: string): Promise<void> {
        try {
            const filePath = this.getSessionPath(id);
            await fs.unlink(filePath);
            
            // Remove from index
            const index = await this.loadIndex();
            const filtered = index.filter(meta => meta.id !== id);
            await this.saveIndex(filtered);
            
            console.log(`Session deleted: ${id}`);
        } catch (error) {
            console.error(`Failed to delete session ${id}:`, error);
            throw error;
        }
    }
    
    /**
     * Check if session exists
     */
    async exists(id: string): Promise<boolean> {
        try {
            const filePath = this.getSessionPath(id);
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * Find sessions by name (fuzzy match)
     */
    async findByName(name: string): Promise<SessionMetadata[]> {
        const all = await this.list();
        const lowerName = name.toLowerCase();
        return all.filter(meta => 
            meta.name.toLowerCase().includes(lowerName)
        );
    }
    
    // ==================== Private Methods ====================
    
    private getSessionPath(id: string): string {
        return path.join(this.sessionsDir, `${id}.json`);
    }
    
    private async loadIndex(): Promise<SessionMetadata[]> {
        try {
            const content = await fs.readFile(this.indexPath, 'utf-8');
            return JSON.parse(content);
        } catch {
            return [];
        }
    }
    
    private async saveIndex(index: SessionMetadata[]): Promise<void> {
        await fs.writeFile(
            this.indexPath,
            JSON.stringify(index, null, 2),
            'utf-8'
        );
    }
    
    private async updateIndex(session: SessionV2): Promise<void> {
        const index = await this.loadIndex();
        
        // Remove old entry if exists
        const filtered = index.filter(meta => meta.id !== session.id);
        
        // Add new entry
        filtered.push({
            id: session.id,
            name: session.name,
            workspace: session.workspace,
            createdAt: session.createdAt.toISOString(),
            lastAccessedAt: session.lastAccessedAt.toISOString(),
            featureCount: session.context.features.size,
            componentCount: session.context.components.size,
            interactionCount: session.timeline.length
        });
        
        // Sort by lastAccessedAt (most recent first)
        filtered.sort((a, b) => 
            new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime()
        );
        
        await this.saveIndex(filtered);
    }
}
