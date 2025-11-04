import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SavedPattern {
    id: string;
    name: string;
    language: string;
    type: 'controller' | 'service' | 'repository' | 'component';
    code: string;
    description: string;
    query: string; // Original user query
    savedAt: string;
    tags: string[];
}

export interface KBMetadata {
    version: string;
    createdAt: string;
    lastUpdated: string;
    featureCount: number;
    patterns: SavedPattern[];
}

export class KnowledgeBaseManager {
    private kbPath: string;
    private indexPath: string;
    private patternsPath: string;

    constructor(private context: vscode.ExtensionContext) {
        this.kbPath = context.globalStorageUri.fsPath;
        this.indexPath = path.join(this.kbPath, 'index.json');
        this.patternsPath = path.join(this.kbPath, 'patterns');
    }

    async initialize(): Promise<void> {
        try {
            await fs.mkdir(this.kbPath, { recursive: true });
            await fs.mkdir(this.patternsPath, { recursive: true });

            try {
                await fs.access(this.indexPath);
                console.log('Knowledge base already initialized');
            } catch {
                const initialMetadata: KBMetadata = {
                    version: '1.0.0',
                    createdAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    featureCount: 0,
                    patterns: []
                };
                await this.saveMetadata(initialMetadata);
                console.log('Knowledge base initialized at:', this.kbPath);
            }

            vscode.window.showInformationMessage(`OpenCat KB ready`);
        } catch (error) {
            console.error('Failed to initialize KB:', error);
            throw error;
        }
    }

   async getMetadata(): Promise<KBMetadata> {
    const data = await fs.readFile(this.indexPath, 'utf-8');
    const metadata = JSON.parse(data);
    
    // Ensure patterns array exists (for backward compatibility)
    if (!metadata.patterns) {
        metadata.patterns = [];
    }
    
    return metadata;
}
    private async saveMetadata(metadata: KBMetadata): Promise<void> {
        await fs.writeFile(this.indexPath, JSON.stringify(metadata, null, 2), 'utf-8');
    }

    getKBPath(): string {
        return this.kbPath;
    }

    async getStats(): Promise<{ featureCount: number; patternCount: number; path: string }> {
        const metadata = await this.getMetadata();
        
        return {
            featureCount: metadata.featureCount,
            patternCount: metadata.patterns.length,
            path: this.kbPath
        };
    }

    async savePattern(pattern: Omit<SavedPattern, 'id' | 'savedAt'>): Promise<SavedPattern> {
    const metadata = await this.getMetadata();
    
    const savedPattern: SavedPattern = {
        ...pattern,
        id: this.generatePatternId(),
        savedAt: new Date().toISOString()
    };

    // Save pattern file
    const patternFile = path.join(this.patternsPath, `${savedPattern.id}.json`);
    await fs.writeFile(patternFile, JSON.stringify(savedPattern, null, 2), 'utf-8');

    // Ensure patterns array exists
    if (!metadata.patterns) {
        metadata.patterns = [];
    }

    // Update metadata
    metadata.patterns.push(savedPattern);
    metadata.lastUpdated = new Date().toISOString();
    await this.saveMetadata(metadata);

    console.log(`Saved pattern: ${savedPattern.name}`);
    return savedPattern;
}

    async searchPatterns(query: string): Promise<SavedPattern[]> {
        const metadata = await this.getMetadata();
        const queryLower = query.toLowerCase();

        return metadata.patterns.filter(p => 
            p.name.toLowerCase().includes(queryLower) ||
            p.description.toLowerCase().includes(queryLower) ||
            p.type.toLowerCase().includes(queryLower) ||
            p.tags.some(t => t.toLowerCase().includes(queryLower))
        );
    }

    async getAllPatterns(): Promise<SavedPattern[]> {
        const metadata = await this.getMetadata();
        return metadata.patterns;
    }

    async deletePattern(patternId: string): Promise<void> {
        const metadata = await this.getMetadata();
        
        // Remove from metadata
        metadata.patterns = metadata.patterns.filter(p => p.id !== patternId);
        metadata.lastUpdated = new Date().toISOString();
        await this.saveMetadata(metadata);

        // Delete file
        const patternFile = path.join(this.patternsPath, `${patternId}.json`);
        try {
            await fs.unlink(patternFile);
        } catch (error) {
            console.error('Failed to delete pattern file:', error);
        }
    }

    private generatePatternId(): string {
        return `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}