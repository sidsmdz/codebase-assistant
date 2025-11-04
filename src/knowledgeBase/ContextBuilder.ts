import * as vscode from 'vscode';
import { DependencyTracer } from './DependencyTracer';
import { KnowledgeBaseManager } from './KnowledgeBaseManager';

export class ContextBuilder {
    
    constructor(private kbManager?: KnowledgeBaseManager) {}

    async buildContextForQuery(userQuery: string): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        try {
            const tracer = new DependencyTracer();
            
            // Get workspace context
            let relevantClasses: any[] = [];
            if (workspaceFolders) {
                await tracer.buildClassMap();
                relevantClasses = this.findRelevantClasses(tracer, userQuery);
            }

            // Get saved patterns from KB
            let savedPatterns: any[] = [];
            if (this.kbManager) {
                savedPatterns = await this.kbManager.searchPatterns(userQuery);
            }

            if (relevantClasses.length === 0 && savedPatterns.length === 0) {
                return userQuery;
            }

            return this.buildEnrichedPrompt(userQuery, relevantClasses, savedPatterns);

        } catch (error) {
            console.error('Failed to build context:', error);
            return userQuery;
        }
    }

    private findRelevantClasses(tracer: DependencyTracer, query: string): any[] {
        const relevant: any[] = [];
        const queryLower = query.toLowerCase();

        const keywords = this.extractKeywords(queryLower);

        (tracer as any).classMap.forEach((classInfo: any, className: string) => {
            if (keywords.some(k => className.toLowerCase().includes(k))) {
                relevant.push(classInfo);
                return;
            }

            const fileName = classInfo.filePath.toLowerCase();
            if (keywords.some(k => fileName.includes(k))) {
                relevant.push(classInfo);
                return;
            }

            if (keywords.includes(classInfo.type)) {
                relevant.push(classInfo);
            }
        });

        return relevant.slice(0, 2);
    }

    private extractKeywords(query: string): string[] {
        const stopWords = ['how', 'do', 'i', 'the', 'a', 'an', 'to', 'in', 'for', 'create', 'make', 'write', 'add', 'new'];
        
        const words = query
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.includes(w));

        return [...new Set(words)];
    }

    private buildEnrichedPrompt(userQuery: string, relevantClasses: any[], savedPatterns: any[]): string {
        let prompt = '';

        // Add saved patterns first (higher priority)
        if (savedPatterns.length > 0) {
            prompt += `Saved patterns from Knowledge Base:\n\n`;
            savedPatterns.slice(0, 2).forEach((pattern) => {
                prompt += `**${pattern.name}** (${pattern.type}):\n`;
                prompt += `\`\`\`${pattern.language}\n${pattern.code}\n\`\`\`\n\n`;
            });
        }

        // Add workspace context
        if (relevantClasses.length > 0) {
            if (savedPatterns.length > 0) {
                prompt += `Current workspace code:\n\n`;
            } else {
                prompt += `Context from workspace:\n\n`;
            }

            relevantClasses.forEach((classInfo) => {
                const snippet = this.extractEssentialSnippet(classInfo);
                prompt += `**${classInfo.className}** (${classInfo.type}):\n`;
                prompt += `\`\`\`${classInfo.language}\n${snippet}\n\`\`\`\n\n`;
            });
        }

        prompt += `---\n\n`;
        prompt += `User: ${userQuery}\n\n`;
        prompt += `Follow the patterns shown above.`;

        return prompt;
    }

    

    private extractEssentialSnippet(classInfo: any): string {
    const content = classInfo.content;
    const lines = content.split('\n').filter((l: string) => l.trim().length > 0); // Remove empty lines first
    
    const essential: string[] = [];
    let addedItems = new Set<string>(); // Track added lines to avoid duplicates
    
    // 1. Get package/import (1 line max)
    const packageLine = lines.find((l: string) => 
        l.trim().startsWith('package ') || 
        l.trim().startsWith('import ') && l.includes('Injectable')
    );
    if (packageLine) {
        essential.push(packageLine.trim());
        addedItems.add(packageLine.trim());
    }

    // 2. Get class declaration with annotation
    const classLineIdx = lines.findIndex((l: string) => 
        l.includes('class ' + classInfo.className) ||
        l.includes('export class ' + classInfo.className) ||
        l.includes('export const ' + classInfo.className)
    );
    
    if (classLineIdx !== -1) {
        // Add annotation if present (e.g., @RestController, @Injectable)
        for (let i = Math.max(0, classLineIdx - 2); i < classLineIdx; i++) {
            const line = lines[i].trim();
            if (line.startsWith('@') && !addedItems.has(line)) {
                essential.push(line);
                addedItems.add(line);
            }
        }
        // Add class declaration
        const classLine = lines[classLineIdx].trim();
        if (!addedItems.has(classLine)) {
            essential.push(classLine);
            addedItems.add(classLine);
        }
    }

    essential.push(''); // Blank line

    // 3. Get constructor signature only (single line)
    const constructorLine = lines.find((l: string) => 
        (l.includes('constructor(') || l.includes('public ' + classInfo.className + '(')) &&
        !addedItems.has(l.trim())
    );
    
    if (constructorLine) {
        // Extract just the signature, stop at opening brace
        let signature = constructorLine.trim();
        if (signature.includes('{')) {
            signature = signature.substring(0, signature.indexOf('{')).trim();
        }
        essential.push(signature);
        addedItems.add(signature);
    }

    essential.push(''); // Blank line

    // 4. Get method signatures only - max 3 unique methods
    let methodCount = 0;
    const seenMethods = new Set<string>();
    
    for (let i = 0; i < lines.length && methodCount < 3; i++) {
        const line = lines[i].trim();
        
        // Match method declarations (public/async)
        if ((line.startsWith('public ') || line.startsWith('async ')) && 
            line.includes('(') && 
            !line.includes('constructor') &&
            !line.includes(classInfo.className + '(')) {
            
            // Extract just method signature (remove body)
            let methodSig = line;
            if (methodSig.includes('{')) {
                methodSig = methodSig.substring(0, methodSig.indexOf('{')).trim();
            }
            if (methodSig.includes(') {')) {
                methodSig = methodSig.substring(0, methodSig.indexOf(') {') + 1).trim();
            }
            
            // Extract method name to check for duplicates
            const methodName = methodSig.match(/\b(\w+)\s*\(/)?.[1];
            
            if (methodName && !seenMethods.has(methodName)) {
                essential.push(methodSig);
                seenMethods.add(methodName);
                methodCount++;
            }
        }
    }

    // 5. Add closing brace
    essential.push('}');

    return essential.join('\n');
}
}