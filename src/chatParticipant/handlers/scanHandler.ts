import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';
import { IngestionService } from '../../ingestionService';

export async function handleScan(
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    token: vscode.CancellationToken,
    onComplete?: () => void
): Promise<void> {
    stream.progress('Indexing workspace...');

    try {
        const ingestService = new IngestionService(kbManager);
        await ingestService.runIngestion();

        const stats = await kbManager.getDetailedStats();
        stream.markdown(`## ⚡ Workspace Indexed Successfully\n\n`);
        stream.markdown(`| Metric | Count |\n|--------|-------|\n`);
        stream.markdown(`| Features | ${stats.totalFeatures} |\n`);
        stream.markdown(`| Components | ${stats.totalComponents} |\n`);
        stream.markdown(`| Data Flows | ${stats.totalDataFlows} |\n`);
        stream.markdown(`| Indexed Files | ${stats.indexedFiles} |\n`);
        stream.markdown(`| Unique Terms | ${stats.totalTerms} |\n\n`);
        stream.markdown(`You can now ask questions about your codebase. Try: *"explain the authentication flow"* or *"how does the grid rendering work?"*\n`);

        onComplete?.();
    } catch (err) {
        stream.markdown(`⚠️ Indexing failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}
