import * as vscode from 'vscode';

/**
 * Represents context extracted from user's chat references (#file, #selection, etc.)
 */
export interface ExtractedContext {
    files: Array<{ uri: vscode.Uri; content: string; description: string }>;
    selections: Array<{ uri: vscode.Uri; range: vscode.Range; content: string; description: string }>;
    hasContext: boolean;
}

/**
 * Knowledge base status information
 */
export interface KBStatus {
    isIndexed: boolean;
    shouldRefresh: boolean;
    daysSinceLastScan: number;
    totalFeatures: number;
    totalComponents: number;
}

/**
 * Context reference information for displaying what was used
 */
export interface ContextReferenceInfo {
    userQuery: string;
    features: Array<{
        name: string;
        componentCount: number;
        languages: string[];
        dataFlowCount: number;
    }>;
    selectionAnalyses: Array<{
        filePath: string;
        lines: string;
        language: string;
        analysisResult: string;
    }>;
    filesIncluded: Array<{
        path: string;
        size: number;
        lineCount: number;
        reason: string;
    }>;
    selectionsIncluded: Array<{
        path: string;
        lines: string;
        size: number;
        language: string;
        reason: string;
    }>;
    totalContextSize: number;
}

/**
 * Result returned by command handlers
 */
export interface HandlerResult {
    hasCode?: boolean;
    analysisContext?: any;
}

/**
 * Intent detection result
 */
export interface IntentResult {
    isAction: boolean;
    actionType?: string;
    confidence?: number;
}
