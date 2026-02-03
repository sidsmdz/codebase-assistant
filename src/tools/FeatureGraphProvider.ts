import * as vscode from 'vscode';
import * as path from 'path';
import { TreeSitterWasmManager } from '../parsers/TreeSitterWasmManager';
import { LSPProvider } from '../indexing/LSPProvider';
import { KnowledgeBaseManager } from '../knowledgeBase/KnowledgeBaseManager';

/**
 * Impact Analysis Result
 * Combines AST structure + LSP references + Cross-language dependencies
 */
export interface ImpactAnalysis {
    symbolName: string;
    symbolType: string;  // "class" | "interface" | "function" | "method"
    location: {
        file: string;
        line: number;
        language: string;
    };
    
    // AST-based structure
    structure: {
        visibility: string;  // "public" | "private" | "protected"
        isAbstract: boolean;
        isStatic: boolean;
        extends?: string[];
        implements?: string[];
        methods?: string[];
        fields?: string[];
    };
    
    // LSP-based references
    references: {
        file: string;
        line: number;
        language: string;
        context: string;  // surrounding code snippet
    }[];
    
    // Cross-language dependencies
    crossLanguageLinks: {
        type: 'api-endpoint' | 'data-model' | 'event' | 'import';
        source: { file: string; language: string; };
        target: { file: string; language: string; };
        connection: string;  // human-readable description
    }[];
    
    // Decision metrics
    riskScore: number;  // 0-100: higher = more dangerous to change
    affectedFiles: number;
    affectedLanguages: string[];
    
    // Governance recommendation
    recommendation: string;
}

/**
 * Feature Discovery Result
 * Maps user intent to actual code locations
 */
export interface FeatureGraph {
    featureName: string;
    confidence: number;  // 0-1: how confident we are this is the right feature
    
    entryPoints: {
        frontend?: { file: string; type: string; };
        backend?: { file: string; type: string; };
    };
    
    callFlow: {
        frontend: FlowNode[];
        backend: FlowNode[];
        crossLanguageLinks: CrossLanguageLink[];
    };
    
    relatedSymbols: string[];  // other classes/functions in this feature
    keywords: string[];  // for semantic matching
}

interface FlowNode {
    file: string;
    symbolName: string;
    type: string;
    language: string;
    dependencies: string[];
    exports?: string[];
}

interface CrossLanguageLink {
    frontend: string;
    backend: string;
    connection: string;
    type: 'api' | 'model' | 'event';
}

/**
 * Refactor Validation Result
 * Check-Before-Act logic
 */
export interface RefactorValidation {
    canProceed: boolean;
    blockers: string[];  // reasons why refactor is dangerous
    warnings: string[];  // non-blocking concerns
    
    affectedFiles: {
        file: string;
        language: string;
        changes: string[];  // what needs to change in this file
    }[];
    
    strategy: {
        approach: 'safe' | 'risky' | 'blocked';
        steps: string[];  // ordered list of changes to make
        rollbackPlan: string;
    };
}

/**
 * The "Brain" of AutoForge
 * Combines Tree-sitter (structure) + LSP (semantics) + KB (history)
 * to make governance decisions
 */
export class FeatureGraphProvider {
    constructor(
        private treeSitter: TreeSitterWasmManager,
        private lspProvider: LSPProvider,
        private kbManager: KnowledgeBaseManager
    ) {}

    /**
     * TOOL 1: Analyze Impact
     * Find all dependencies and breaking change risks for a symbol
     */
    async analyzeImpact(symbolName: string): Promise<ImpactAnalysis> {
        console.log(`[AutoForge] Analyzing impact for: ${symbolName}`);
        
        // Step 1: Find the symbol in workspace
        const symbolLocation = await this.findSymbolLocation(symbolName);
        if (!symbolLocation) {
            // Provide helpful error with search strategies tried
            const searchHint = `Tried: LSP workspace search, file pattern matching (${symbolName}.java, ${symbolName}.ts), active editor`;
            throw new Error(
                `Symbol "${symbolName}" not found in workspace. ${searchHint}. ` +
                `Make sure the file is opened or indexed by the language server.`
            );
        }

        console.log(`[AutoForge] Found ${symbolName} at: ${symbolLocation.file}:${symbolLocation.line}`);

        // Step 2: Get AST structure
        const structure = await this.extractStructure(symbolLocation);

        // Step 3: Get LSP references
        const references = await this.findReferences(symbolLocation);

        // Step 4: Find cross-language links
        const crossLanguageLinks = await this.findCrossLanguageLinks(symbolName, symbolLocation);

        // Step 5: Calculate risk score
        const riskScore = this.calculateRiskScore(structure, references, crossLanguageLinks);

        // Step 6: Generate recommendation
        const recommendation = this.generateRecommendation(riskScore, references, crossLanguageLinks);

        const affectedLanguages = new Set<string>();
        references.forEach(ref => affectedLanguages.add(ref.language));
        crossLanguageLinks.forEach(link => {
            affectedLanguages.add(link.source.language);
            affectedLanguages.add(link.target.language);
        });

        return {
            symbolName,
            symbolType: structure.type,
            location: symbolLocation,
            structure: structure.details,
            references,
            crossLanguageLinks,
            riskScore,
            affectedFiles: references.length,
            affectedLanguages: Array.from(affectedLanguages),
            recommendation
        };
    }

    /**
     * TOOL 2: Find Feature
     * Map user's natural language query to actual code locations
     */
    async findFeature(query: string): Promise<FeatureGraph> {
        // Step 1: Extract keywords from query
        const keywords = this.extractKeywords(query);

        // Step 2: Search knowledge base for matching features
        const kbResults = await this.searchKnowledgeBase(keywords);

        // Step 3: Find entry points (Controller, Hook, etc.)
        const entryPoints = await this.findEntryPoints(keywords, kbResults);

        // Step 4: Build call flow from entry points
        const callFlow = await this.buildCallFlow(entryPoints);

        // Step 5: Calculate confidence score
        const confidence = this.calculateConfidence(query, callFlow, kbResults);

        return {
            featureName: this.inferFeatureName(keywords, callFlow),
            confidence,
            entryPoints,
            callFlow,
            relatedSymbols: this.extractSymbolNames(callFlow),
            keywords
        };
    }

    /**
     * TOOL 3: Validate Refactor
     * Check-Before-Act: Is this refactor safe?
     */
    async validateRefactor(
        symbolName: string,
        proposedChange: string
    ): Promise<RefactorValidation> {
        // Step 1: Analyze current impact
        const impact = await this.analyzeImpact(symbolName);

        // Step 2: Identify blockers
        const blockers: string[] = [];
        const warnings: string[] = [];

        if (impact.riskScore > 80) {
            blockers.push(`High risk score (${impact.riskScore}/100): This symbol is critical to system stability`);
        }

        if (impact.affectedFiles > 20) {
            warnings.push(`${impact.affectedFiles} files will be affected - consider phased rollout`);
        }

        if (impact.crossLanguageLinks.length > 0) {
            warnings.push(`${impact.crossLanguageLinks.length} cross-language dependencies found - verify all language changes`);
        }

        // Step 3: Determine if we can proceed
        const canProceed = blockers.length === 0;

        // Step 4: Generate affected files list with required changes
        const affectedFiles = await this.planChanges(impact, proposedChange);

        // Step 5: Generate refactor strategy
        const strategy = this.generateStrategy(impact, affectedFiles, canProceed);

        return {
            canProceed,
            blockers,
            warnings,
            affectedFiles,
            strategy
        };
    }

    // ==================== PRIVATE HELPER METHODS ====================

    private async findSymbolLocation(symbolName: string): Promise<{
        file: string;
        line: number;
        language: string;
    } | null> {
        // Strategy 1: Use LSP workspace symbol search
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider',
            symbolName
        );

        if (symbols && symbols.length > 0) {
            // Find exact match
            const exactMatch = symbols.find(s => s.name === symbolName);
            const symbol = exactMatch || symbols[0];

            const doc = await vscode.workspace.openTextDocument(symbol.location.uri);

            return {
                file: doc.uri.fsPath,
                line: symbol.location.range.start.line,
                language: doc.languageId
            };
        }

        // Strategy 2: Search workspace files by name pattern
        console.log(`[AutoForge] LSP search failed, trying file search for: ${symbolName}`);
        const javaFiles = await vscode.workspace.findFiles(`**/${symbolName}.java`, '**/node_modules/**', 10);
        const tsFiles = await vscode.workspace.findFiles(`**/${symbolName}.ts`, '**/node_modules/**', 10);
        const allFiles = [...javaFiles, ...tsFiles];

        if (allFiles.length > 0) {
            const file = allFiles[0];
            const doc = await vscode.workspace.openTextDocument(file);
            
            // Find class/interface declaration line
            const text = doc.getText();
            const classMatch = text.match(new RegExp(`(class|interface)\\s+${symbolName}\\b`));
            const line = classMatch ? doc.positionAt(text.indexOf(classMatch[0])).line : 0;

            console.log(`[AutoForge] Found ${symbolName} via file search at: ${file.fsPath}`);
            
            return {
                file: doc.uri.fsPath,
                line,
                language: doc.languageId
            };
        }

        // Strategy 3: Search in active editor
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const text = activeEditor.document.getText();
            const symbolMatch = text.match(new RegExp(`(class|interface|function)\\s+${symbolName}\\b`));
            if (symbolMatch) {
                console.log(`[AutoForge] Found ${symbolName} in active editor`);
                return {
                    file: activeEditor.document.uri.fsPath,
                    line: activeEditor.document.positionAt(text.indexOf(symbolMatch[0])).line,
                    language: activeEditor.document.languageId
                };
            }
        }

        console.error(`[AutoForge] Symbol not found: ${symbolName}`);
        return null;
    }

    private async extractStructure(location: { file: string; line: number; language: string }): Promise<{
        type: string;
        details: any;
    }> {
        const doc = await vscode.workspace.openTextDocument(location.file);
        const language = location.language === 'typescript' || location.language === 'javascript' ? 'typescript' : 'java';
        const ast = await this.treeSitter.parse(location.file, doc.getText(), language as 'java' | 'typescript');

        if (!ast) {
            return { type: 'unknown', details: {} };
        }

        // Find node at line
        const node = this.findNodeAtLine(ast.rootNode, location.line);
        if (!node) {
            return { type: 'unknown', details: {} };
        }

        // Extract structure based on language
        if (location.language === 'java') {
            return this.extractJavaStructure(node, doc);
        } else if (location.language === 'typescript' || location.language === 'javascript') {
            return this.extractTypeScriptStructure(node, doc);
        }

        return { type: node.type, details: {} };
    }

    private findNodeAtLine(node: any, targetLine: number): any {
        if (node.startPosition.row === targetLine) {
            return node;
        }

        for (const child of node.children) {
            const found = this.findNodeAtLine(child, targetLine);
            if (found) return found;
        }

        return null;
    }

    private extractJavaStructure(node: any, doc: vscode.TextDocument): { type: string; details: any } {
        // Find class/interface/method declaration
        let current = node;
        while (current && !['class_declaration', 'interface_declaration', 'method_declaration'].includes(current.type)) {
            current = current.parent;
        }

        if (!current) {
            return { type: 'unknown', details: {} };
        }

        const details: any = {
            visibility: 'public',  // default
            isAbstract: false,
            isStatic: false
        };

        // Extract modifiers
        const modifiers = current.children.find((c: any) => c.type === 'modifiers');
        if (modifiers) {
            const modifierText = doc.getText(new vscode.Range(
                modifiers.startPosition.row,
                modifiers.startPosition.column,
                modifiers.endPosition.row,
                modifiers.endPosition.column
            ));
            details.visibility = modifierText.includes('private') ? 'private' :
                               modifierText.includes('protected') ? 'protected' : 'public';
            details.isAbstract = modifierText.includes('abstract');
            details.isStatic = modifierText.includes('static');
        }

        if (current.type === 'class_declaration') {
            // Extract extends/implements
            const superclass = current.children.find((c: any) => c.type === 'superclass');
            if (superclass) {
                details.extends = [doc.getText(new vscode.Range(
                    superclass.startPosition.row,
                    superclass.startPosition.column,
                    superclass.endPosition.row,
                    superclass.endPosition.column
                )).replace('extends', '').trim()];
            }

            const interfaces = current.children.find((c: any) => c.type === 'super_interfaces');
            if (interfaces) {
                details.implements = []; // Would need to parse interface list
            }

            // Extract methods
            const body = current.children.find((c: any) => c.type === 'class_body');
            if (body) {
                details.methods = body.children
                    .filter((c: any) => c.type === 'method_declaration')
                    .map((m: any) => {
                        const nameNode = m.children.find((c: any) => c.type === 'identifier');
                        return nameNode ? doc.getText(new vscode.Range(
                            nameNode.startPosition.row,
                            nameNode.startPosition.column,
                            nameNode.endPosition.row,
                            nameNode.endPosition.column
                        )) : 'unknown';
                    });

                details.fields = body.children
                    .filter((c: any) => c.type === 'field_declaration')
                    .map((f: any) => {
                        const declarator = f.children.find((c: any) => c.type === 'variable_declarator');
                        if (declarator) {
                            const nameNode = declarator.children.find((c: any) => c.type === 'identifier');
                            return nameNode ? doc.getText(new vscode.Range(
                                nameNode.startPosition.row,
                                nameNode.startPosition.column,
                                nameNode.endPosition.row,
                                nameNode.endPosition.column
                            )) : 'unknown';
                        }
                        return 'unknown';
                    });
            }

            return { type: 'class', details };
        }

        return { type: current.type, details };
    }

    private extractTypeScriptStructure(node: any, doc: vscode.TextDocument): { type: string; details: any } {
        // Similar to Java but for TypeScript/React
        let current = node;
        while (current && !['class_declaration', 'interface_declaration', 'function_declaration'].includes(current.type)) {
            current = current.parent;
        }

        if (!current) {
            return { type: 'unknown', details: {} };
        }

        return { type: current.type, details: {} };
    }

    private async findReferences(location: { file: string; line: number }): Promise<{
        file: string;
        line: number;
        language: string;
        context: string;
    }[]> {
        const doc = await vscode.workspace.openTextDocument(location.file);
        const position = new vscode.Position(location.line, 0);

        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            doc.uri,
            position
        );

        if (!references) {
            return [];
        }

        const results = [];
        for (const ref of references) {
            const refDoc = await vscode.workspace.openTextDocument(ref.uri);
            const context = refDoc.getText(new vscode.Range(
                Math.max(0, ref.range.start.line - 1),
                0,
                ref.range.end.line + 1,
                999
            ));

            results.push({
                file: ref.uri.fsPath,
                line: ref.range.start.line,
                language: refDoc.languageId,
                context: context.trim()
            });
        }

        return results;
    }

    private async findCrossLanguageLinks(
        symbolName: string,
        location: { file: string; language: string }
    ): Promise<{
        type: 'api-endpoint' | 'data-model' | 'event' | 'import';
        source: { file: string; language: string; };
        target: { file: string; language: string; };
        connection: string;
    }[]> {
        const links: {
            type: 'api-endpoint' | 'data-model' | 'event' | 'import';
            source: { file: string; language: string; };
            target: { file: string; language: string; };
            connection: string;
        }[] = [];

        // Find matching file in other language
        const basename = path.basename(location.file, path.extname(location.file));
        const otherLanguage = location.language === 'java' ? 'typescript' : 'java';
        const otherExtension = otherLanguage === 'java' ? '.java' : '.ts';

        // Search workspace for matching file
        const files = await vscode.workspace.findFiles(`**/${basename}${otherExtension}`);

        for (const file of files) {
            links.push({
                type: 'data-model' as const,
                source: { file: location.file, language: location.language },
                target: { file: file.fsPath, language: otherLanguage },
                connection: `Same base name: ${basename}`
            });
        }

        // TODO: Add API endpoint matching, event matching, etc.

        return links;
    }

    private calculateRiskScore(
        structure: any,
        references: any[],
        crossLanguageLinks: any[]
    ): number {
        let score = 0;

        // More references = higher risk
        score += Math.min(references.length * 2, 40);

        // Cross-language dependencies = higher risk
        score += crossLanguageLinks.length * 10;

        // Public visibility = higher risk
        if (structure.details.visibility === 'public') {
            score += 20;
        }

        // Abstract classes = higher risk (many implementations)
        if (structure.details.isAbstract) {
            score += 15;
        }

        return Math.min(score, 100);
    }

    private generateRecommendation(
        riskScore: number,
        references: any[],
        crossLanguageLinks: any[]
    ): string {
        if (riskScore > 80) {
            return `⛔ HIGH RISK: This symbol is critical. ${references.length} files depend on it. ` +
                   `Consider creating a new interface instead of modifying this one.`;
        }

        if (riskScore > 50) {
            return `⚠️ MEDIUM RISK: ${references.length} files affected. ` +
                   `${crossLanguageLinks.length > 0 ? `Includes ${crossLanguageLinks.length} cross-language links. ` : ''}` +
                   `Test thoroughly and consider phased rollout.`;
        }

        return `✅ LOW RISK: Limited impact. Safe to proceed with normal testing.`;
    }

    // Simplified implementations for feature finding
    private extractKeywords(query: string): string[] {
        return query.toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 3);
    }

    private async searchKnowledgeBase(keywords: string[]): Promise<any[]> {
        // Use existing KB search
        return [];
    }

    private async findEntryPoints(keywords: string[], kbResults: any[]): Promise<any> {
        return { frontend: undefined, backend: undefined };
    }

    private async buildCallFlow(entryPoints: any): Promise<any> {
        return {
            frontend: [],
            backend: [],
            crossLanguageLinks: []
        };
    }

    private calculateConfidence(query: string, callFlow: any, kbResults: any[]): number {
        return 0.7;  // Default confidence
    }

    private inferFeatureName(keywords: string[], callFlow: any): string {
        return keywords[0] || 'unknown';
    }

    private extractSymbolNames(callFlow: any): string[] {
        return [];
    }

    private async planChanges(impact: ImpactAnalysis, proposedChange: string): Promise<any[]> {
        return impact.references.map(ref => ({
            file: ref.file,
            language: ref.language,
            changes: [`Update reference to ${impact.symbolName}`]
        }));
    }

    private generateStrategy(impact: ImpactAnalysis, affectedFiles: any[], canProceed: boolean): any {
        if (!canProceed) {
            return {
                approach: 'blocked',
                steps: ['Resolve blockers before proceeding'],
                rollbackPlan: 'N/A'
            };
        }

        if (impact.riskScore > 50) {
            return {
                approach: 'risky',
                steps: [
                    '1. Create feature flag',
                    '2. Update main symbol',
                    '3. Update each dependent file',
                    '4. Test with flag enabled',
                    '5. Gradual rollout'
                ],
                rollbackPlan: 'Disable feature flag and revert main symbol'
            };
        }

        return {
            approach: 'safe',
            steps: [
                '1. Update main symbol',
                '2. Update dependent files',
                '3. Run tests'
            ],
            rollbackPlan: 'Git revert'
        };
    }
}
