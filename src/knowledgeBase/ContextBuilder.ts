import * as vscode from 'vscode';
import { KnowledgeBaseManager, SavedPattern } from './KnowledgeBaseManager';

export class ContextBuilder {
    
    constructor(private kbManager?: KnowledgeBaseManager) {}

    async buildContextForQuery(userQuery: string): Promise<string> {
        
        try {
            let savedPatterns: SavedPattern[] = [];
            if (this.kbManager) {
                savedPatterns = await this.kbManager.searchPatterns(userQuery);
            }

            if (savedPatterns.length === 0) {
                console.log('No patterns found in KB. Asking Copilot directly.');
                return this.buildEnrichedPrompt(userQuery, []);
            }

            return this.buildEnrichedPrompt(userQuery, savedPatterns.slice(0, 3));

        } catch (error) {
            console.error('Failed to build context:', error);
            return this.buildEnrichedPrompt(userQuery, []);
        }
    }

    private buildEnrichedPrompt(userQuery: string, savedPatterns: SavedPattern[]): string {
        let prompt = `You are a helpful and precise code assistant.
You MUST follow these rules:
1.  Answer the user's request using ONLY the code examples provided in the context blocks.
2.  Do NOT invent new class names, file names, or methods if they are not in the context.
3.  Base your answer *directly* on the provided snippets.
4.  If the context is empty or irrelevant, politely state that you cannot answer based on the provided examples.

`;

        if (savedPatterns.length > 0) {
            prompt += `--- CONTEXT: SAVED KNOWLEDGE BASE PATTERNS ---\n\n`;
            savedPatterns.forEach((pattern) => {
                prompt += `**Pattern: ${pattern.name}** (Description: ${pattern.description})\n`;
                prompt += `(Tags: ${pattern.tags.join(', ')})\n`;
                prompt += `\`\`\`${pattern.language}\n${pattern.code}\n\`\`\`\n\n`;
            });
        } else {
            return userQuery;
        }

        prompt += `--- END OF CONTEXT ---\n\n`;
        prompt += `User Request: ${userQuery}\n\n`;
        prompt += `Answer the user request using ONLY the code from the '--- CONTEXT ---' blocks above.`;

        return prompt;
    }
}
