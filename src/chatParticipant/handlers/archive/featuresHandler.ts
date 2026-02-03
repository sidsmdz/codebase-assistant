import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';

export async function handleFeatures(
    stream: vscode.ChatResponseStream,
    kbManager: KnowledgeBaseManager,
    token: vscode.CancellationToken
): Promise<void> {
    const features = await kbManager.getAllFeatures();

    if (features.length === 0) {
        stream.markdown('No features found in the knowledge base. Run `/scan` to index your workspace first.');
        return;
    }

    stream.markdown(`## ⚡ Features (${features.length})\n\n`);

    for (const f of features) {
        const langs = f.languages.join(', ');
        const frameworks = f.frameworks.join(', ') || 'none';
        stream.markdown(`### ${f.name}\n`);
        stream.markdown(`${f.description}\n\n`);
        stream.markdown(`- **Languages:** ${langs}\n`);
        stream.markdown(`- **Components:** ${f.components.length}\n`);
        stream.markdown(`- **Entry Points:** ${f.entryPoints.length}\n`);
        stream.markdown(`- **Frameworks:** ${frameworks}\n`);
        if (f.tags.length > 0) {
            stream.markdown(`- **Tags:** ${f.tags.slice(0, 8).join(', ')}\n`);
        }
        stream.markdown(`\n`);
    }
}
