import * as vscode from 'vscode';
import { SessionManager } from '../../SessionManager';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager';

/**
 * Shows disambiguation UI when multiple features match
 * Returns true if disambiguation was shown, false otherwise
 */
export async function showDisambiguationUI(
    features: any[],
    query: string,
    session: any,
    sessionManager: SessionManager,
    kbManager: KnowledgeBaseManager,
    stream: vscode.ChatResponseStream
): Promise<boolean> {
    // Only disambiguate if 2-5 features match
    if (features.length < 2 || features.length > 5) {
        return false;
    }

    stream.markdown(`## 🔍 Multiple features found matching "${query}"\n\n`);
    stream.markdown(`Please select which feature you'd like explained:\n\n`);
    
    for (let i = 0; i < features.length; i++) {
        const f = features[i];
        const components = await kbManager.getComponentsForFeature(f.id);
        const desc = f.description.substring(0, 100);
        const descSuffix = f.description.length > 100 ? '...' : '';
        stream.markdown(`**${i + 1}.** ${f.name} - ${desc}${descSuffix}\n`);
        stream.markdown(`   _${components.length} components · ${f.languages.join(', ')}_\n\n`);
    }
    
    stream.markdown(`\n💡 Reply with the number (e.g., "1" or "2") to explain that feature.\n`);
    
    // Store disambiguation state
    sessionManager.storePendingDisambiguation(
        features.map(f => ({ id: f.id, name: f.name, description: f.description }))
    );
    
    return true;
}

/**
 * Checks for pending disambiguation and handles numeric selection
 * Returns selected feature ID if resolved, null otherwise
 */
export async function checkDisambiguationResponse(
    query: string,
    sessionManager: SessionManager
): Promise<{ featureIndex: number; totalFeatures: number } | null> {
    const pendingDisambiguation = sessionManager.getPendingDisambiguation();
    
    if (!pendingDisambiguation || !Array.isArray(pendingDisambiguation) || pendingDisambiguation.length === 0) {
        return null;
    }

    // Check if user provided a number
    const selectionMatch = query.match(/^(\d+)$/);
    if (!selectionMatch) {
        return null;
    }

    const selectedIndex = parseInt(selectionMatch[1], 10) - 1;
    const totalFeatures = pendingDisambiguation.length;

    if (selectedIndex >= 0 && selectedIndex < totalFeatures) {
        // Clear disambiguation state
        await sessionManager.clearPendingDisambiguation();
        return { featureIndex: selectedIndex, totalFeatures };
    }

    return null;
}
