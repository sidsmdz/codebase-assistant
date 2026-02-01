import * as vscode from 'vscode';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager';
import { JavaASTParser } from '../parsers/JavaASTParser';
import { TypeScriptASTParser } from '../parsers/TypeScriptASTParser';

/**
 * Analysis result for a code selection
 */
export interface SelectionAnalysis {
    /** Source file URI */
    uri: vscode.Uri;
    /** Selected range */
    range: vscode.Range;
    /** Language of the file */
    language: string;
    /** Detected imports/dependencies */
    imports: string[];
    /** Method/function calls found in selection */
    methodCalls: string[];
    /** Classes/types referenced */
    typesReferenced: string[];
    /** KB features involved in this code */
    relatedFeatures: Array<{ name: string; confidence: number }>;
    /** Components from KB involved */
    relatedComponents: Array<{ name: string; type: string; filePath: string }>;
    /** Related files (imports, dependencies) */
    relatedFiles: string[];
    /** Data flow detected (variables, parameters, returns) */
    dataFlow: Array<{ name: string; type: string; scope: string }>;
}

/**
 * Analyzes code selections to find dependencies, trace calls,
 * and identify involved KB features.
 */
export class SelectionAnalyzer {
    constructor(private kbManager: KnowledgeBaseManager) {}

    /**
     * Analyze a code selection and return comprehensive context
     */
    async analyzeSelection(
        document: vscode.TextDocument,
        range: vscode.Range
    ): Promise<SelectionAnalysis> {
        const language = document.languageId;
        const selectedText = document.getText(range);
        const fullText = document.getText();

        const analysis: SelectionAnalysis = {
            uri: document.uri,
            range,
            language,
            imports: [],
            methodCalls: [],
            typesReferenced: [],
            relatedFeatures: [],
            relatedComponents: [],
            relatedFiles: [],
            dataFlow: []
        };

        // Parse based on language
        if (language === 'java') {
            await this.analyzeJavaSelection(selectedText, fullText, document.uri.fsPath, analysis);
        } else if (language === 'typescript' || language === 'javascript' || language === 'typescriptreact' || language === 'javascriptreact') {
            await this.analyzeTypeScriptSelection(selectedText, fullText, document.uri.fsPath, analysis);
        } else {
            // Generic analysis for other languages
            await this.analyzeGenericSelection(selectedText, fullText, analysis);
        }

        // Find related KB features and components
        await this.findRelatedKBEntities(analysis);

        // Find related files based on imports
        await this.findRelatedFiles(analysis);

        return analysis;
    }

    /**
     * Analyze Java code selection
     */
    private async analyzeJavaSelection(
        selectedText: string,
        fullText: string,
        filePath: string,
        analysis: SelectionAnalysis
    ): Promise<void> {
        try {
            const parser = new JavaASTParser();
            
            // Parse full file to get imports
            const fullAST = parser.parse(fullText, filePath);
            
            // Extract imports from the full file content using regex
            const importMatches = fullText.matchAll(/^import\s+([\w.]+);/gm);
            for (const match of importMatches) {
                analysis.imports.push(match[1]);
            }

            // Parse selection
            const selectionAST = parser.parse(selectedText, filePath);
            
            // Extract method calls from selection AST
            for (const node of selectionAST) {
                if (node.type === 'METHOD') {
                    analysis.methodCalls.push(node.identifier);
                }
                if (node.type === 'CLASS') {
                    analysis.typesReferenced.push(node.identifier);
                }
            }

            // Use regex to find method calls (backup/additional)
            this.extractMethodCallsRegex(selectedText, analysis);
            
        } catch (err) {
            console.error('Java parsing error:', err);
            // Fallback to regex-based extraction
            this.extractMethodCallsRegex(selectedText, analysis);
        }
    }

    /**
     * Analyze TypeScript/JavaScript code selection
     */
    private async analyzeTypeScriptSelection(
        selectedText: string,
        fullText: string,
        filePath: string,
        analysis: SelectionAnalysis
    ): Promise<void> {
        try {
            const parser = new TypeScriptASTParser();
            
            // Parse full file
            const fullAST = parser.parse(fullText, filePath);
            
            // Extract imports using regex
            const importMatches = fullText.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g);
            for (const match of importMatches) {
                analysis.imports.push(match[1]);
            }

            // Parse selection
            const selectionAST = parser.parse(selectedText, filePath);
            
            // Extract functions/methods
            for (const node of selectionAST) {
                if (node.type === 'FUNCTION' || node.type === 'METHOD') {
                    analysis.methodCalls.push(node.identifier);
                }
                if (node.type === 'INTERFACE' || node.type === 'CLASS') {
                    analysis.typesReferenced.push(node.identifier);
                }
            }

            // Additional regex extraction
            this.extractMethodCallsRegex(selectedText, analysis);
            
        } catch (err) {
            console.error('TypeScript parsing error:', err);
            this.extractMethodCallsRegex(selectedText, analysis);
        }
    }

    /**
     * Generic analysis for unsupported languages
     */
    private async analyzeGenericSelection(
        selectedText: string,
        fullText: string,
        analysis: SelectionAnalysis
    ): Promise<void> {
        // Extract imports using regex patterns
        const importPatterns = [
            /import\s+.*?from\s+['"]([^'"]+)['"]/g,  // ES6 imports
            /require\(['"]([^'"]+)['"]\)/g,          // CommonJS
            /import\s+(['"]([^'"]+)['"])/g,          // Python-style
            /^import\s+([\w.]+)/gm,                  // Java-style
        ];

        for (const pattern of importPatterns) {
            const matches = fullText.matchAll(pattern);
            for (const match of matches) {
                if (match[1] || match[2]) {
                    analysis.imports.push(match[1] || match[2]);
                }
            }
        }

        // Extract method calls
        this.extractMethodCallsRegex(selectedText, analysis);
    }

    /**
     * Extract method/function calls using regex
     */
    private extractMethodCallsRegex(text: string, analysis: SelectionAnalysis): void {
        // Match function calls: identifier followed by (
        const callPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
        const matches = text.matchAll(callPattern);
        
        for (const match of matches) {
            const methodName = match[1];
            // Filter out common keywords
            if (!this.isKeyword(methodName) && !analysis.methodCalls.includes(methodName)) {
                analysis.methodCalls.push(methodName);
            }
        }
    }

    /**
     * Check if a word is a common language keyword
     */
    private isKeyword(word: string): boolean {
        const keywords = new Set([
            'if', 'else', 'for', 'while', 'switch', 'case', 'return', 'new',
            'function', 'class', 'interface', 'const', 'let', 'var', 'async',
            'await', 'try', 'catch', 'finally', 'throw', 'public', 'private',
            'protected', 'static', 'void', 'int', 'string', 'boolean'
        ]);
        return keywords.has(word.toLowerCase());
    }

    /**
     * Find related KB features and components
     */
    private async findRelatedKBEntities(analysis: SelectionAnalysis): Promise<void> {
        const fileName = analysis.uri.fsPath.split('/').pop() || '';
        
        // Search for features related to the file
        const features = await this.kbManager.searchFeatures(fileName, 5);
        
        for (const feature of features) {
            // Get full component details for this feature
            const components = await this.kbManager.getComponentsForFeature(feature.id);
            
            // Check if any components match our file or analysis
            const matchingComponents = components.filter(comp => 
                comp.filePath === analysis.uri.fsPath ||
                analysis.imports.some(imp => comp.name.toLowerCase().includes(imp.toLowerCase())) ||
                analysis.methodCalls.some(call => comp.name.toLowerCase().includes(call.toLowerCase())) ||
                analysis.typesReferenced.some(type => comp.name.toLowerCase().includes(type.toLowerCase()))
            );

            if (matchingComponents.length > 0) {
                analysis.relatedFeatures.push({
                    name: feature.name,
                    confidence: matchingComponents.length / components.length
                });

                analysis.relatedComponents.push(...matchingComponents.map(comp => ({
                    name: comp.name,
                    type: comp.type,
                    filePath: comp.filePath
                })));
            }
        }

        // Sort features by confidence
        analysis.relatedFeatures.sort((a, b) => b.confidence - a.confidence);
        
        // Deduplicate components
        analysis.relatedComponents = Array.from(
            new Map(analysis.relatedComponents.map(c => [c.filePath + c.name, c])).values()
        );
    }

    /**
     * Find related files based on imports and dependencies
     */
    private async findRelatedFiles(analysis: SelectionAnalysis): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        
        for (const imp of analysis.imports) {
            // Convert import to potential file paths
            const possiblePaths = this.importToFilePaths(imp, rootPath, analysis.language, analysis.uri);
            
            for (const path of possiblePaths) {
                try {
                    const uri = vscode.Uri.file(path);
                    await vscode.workspace.fs.stat(uri);
                    analysis.relatedFiles.push(path);
                } catch {
                    // File doesn't exist, skip
                }
            }
        }

        // Add component files
        for (const comp of analysis.relatedComponents) {
            if (comp.filePath && !analysis.relatedFiles.includes(comp.filePath)) {
                analysis.relatedFiles.push(comp.filePath);
            }
        }
    }

    /**
     * Convert import statement to possible file paths
     */
    private importToFilePaths(imp: string, rootPath: string, language: string, analysisUri: vscode.Uri): string[] {
        const paths: string[] = [];
        
        if (language === 'java') {
            // Java: com.example.Class -> com/example/Class.java
            const javaPath = `${rootPath}/src/main/java/${imp.replace(/\./g, '/')}.java`;
            paths.push(javaPath);
        } else if (language.includes('typescript') || language.includes('javascript')) {
            // TypeScript/JS: ./path/to/file or @/path/to/file
            if (imp.startsWith('.')) {
                // Relative import
                const basePath = analysisUri.fsPath.substring(0, analysisUri.fsPath.lastIndexOf('/'));
                paths.push(`${basePath}/${imp}.ts`, `${basePath}/${imp}.tsx`, `${basePath}/${imp}.js`, `${basePath}/${imp}.jsx`);
            } else if (imp.startsWith('@/')) {
                // Alias import
                const relPath = imp.substring(2);
                paths.push(`${rootPath}/src/${relPath}.ts`, `${rootPath}/src/${relPath}.tsx`);
            } else {
                // Module import - check node_modules (skip for now)
            }
        }
        
        return paths;
    }

    /**
     * Build enriched context string for LLM
     */
    buildContextString(analysis: SelectionAnalysis): string {
        let context = `# Code Selection Analysis\n\n`;
        context += `**File:** ${analysis.uri.fsPath}\n`;
        context += `**Lines:** ${analysis.range.start.line + 1}-${analysis.range.end.line + 1}\n`;
        context += `**Language:** ${analysis.language}\n\n`;

        if (analysis.relatedFeatures.length > 0) {
            context += `## Related Features (${analysis.relatedFeatures.length})\n`;
            for (const feature of analysis.relatedFeatures.slice(0, 5)) {
                context += `- **${feature.name}** (confidence: ${(feature.confidence * 100).toFixed(0)}%)\n`;
            }
            context += `\n`;
        }

        if (analysis.relatedComponents.length > 0) {
            context += `## Related Components (${analysis.relatedComponents.length})\n`;
            for (const comp of analysis.relatedComponents.slice(0, 10)) {
                context += `- **${comp.name}** (${comp.type}) - ${comp.filePath}\n`;
            }
            context += `\n`;
        }

        if (analysis.imports.length > 0) {
            context += `## Dependencies (${analysis.imports.length})\n`;
            for (const imp of analysis.imports.slice(0, 10)) {
                context += `- ${imp}\n`;
            }
            context += `\n`;
        }

        if (analysis.methodCalls.length > 0) {
            context += `## Method Calls (${analysis.methodCalls.length})\n`;
            for (const call of analysis.methodCalls.slice(0, 15)) {
                context += `- ${call}()\n`;
            }
            context += `\n`;
        }

        if (analysis.typesReferenced.length > 0) {
            context += `## Types Referenced (${analysis.typesReferenced.length})\n`;
            for (const type of analysis.typesReferenced.slice(0, 10)) {
                context += `- ${type}\n`;
            }
            context += `\n`;
        }

        if (analysis.relatedFiles.length > 0) {
            context += `## Related Files (${analysis.relatedFiles.length})\n`;
            for (const file of analysis.relatedFiles.slice(0, 10)) {
                context += `- ${file}\n`;
            }
            context += `\n`;
        }

        if (analysis.dataFlow.length > 0) {
            context += `## Data Flow (${analysis.dataFlow.length})\n`;
            for (const df of analysis.dataFlow.slice(0, 10)) {
                context += `- ${df.name}: ${df.type} (${df.scope})\n`;
            }
            context += `\n`;
        }

        return context;
    }
}
