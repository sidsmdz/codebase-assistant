import * as vscode from 'vscode';

export interface FrameworkConfig {
    language: string;
    ingestion: {
        include: string[];
    };
    types: { [key: string]: string[] };
}

/**
 * Provides configuration for the OpenCat assistant.
 * Reads from the user's VS Code settings.
 */
export function getConfig(): FrameworkConfig {
    const config = vscode.workspace.getConfiguration('opencat');
    return {
        language: config.get<string>('framework.language', 'java'),
        ingestion: { include: config.get<string[]>('ingestion.include', ['**/*.java']) },
        types: config.get<{ [key: string]: string[] }>('framework.types', {})
    };
}