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
 * Bridge Verification Result
 * Validates cross-language synchronization
 */
export interface BridgeVerification {
    status: 'SUCCESS' | 'STRUCTURE_MISMATCH' | 'TYPE_MISMATCH' | 'MISSING_FILE';
    canProceed: boolean;
    errors: {
        severity: 'error' | 'warning';
        file: string;
        message: string;
        details: string;
    }[];
    
    analysis: {
        javaChanges: ParsedChange[];
        typescriptChanges: ParsedChange[];
        missingFields: {
            field: string;
            inJava: boolean;
            inTypeScript: boolean;
            suggestedFix: string;
        }[];
        typeMismatches: {
            field: string;
            javaType: string;
            tsType: string;
            recommendation: string;
        }[];
    };
    
    summary: string;
}

interface ParsedChange {
    file: string;
    language: string;
    className?: string;
    interfaceName?: string;
    fields: { name: string; type: string; }[];
    methods: { name: string; returnType: string; }[];
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

    /**
     * TOOL 4: Verify Cross-Language Bridge
     * Validation Loop: Check generated code BEFORE presenting to user
     */
    async verifyBridge(proposedChangesJson: string): Promise<BridgeVerification> {
        const errors: BridgeVerification['errors'] = [];
        
        try {
            // Parse the proposed changes
            const proposed = JSON.parse(proposedChangesJson);
            
            if (!proposed.files || !Array.isArray(proposed.files)) {
                return {
                    status: 'MISSING_FILE',
                    canProceed: false,
                    errors: [{
                        severity: 'error',
                        file: 'N/A',
                        message: 'Invalid input format',
                        details: 'Expected format: {files: [{path: string, language: string, content: string}]}'
                    }],
                    analysis: {
                        javaChanges: [],
                        typescriptChanges: [],
                        missingFields: [],
                        typeMismatches: []
                    },
                    summary: 'Invalid input format'
                };
            }
            
            // Separate Java and TypeScript changes
            const javaFiles = proposed.files.filter((f: any) => f.language === 'java');
            const tsFiles = proposed.files.filter((f: any) => f.language === 'typescript' || f.language === 'ts');
            
            // Parse Java structures using Tree-sitter
            const javaChanges: ParsedChange[] = [];
            for (const file of javaFiles) {
                const parsed = await this.parseJavaStructure(file.content, file.path);
                if (parsed) {
                    javaChanges.push(parsed);
                }
            }
            
            // Parse TypeScript structures using Tree-sitter
            const tsChanges: ParsedChange[] = [];
            for (const file of tsFiles) {
                const parsed = await this.parseTypeScriptStructure(file.content, file.path);
                if (parsed) {
                    tsChanges.push(parsed);
                }
            }
            
            // Compare structures to find mismatches
            const missingFields: BridgeVerification['analysis']['missingFields'] = [];
            const typeMismatches: BridgeVerification['analysis']['typeMismatches'] = [];
            
            // For each Java class, find corresponding TypeScript interface
            for (const javaChange of javaChanges) {
                const className = javaChange.className || '';
                // Look for matching TS interface (e.g., UserDTO.java → UserDTO.ts or User.ts)
                const matchingTS = tsChanges.find(ts => 
                    ts.interfaceName === className || 
                    ts.file.includes(className.replace('DTO', ''))
                );
                
                if (!matchingTS) {
                    errors.push({
                        severity: 'warning',
                        file: javaChange.file,
                        message: `No matching TypeScript interface found for ${className}`,
                        details: `Consider creating ${className}.ts or updating the corresponding interface`
                    });
                    continue;
                }
                
                // Compare fields
                for (const javaField of javaChange.fields) {
                    const tsField = matchingTS.fields.find(f => f.name === javaField.name);
                    
                    if (!tsField) {
                        missingFields.push({
                            field: javaField.name,
                            inJava: true,
                            inTypeScript: false,
                            suggestedFix: `Add '${javaField.name}: ${this.mapJavaTypeToTS(javaField.type)};' to ${matchingTS.file}`
                        });
                        
                        errors.push({
                            severity: 'error',
                            file: matchingTS.file,
                            message: `Missing field '${javaField.name}' in TypeScript interface`,
                            details: `Java class ${className} has field '${javaField.name}: ${javaField.type}' but TypeScript interface is missing it`
                        });
                    } else {
                        // Check type compatibility
                        const expectedTSType = this.mapJavaTypeToTS(javaField.type);
                        if (tsField.type !== expectedTSType && !this.areTypesCompatible(javaField.type, tsField.type)) {
                            typeMismatches.push({
                                field: javaField.name,
                                javaType: javaField.type,
                                tsType: tsField.type,
                                recommendation: `Consider changing TypeScript type to '${expectedTSType}'`
                            });
                            
                            errors.push({
                                severity: 'warning',
                                file: matchingTS.file,
                                message: `Type mismatch for field '${javaField.name}'`,
                                details: `Java: ${javaField.type}, TypeScript: ${tsField.type}. Expected: ${expectedTSType}`
                            });
                        }
                    }
                }
                
                // Check for TS fields not in Java
                for (const tsField of matchingTS.fields) {
                    const javaField = javaChange.fields.find(f => f.name === tsField.name);
                    if (!javaField) {
                        missingFields.push({
                            field: tsField.name,
                            inJava: false,
                            inTypeScript: true,
                            suggestedFix: `Add 'private ${this.mapTSTypeToJava(tsField.type)} ${tsField.name};' to ${javaChange.file}`
                        });
                        
                        errors.push({
                            severity: 'error',
                            file: javaChange.file,
                            message: `Missing field '${tsField.name}' in Java class`,
                            details: `TypeScript interface has field '${tsField.name}: ${tsField.type}' but Java class is missing it`
                        });
                    }
                }
            }
            
            // Determine overall status
            const hasErrors = errors.some(e => e.severity === 'error');
            const status: BridgeVerification['status'] = 
                hasErrors ? (missingFields.length > 0 ? 'STRUCTURE_MISMATCH' : 'TYPE_MISMATCH') : 'SUCCESS';
            
            const summary = hasErrors 
                ? `Verification FAILED: ${errors.filter(e => e.severity === 'error').length} errors, ${errors.filter(e => e.severity === 'warning').length} warnings`
                : `Verification PASSED: All cross-language structures are synchronized`;
            
            return {
                status,
                canProceed: !hasErrors,
                errors,
                analysis: {
                    javaChanges,
                    typescriptChanges: tsChanges,
                    missingFields,
                    typeMismatches
                },
                summary
            };
            
        } catch (error) {
            return {
                status: 'MISSING_FILE',
                canProceed: false,
                errors: [{
                    severity: 'error',
                    file: 'N/A',
                    message: 'Failed to parse proposed changes',
                    details: error instanceof Error ? error.message : String(error)
                }],
                analysis: {
                    javaChanges: [],
                    typescriptChanges: [],
                    missingFields: [],
                    typeMismatches: []
                },
                summary: 'Verification failed due to parsing error'
            };
        }
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
        
        // Try multiple patterns to be more robust
        const patterns = [
            `**/${symbolName}.java`,
            `**/*/${symbolName}.java`,
            `**/${symbolName}.ts`,
            `**/*/${symbolName}.ts`,
            `**/${symbolName}.tsx`,
            `**/${symbolName}.jsx`
        ];
        
        let allFiles: vscode.Uri[] = [];
        for (const pattern of patterns) {
            const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 5);
            allFiles.push(...files);
            if (allFiles.length > 0) break; // Found some, no need to continue
        }

        if (allFiles.length > 0) {
            const file = allFiles[0];
            const doc = await vscode.workspace.openTextDocument(file);
            
            // Find class/interface/function declaration line
            const text = doc.getText();
            const patterns = [
                new RegExp(`class\\s+${symbolName}\\b`, 'm'),
                new RegExp(`interface\\s+${symbolName}\\b`, 'm'),
                new RegExp(`function\\s+${symbolName}\\b`, 'm'),
                new RegExp(`const\\s+${symbolName}\\s*=`, 'm'),
                new RegExp(`export\\s+.*\\s+${symbolName}\\b`, 'm')
            ];
            
            let line = 0;
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match) {
                    line = doc.positionAt(text.indexOf(match[0])).line;
                    break;
                }
            }

            console.log(`[AutoForge] Found ${symbolName} via file search at: ${file.fsPath}:${line}`);
            
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

    /**
     * Parse Java class structure from source code
     */
    private async parseJavaStructure(content: string, filePath: string): Promise<ParsedChange | null> {
        try {
            // Simple regex-based parsing (Tree-sitter parsing would be more robust)
            const classMatch = content.match(/class\s+(\w+)/);
            const className = classMatch ? classMatch[1] : undefined;
            
            const fields: { name: string; type: string; }[] = [];
            const fieldRegex = /private\s+(\w+(?:<[\w, ]+>)?)\s+(\w+);/g;
            let match;
            while ((match = fieldRegex.exec(content)) !== null) {
                fields.push({ type: match[1], name: match[2] });
            }
            
            const methods: { name: string; returnType: string; }[] = [];
            const methodRegex = /public\s+(\w+(?:<[\w, ]+>)?)\s+(\w+)\s*\(/g;
            while ((match = methodRegex.exec(content)) !== null) {
                methods.push({ returnType: match[1], name: match[2] });
            }
            
            return {
                file: filePath,
                language: 'java',
                className,
                fields,
                methods
            };
        } catch (error) {
            console.error('Failed to parse Java structure:', error);
            return null;
        }
    }

    /**
     * Parse TypeScript interface structure from source code
     */
    private async parseTypeScriptStructure(content: string, filePath: string): Promise<ParsedChange | null> {
        try {
            const interfaceMatch = content.match(/interface\s+(\w+)/);
            const interfaceName = interfaceMatch ? interfaceMatch[1] : undefined;
            
            const fields: { name: string; type: string; }[] = [];
            // Match: fieldName: type; or fieldName?: type;
            const fieldRegex = /(\w+)\??:\s*([\w<>\[\]]+);/g;
            let match;
            while ((match = fieldRegex.exec(content)) !== null) {
                fields.push({ name: match[1], type: match[2] });
            }
            
            const methods: { name: string; returnType: string; }[] = [];
            // Match: methodName(): returnType;
            const methodRegex = /(\w+)\s*\([^)]*\):\s*([\w<>\[\]]+);/g;
            while ((match = methodRegex.exec(content)) !== null) {
                methods.push({ name: match[1], returnType: match[2] });
            }
            
            return {
                file: filePath,
                language: 'typescript',
                interfaceName,
                fields,
                methods
            };
        } catch (error) {
            console.error('Failed to parse TypeScript structure:', error);
            return null;
        }
    }

    /**
     * Map Java types to TypeScript equivalents
     */
    private mapJavaTypeToTS(javaType: string): string {
        const typeMap: Record<string, string> = {
            'String': 'string',
            'Integer': 'number',
            'int': 'number',
            'Long': 'number',
            'long': 'number',
            'Double': 'number',
            'double': 'number',
            'Float': 'number',
            'float': 'number',
            'Boolean': 'boolean',
            'boolean': 'boolean',
            'Date': 'Date',
            'LocalDateTime': 'string',
            'LocalDate': 'string',
            'UUID': 'string'
        };
        
        // Handle generics: List<String> → string[]
        if (javaType.includes('List<') || javaType.includes('Set<')) {
            const innerType = javaType.match(/<(\w+)>/)?.[1];
            if (innerType) {
                return `${this.mapJavaTypeToTS(innerType)}[]`;
            }
        }
        
        return typeMap[javaType] || 'any';
    }

    /**
     * Map TypeScript types to Java equivalents
     */
    private mapTSTypeToJava(tsType: string): string {
        const typeMap: Record<string, string> = {
            'string': 'String',
            'number': 'Integer',
            'boolean': 'Boolean',
            'Date': 'LocalDateTime'
        };
        
        // Handle arrays: string[] → List<String>
        if (tsType.endsWith('[]')) {
            const innerType = tsType.replace('[]', '');
            return `List<${this.mapTSTypeToJava(innerType)}>`;
        }
        
        return typeMap[tsType] || 'Object';
    }

    /**
     * Check if Java and TypeScript types are compatible
     */
    private areTypesCompatible(javaType: string, tsType: string): boolean {
        const expectedTS = this.mapJavaTypeToTS(javaType);
        
        // Exact match
        if (expectedTS === tsType) {
            return true;
        }
        
        // number can be integer, long, double, etc.
        if (expectedTS === 'number' && tsType === 'number') {
            return true;
        }
        
        // string can be Date, UUID, etc.
        if (expectedTS === 'string' && tsType === 'string') {
            return true;
        }
        
        return false;
    }
}
