import * as vscode from 'vscode';
import { Feature } from '../../analysis/FeatureAnalyzer';

/**
 * Token limits for different LLM models
 */
export const TOKEN_LIMITS = {
    GPT4: 128000,           // GPT-4 Turbo (Pro)
    GPT4O: 128000,          // GPT-4o (Pro)
    GPT35: 16385,           // GPT-3.5 Turbo
    CLAUDE_SONNET: 200000,  // Claude 3.5 Sonnet (Pro)
    CLAUDE_OPUS: 200000,    // Claude 3 Opus (Pro)
    FREE_TIER: 8000,        // Conservative for free Copilot (GPT-3.5 or smaller context)
    DEFAULT: 8000           // Conservative default for unknown models
};

/**
 * Recommended context limits for different tiers
 * These are more conservative to leave room for responses
 */
export const CONTEXT_LIMITS = {
    PRO: 100000,            // Pro tier: use up to 100K for context
    FREE: 4000,             // Free tier: use max 4K for context
    MINIMAL: 2000           // Minimal mode: just essential context
};

/**
 * Approximate token count using character-based estimation
 * Rule of thumb: ~4 characters per token for code
 */
export function estimateTokenCount(text: string): number {
    // More accurate estimation considering:
    // - Code has more tokens per character than prose
    // - Average: 1 token ≈ 3.5-4 characters
    return Math.ceil(text.length / 3.5);
}

/**
 * Detect available Copilot model and return appropriate context limit
 * Returns conservative limits for free tier, more generous for pro
 */
export async function detectModelContextLimit(): Promise<{ contextLimit: number; modelName: string; isPro: boolean }> {
    try {
        // Try to get available models
        const models = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4o'
        });
        
        // If GPT-4o is available, user likely has Pro
        if (models.length > 0) {
            return {
                contextLimit: CONTEXT_LIMITS.PRO,
                modelName: 'gpt-4o',
                isPro: true
            };
        }
        
        // Check for GPT-4
        const gpt4Models = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4'
        });
        
        if (gpt4Models.length > 0) {
            return {
                contextLimit: CONTEXT_LIMITS.PRO,
                modelName: 'gpt-4',
                isPro: true
            };
        }
        
        // Fallback: assume free tier with GPT-3.5 or limited context
        console.log('No premium models detected, using free tier limits');
        return {
            contextLimit: CONTEXT_LIMITS.FREE,
            modelName: 'gpt-3.5-turbo (estimated)',
            isPro: false
        };
    } catch (err) {
        console.warn('Failed to detect model, using conservative limits:', err);
        // Be conservative if detection fails
        return {
            contextLimit: CONTEXT_LIMITS.FREE,
            modelName: 'unknown',
            isPro: false
        };
    }
}

/**
 * Context item with priority and size info
 */
export interface ContextItem {
    content: string;
    type: 'feature' | 'file' | 'selection' | 'pattern';
    name: string;
    priority: number;        // Higher = more important (1-10)
    estimatedTokens: number;
    metadata?: any;
}

/**
 * Result of context optimization
 */
export interface OptimizedContext {
    content: string;
    totalTokens: number;
    itemsIncluded: number;
    itemsExcluded: number;
    truncated: boolean;
    warnings: string[];
}

/**
 * Smart context manager that handles token limits
 */
export class TokenManager {
    private readonly maxTokens: number;
    private readonly reservedTokens: number; // Reserve for response
    
    constructor(maxTokens: number = TOKEN_LIMITS.DEFAULT, reservedForResponse: number = 4000) {
        this.maxTokens = maxTokens;
        this.reservedTokens = reservedForResponse;
    }
    
    /**
     * Calculate available tokens for context
     */
    getAvailableTokens(promptTokens: number): number {
        return this.maxTokens - this.reservedTokens - promptTokens;
    }
    
    /**
     * Optimize context to fit within token limits
     * Uses prioritization, truncation, and smart sampling
     */
    optimizeContext(
        items: ContextItem[],
        userPrompt: string,
        maxContextTokens?: number
    ): OptimizedContext {
        const promptTokens = estimateTokenCount(userPrompt);
        const available = maxContextTokens || this.getAvailableTokens(promptTokens);
        
        // Sort by priority (highest first)
        const sorted = [...items].sort((a, b) => b.priority - a.priority);
        
        const included: ContextItem[] = [];
        const excluded: ContextItem[] = [];
        const warnings: string[] = [];
        let currentTokens = 0;
        
        // Greedy selection by priority
        for (const item of sorted) {
            if (currentTokens + item.estimatedTokens <= available) {
                included.push(item);
                currentTokens += item.estimatedTokens;
            } else if (currentTokens < available * 0.8) {
                // Try to fit partial content if we haven't used 80% yet
                const remainingTokens = available - currentTokens;
                const truncated = this.truncateItem(item, remainingTokens);
                if (truncated) {
                    included.push(truncated);
                    currentTokens += truncated.estimatedTokens;
                    warnings.push(`Truncated ${item.type} "${item.name}" to fit token limit`);
                }
                excluded.push(item);
            } else {
                excluded.push(item);
            }
        }
        
        // Build final content
        const content = this.assembleContext(included);
        const totalTokens = estimateTokenCount(content);
        
        // Add warnings if significant content was excluded
        if (excluded.length > 0) {
            warnings.push(`Excluded ${excluded.length} items due to token limits`);
            const excludedTypes = excluded.reduce((acc, item) => {
                acc[item.type] = (acc[item.type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            warnings.push(`Excluded: ${Object.entries(excludedTypes).map(([k, v]) => `${v} ${k}(s)`).join(', ')}`);
        }
        
        return {
            content,
            totalTokens,
            itemsIncluded: included.length,
            itemsExcluded: excluded.length,
            truncated: warnings.some(w => w.includes('Truncated')),
            warnings
        };
    }
    
    /**
     * Truncate a context item to fit within token budget
     */
    private truncateItem(item: ContextItem, maxTokens: number): ContextItem | null {
        if (maxTokens < 200) {
            return null; // Too small to be useful
        }
        
        const targetChars = Math.floor(maxTokens * 3.5);
        if (item.content.length <= targetChars) {
            return item;
        }
        
        // Smart truncation based on type
        let truncated = '';
        switch (item.type) {
            case 'feature':
                // Keep header and first few components
                truncated = this.truncateFeature(item.content, targetChars);
                break;
            case 'file':
                // Keep first and last portions
                truncated = this.truncateFile(item.content, targetChars);
                break;
            case 'selection':
                // Keep as much as possible from center
                truncated = this.truncateSelection(item.content, targetChars);
                break;
            default:
                truncated = item.content.substring(0, targetChars) + '\n\n... [truncated]';
        }
        
        return {
            ...item,
            content: truncated,
            estimatedTokens: estimateTokenCount(truncated)
        };
    }
    
    /**
     * Smart feature truncation - keep structure, reduce component details
     */
    private truncateFeature(content: string, maxChars: number): string {
        const lines = content.split('\n');
        const result: string[] = [];
        let chars = 0;
        
        // Always include header
        for (let i = 0; i < Math.min(5, lines.length); i++) {
            result.push(lines[i]);
            chars += lines[i].length + 1;
        }
        
        // Add components summary instead of full details
        result.push('\n... [Component details truncated for token limit]');
        
        return result.join('\n');
    }
    
    /**
     * File truncation - keep beginning and end
     */
    private truncateFile(content: string, maxChars: number): string {
        const keepChars = Math.floor(maxChars / 2);
        const start = content.substring(0, keepChars);
        const end = content.substring(content.length - keepChars);
        return `${start}\n\n... [middle section truncated] ...\n\n${end}`;
    }
    
    /**
     * Selection truncation - keep relevant portion
     */
    private truncateSelection(content: string, maxChars: number): string {
        if (content.length <= maxChars) {
            return content;
        }
        return content.substring(0, maxChars) + '\n... [selection truncated]';
    }
    
    /**
     * Assemble final context from items
     */
    private assembleContext(items: ContextItem[]): string {
        const sections: string[] = [];
        
        // Group by type
        const byType = items.reduce((acc, item) => {
            if (!acc[item.type]) {
                acc[item.type] = [];
            }
            acc[item.type].push(item);
            return acc;
        }, {} as Record<string, ContextItem[]>);
        
        // Features first
        if (byType.feature?.length > 0) {
            sections.push('## Relevant Features\n');
            byType.feature.forEach(item => sections.push(item.content));
        }
        
        // Files second
        if (byType.file?.length > 0) {
            sections.push('\n## Relevant Files\n');
            byType.file.forEach(item => sections.push(item.content));
        }
        
        // Selections third
        if (byType.selection?.length > 0) {
            sections.push('\n## Code Selections\n');
            byType.selection.forEach(item => sections.push(item.content));
        }
        
        // Patterns last
        if (byType.pattern?.length > 0) {
            sections.push('\n## Patterns\n');
            byType.pattern.forEach(item => sections.push(item.content));
        }
        
        return sections.join('\n');
    }
    
    /**
     * Create context items from features with automatic prioritization
     * Note: This creates items WITHOUT full component details - caller should
     * fetch component details separately if needed to avoid circular dependencies
     */
    static createFeatureItems(
        features: Feature[],
        userQuery: string
    ): ContextItem[] {
        return features.map((feature, index) => {
            // Build feature content with basic info
            let content = `### Feature: ${feature.name}\n`;
            content += `${feature.description}\n`;
            content += `- **Languages:** ${feature.languages.join(', ')}\n`;
            if (feature.frameworks.length > 0) {
                content += `- **Frameworks:** ${feature.frameworks.join(', ')}\n`;
            }
            content += `- **Components:** ${feature.components.length}\n`;
            
            // Note: Component details should be added by caller using KnowledgeBaseManager
            // to avoid circular dependencies with the FeatureAnalyzer
            
            if (feature.flow && feature.flow.length > 0) {
                content += `- **Data flows:** ${feature.flow.length} connections\n`;
            }
            
            // Priority: features mentioned in query get higher priority
            const queryLower = userQuery.toLowerCase();
            const nameMatch = queryLower.includes(feature.name.toLowerCase());
            const basePriority = 10 - index; // First features get higher priority
            const priority = nameMatch ? basePriority + 3 : basePriority;
            
            return {
                content,
                type: 'feature',
                name: feature.name,
                priority,
                estimatedTokens: estimateTokenCount(content),
                metadata: { 
                    componentCount: feature.components.length,
                    featureId: feature.id
                }
            };
        });
    }
    
    /**
     * Enrich feature context items with component details
     * Uses incremental strategy: summary first, details only if space permits
     * 
     * @param mode 'summary' = names only, 'normal' = names + paths, 'detailed' = with signatures
     */
    static async enrichFeatureItems(
        items: ContextItem[],
        getComponents: (featureId: string) => Promise<any[]>,
        mode: 'summary' | 'normal' | 'detailed' = 'normal',
        maxComponentsPerFeature: number = 5
    ): Promise<ContextItem[]> {
        const enriched: ContextItem[] = [];
        
        for (const item of items) {
            if (item.type !== 'feature' || !item.metadata?.featureId) {
                enriched.push(item);
                continue;
            }
            
            try {
                const components = await getComponents(item.metadata.featureId);
                let additionalContent = '';
                
                if (components.length > 0) {
                    additionalContent += `\n**Key Components:**\n`;
                    
                    const limit = Math.min(maxComponentsPerFeature, components.length);
                    for (const comp of components.slice(0, limit)) {
                        switch (mode) {
                            case 'summary':
                                // Minimal: just names and types
                                additionalContent += `- \`${comp.name}\` (${comp.type})\n`;
                                break;
                            case 'normal':
                                // Default: names, types, and file paths
                                additionalContent += `- \`${comp.name}\` (${comp.type}) - ${comp.filePath}\n`;
                                break;
                            case 'detailed':
                                // Full: include method signatures or key properties
                                additionalContent += `- \`${comp.name}\` (${comp.type}) - ${comp.filePath}\n`;
                                if (comp.methods && comp.methods.length > 0) {
                                    const methodSample = comp.methods.slice(0, 2).map((m: any) => m.name).join(', ');
                                    additionalContent += `  Methods: ${methodSample}${comp.methods.length > 2 ? '...' : ''}\n`;
                                }
                                break;
                        }
                    }
                    
                    if (components.length > limit) {
                        additionalContent += `- ...and ${components.length - limit} more\n`;
                    }
                }
                
                const enrichedContent = item.content + additionalContent;
                enriched.push({
                    ...item,
                    content: enrichedContent,
                    estimatedTokens: estimateTokenCount(enrichedContent)
                });
            } catch (err) {
                console.error(`Failed to enrich feature ${item.name}:`, err);
                enriched.push(item); // Use un-enriched version
            }
        }
        
        return enriched;
    }
    
    /**
     * Notify user about token limit issues
     */
    static renderTokenWarning(
        stream: vscode.ChatResponseStream, 
        result: OptimizedContext,
        modelInfo?: { contextLimit: number; isPro: boolean }
    ): void {
        if (result.truncated || result.itemsExcluded > 0) {
            stream.markdown(`\n⚠️ **Context Optimized for Token Limits**\n\n`);
            stream.markdown(`- Included: ${result.itemsIncluded} items (~${result.totalTokens.toLocaleString()} tokens)\n`);
            if (result.itemsExcluded > 0) {
                stream.markdown(`- Excluded: ${result.itemsExcluded} lower-priority items\n`);
            }
            if (result.truncated) {
                stream.markdown(`- Some items were truncated to fit\n`);
            }
            
            stream.markdown(`\n💡 **Tip:** Try refining your query to target specific features for better context.\n\n`);
        }
    }
}
