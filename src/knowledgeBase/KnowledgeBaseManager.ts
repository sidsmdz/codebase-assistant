import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface KBMetadata {
    version: string;
    createdAt: string;
    lastUpdated: string;
    fileCount: number;
    files: KBFileEntry[];
}

export interface KBFileEntry {
    id: string;
    filename: string;
    relativePath: string;
    language: string;
    uploadedAt: string;
    tags: string[];
    size: number;
}

export class KnowledgeBaseManager {
    private kbPath: string;
    private filesPath: string;
    private indexPath: string;

    constructor(private context: vscode.ExtensionContext) {
        // Use globalStorageUri for persistent storage
        this.kbPath = context.globalStorageUri.fsPath;
        this.filesPath = path.join(this.kbPath, 'files');
        this.indexPath = path.join(this.kbPath, 'index.json');
    }

    async initialize(): Promise<void> {
        try {
            // Create KB directories
            await fs.mkdir(this.kbPath, { recursive: true });
            await fs.mkdir(this.filesPath, { recursive: true });

            // Check if index exists
            try {
                await fs.access(this.indexPath);
                console.log('Knowledge base already initialized');
            } catch {
                // Create initial index
                const initialMetadata: KBMetadata = {
                    version: '1.0.0',
                    createdAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    fileCount: 0,
                    files: []
                };
                await this.saveMetadata(initialMetadata);
                console.log('Knowledge base initialized at:', this.kbPath);
            }

            vscode.window.showInformationMessage(`OpenCat KB ready at: ${this.kbPath}`);
        } catch (error) {
            console.error('Failed to initialize KB:', error);
            throw error;
        }
    }

    async getMetadata(): Promise<KBMetadata> {
        const data = await fs.readFile(this.indexPath, 'utf-8');
        return JSON.parse(data);
    }

    private async saveMetadata(metadata: KBMetadata): Promise<void> {
        await fs.writeFile(this.indexPath, JSON.stringify(metadata, null, 2), 'utf-8');
    }

    getKBPath(): string {
        return this.kbPath;
    }

    getFilesPath(): string {
        return this.filesPath;
    }

    async getStats(): Promise<{ fileCount: number; totalSize: number; path: string }> {
        const metadata = await this.getMetadata();
        const totalSize = metadata.files.reduce((sum, file) => sum + file.size, 0);
        
        return {
            fileCount: metadata.fileCount,
            totalSize,
            path: this.kbPath
        };
    }
}