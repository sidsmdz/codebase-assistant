import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface KBMetadata {
    version: string;
    createdAt: string;
    lastUpdated: string;
    featureCount: number;
}

export class KnowledgeBaseManager {
    private kbPath: string;
    private indexPath: string;

    constructor(private context: vscode.ExtensionContext) {
        this.kbPath = context.globalStorageUri.fsPath;
        this.indexPath = path.join(this.kbPath, 'index.json');
    }

    async initialize(): Promise<void> {
        try {
            await fs.mkdir(this.kbPath, { recursive: true });

            try {
                await fs.access(this.indexPath);
                console.log('Knowledge base already initialized');
            } catch {
                const initialMetadata: KBMetadata = {
                    version: '1.0.0',
                    createdAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    featureCount: 0
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
        return JSON.parse(data);
    }

    private async saveMetadata(metadata: KBMetadata): Promise<void> {
        await fs.writeFile(this.indexPath, JSON.stringify(metadata, null, 2), 'utf-8');
    }

    getKBPath(): string {
        return this.kbPath;
    }

    async getStats(): Promise<{ featureCount: number; path: string }> {
        const metadata = await this.getMetadata();
        
        return {
            featureCount: metadata.featureCount,
            path: this.kbPath
        };
    }
}
