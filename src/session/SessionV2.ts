/**
 * SessionV2 - Enhanced session model with rich context tracking
 * 
 * Key improvements over V1:
 * - Rich context: tracks features, components, files, patterns
 * - Timeline: step-by-step interaction history
 * - KB references: what knowledge was used in each message
 * - Auto-tracking: captures interactions automatically
 */

export interface TimelineEntry {
    timestamp: Date;
    type: 'scan' | 'find' | 'map' | 'query' | 'variable_resolution';
    query: string;
    
    // What KB context was used
    kbContext: {
        features: string[];
        components: string[];
    };
    
    // What was the result/outcome
    result?: string;
    
    // Files that were created/modified
    filesAffected?: string[];
}

export interface EnrichedMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    
    // KB references used in this message
    kbReferences?: {
        features: Array<{
            id: string;
            name: string;
            componentCount: number;
        }>;
        components: Array<{
            id: string;
            name: string;
            type: string;
            filePath: string;
        }>;
    };
}

export interface SessionContext {
    // Unique items discovered/used in this session
    features: Set<string>;      // Feature names
    components: Set<string>;    // Component names
    files: Set<string>;         // File paths touched
    patterns: Set<string>;      // Patterns/frameworks used
}

export interface SessionV2 {
    // Identity
    id: string;
    name: string;
    workspace: string;
    
    // Timestamps
    createdAt: Date;
    lastAccessedAt: Date;
    
    // Rich context (accumulated over time)
    context: SessionContext;
    
    // Step-by-step timeline
    timeline: TimelineEntry[];
    
    // Enhanced message history
    messages: EnrichedMessage[];
    
    // Metadata
    metadata?: {
        description?: string;
        tags?: string[];
        author?: string;
    };
}

/**
 * Serializable version for JSON storage
 */
export interface SerializedSession {
    id: string;
    name: string;
    workspace: string;
    createdAt: string;
    lastAccessedAt: string;
    
    context: {
        features: string[];
        components: string[];
        files: string[];
        patterns: string[];
    };
    
    timeline: Array<Omit<TimelineEntry, 'timestamp'> & { timestamp: string }>;
    messages: Array<Omit<EnrichedMessage, 'timestamp'> & { timestamp: string }>;
    metadata?: {
        description?: string;
        tags?: string[];
        author?: string;
    };
}

/**
 * Helper functions for session serialization
 */
export class SessionSerializer {
    static serialize(session: SessionV2): SerializedSession {
        return {
            id: session.id,
            name: session.name,
            workspace: session.workspace,
            createdAt: session.createdAt.toISOString(),
            lastAccessedAt: session.lastAccessedAt.toISOString(),
            
            context: {
                features: Array.from(session.context.features),
                components: Array.from(session.context.components),
                files: Array.from(session.context.files),
                patterns: Array.from(session.context.patterns)
            },
            
            timeline: session.timeline.map(entry => ({
                ...entry,
                timestamp: entry.timestamp.toISOString()
            })),
            
            messages: session.messages.map(msg => ({
                ...msg,
                timestamp: msg.timestamp.toISOString()
            })),
            
            metadata: session.metadata
        };
    }
    
    static deserialize(data: SerializedSession): SessionV2 {
        return {
            id: data.id,
            name: data.name,
            workspace: data.workspace,
            createdAt: new Date(data.createdAt),
            lastAccessedAt: new Date(data.lastAccessedAt),
            
            context: {
                features: new Set(data.context.features),
                components: new Set(data.context.components),
                files: new Set(data.context.files),
                patterns: new Set(data.context.patterns)
            },
            
            timeline: data.timeline.map(entry => ({
                ...entry,
                timestamp: new Date(entry.timestamp)
            })),
            
            messages: data.messages.map(msg => ({
                ...msg,
                timestamp: new Date(msg.timestamp)
            })),
            
            metadata: data.metadata
        };
    }
}

/**
 * Create a new empty session
 */
export function createSession(name: string, workspace: string): SessionV2 {
    const now = new Date();
    return {
        id: `${name}-${Date.now()}`,
        name,
        workspace,
        createdAt: now,
        lastAccessedAt: now,
        context: {
            features: new Set(),
            components: new Set(),
            files: new Set(),
            patterns: new Set()
        },
        timeline: [],
        messages: []
    };
}
