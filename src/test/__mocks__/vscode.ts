/**
 * Mock vscode module for Jest tests
 */

export class Uri {
    constructor(public fsPath: string) {}

    static file(path: string): Uri {
        return new Uri(path);
    }

    static parse(value: string): Uri {
        return new Uri(value);
    }
}

export namespace workspace {
    export namespace fs {
        export async function createDirectory(uri: Uri): Promise<void> {
            // Mock implementation - no-op for tests
        }
    }
}

export interface ExtensionContext {
    subscriptions: any[];
    workspaceState: any;
    globalState: any;
    secrets: any;
    extensionUri: Uri;
    extensionPath: string;
    environmentVariableCollection: any;
    extensionMode: number;
    storageUri: Uri | undefined;
    storagePath: string | undefined;
    globalStorageUri: Uri;
    globalStoragePath: string;
    logUri: Uri;
    logPath: string;
    asAbsolutePath(relativePath: string): string;
    extension: any;
    languageModelAccessInformation: any;
}

export namespace window {
    export function showErrorMessage(message: string): void {
        console.error('VSCode Error:', message);
    }

    export function showInformationMessage(message: string): void {
        console.log('VSCode Info:', message);
    }

    export function showWarningMessage(message: string): void {
        console.warn('VSCode Warning:', message);
    }
}
