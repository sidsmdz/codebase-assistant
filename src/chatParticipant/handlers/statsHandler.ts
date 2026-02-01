import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';

export async function handleStats(
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    token: vscode.CancellationToken
): Promise<void> {
    const stats = await kbManager.getDetailedStats();

    stream.markdown(`## ⚡ Knowledge Base Statistics\n\n`);
    stream.markdown(`| Metric | Count |\n|--------|-------|\n`);
    stream.markdown(`| Features | ${stats.totalFeatures} |\n`);
    stream.markdown(`| Components | ${stats.totalComponents} |\n`);
    stream.markdown(`| Data Flows | ${stats.totalDataFlows} |\n`);
    stream.markdown(`| Indexed Files | ${stats.indexedFiles} |\n`);
    stream.markdown(`| Patterns | ${stats.totalPatterns} |\n`);
    stream.markdown(`| AST Nodes | ${stats.totalASTNodes} |\n`);
    stream.markdown(`| Unique Terms | ${stats.totalTerms} |\n\n`);

    // Language breakdown
    const langEntries = Object.entries(stats.featuresByLanguage);
    if (langEntries.length > 0) {
        stream.markdown(`### Features by Language\n`);
        for (const [lang, count] of langEntries) {
            stream.markdown(`- **${lang}:** ${count}\n`);
        }
        stream.markdown(`\n`);
    }

    // Component type breakdown
    const typeEntries = Object.entries(stats.componentsByType);
    if (typeEntries.length > 0) {
        stream.markdown(`### Components by Type\n`);
        for (const [type, count] of typeEntries) {
            stream.markdown(`- **${type}:** ${count}\n`);
        }
        stream.markdown(`\n`);
    }

    // Framework breakdown
    const fwEntries = Object.entries(stats.featuresByFramework);
    if (fwEntries.length > 0) {
        stream.markdown(`### Frameworks Detected\n`);
        for (const [fw, count] of fwEntries) {
            stream.markdown(`- **${fw}:** ${count} features\n`);
        }
        stream.markdown(`\n`);
    }
}
