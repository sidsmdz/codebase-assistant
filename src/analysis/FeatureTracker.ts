/**
 * Cross-Language Feature Tracker
 * Traces features end-to-end across the stack:
 * TypeScript UI → gRPC (Proto) → Java Backend → UI Updates
 *
 * Enables developers to understand complete feature flows in SDUI architecture
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { ProtoParser, ProtoMethod, ProtoService } from '../parsers/ProtoParser';
import { TypeScriptASTParser } from '../parsers/TypeScriptASTParser';
import { JavaASTParser } from '../parsers/JavaASTParser';
import { ASTNode } from '../parsers/ASTParser';

export interface FeatureFlow {
    featureName: string;
    service: string;
    method: string;
    flow: {
        trigger: TSTrigger | null;
        proto: ProtoDefinition | null;
        implementation: JavaImplementation | null;
        uiUpdate: UIUpdate | null;
    };
}

export interface TSTrigger {
    file: string;
    functionName: string;
    lineNumber: number;
    code: string;
    callsSite: string; // Where the gRPC call is made
}

export interface ProtoDefinition {
    file: string;
    service: string;
    method: string;
    inputType: string;
    outputType: string;
    streaming: {
        client: boolean;
        server: boolean;
    };
    lineNumber: number;
}

export interface JavaImplementation {
    file: string;
    className: string;
    methodName: string;
    lineNumber: number;
    code: string;
    annotations: string[];
}

export interface UIUpdate {
    file: string;
    updateMethod: string;
    lineNumber: number;
    code: string;
}

export class FeatureTracker {
    private protoParser: ProtoParser;
    private tsParser: TypeScriptASTParser;
    private javaParser: JavaASTParser;

    constructor() {
        this.protoParser = new ProtoParser();
        this.tsParser = new TypeScriptASTParser();
        this.javaParser = new JavaASTParser();
    }

    /**
     * Trace a feature end-to-end across the stack
     * @param featureName High-level feature name (e.g., "updateLayout", "fetchUserData")
     * @param workspaceRoot Root directory of the workspace
     */
    async traceFeature(featureName: string, workspaceRoot: string): Promise<FeatureFlow[]> {
        const flows: FeatureFlow[] = [];

        // 1. Find all .proto files
        const protoFiles = await this.findFiles(workspaceRoot, '.proto');

        // 2. Parse proto files and find relevant services
        for (const protoFile of protoFiles) {
            const content = await fs.readFile(protoFile, 'utf-8');
            const services = this.parseProtoServices(content, protoFile);

            // 3. For each service method, try to build complete flow
            for (const service of services) {
                for (const method of service.methods) {
                    // Check if method name matches feature
                    if (this.matchesFeature(method.name, featureName)) {
                        const flow = await this.buildCompleteFlow(
                            featureName,
                            service,
                            method,
                            workspaceRoot
                        );

                        if (flow) {
                            flows.push(flow);
                        }
                    }
                }
            }
        }

        return flows;
    }

    /**
     * Build complete flow for a specific method
     */
    private async buildCompleteFlow(
        featureName: string,
        service: ProtoService,
        method: ProtoMethod,
        workspaceRoot: string
    ): Promise<FeatureFlow | null> {
        const flow: FeatureFlow = {
            featureName,
            service: service.name,
            method: method.name,
            flow: {
                trigger: null,
                proto: {
                    file: service.filePath,
                    service: service.name,
                    method: method.name,
                    inputType: method.inputType,
                    outputType: method.outputType,
                    streaming: method.streaming,
                    lineNumber: method.lineNumber
                },
                implementation: null,
                uiUpdate: null
            }
        };

        // Find TypeScript trigger
        const tsFiles = await this.findFiles(workspaceRoot, '.ts', '.tsx');
        flow.flow.trigger = await this.findTSTrigger(method, service.name, tsFiles);

        // Find Java implementation
        const javaFiles = await this.findFiles(workspaceRoot, '.java');
        flow.flow.implementation = await this.findJavaImplementation(method, service.name, javaFiles);

        // Find UI update handlers
        if (flow.flow.implementation) {
            flow.flow.uiUpdate = await this.findUIUpdate(method, tsFiles);
        }

        return flow;
    }

    /**
     * Find TypeScript code that triggers the gRPC call
     */
    private async findTSTrigger(
        method: ProtoMethod,
        serviceName: string,
        tsFiles: string[]
    ): Promise<TSTrigger | null> {
        const methodPattern = new RegExp(`\\b${method.name}\\b`, 'i');
        const servicePattern = new RegExp(`\\b${serviceName}Client\\b`, 'i');

        for (const file of tsFiles) {
            try {
                const content = await fs.readFile(file, 'utf-8');

                // Look for service client usage
                if (servicePattern.test(content) && methodPattern.test(content)) {
                    const lines = content.split('\n');

                    // Find the line with the method call
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (methodPattern.test(line) && (
                            line.includes('.') || line.includes('await') || line.includes('client')
                        )) {
                            // Extract surrounding context
                            const contextStart = Math.max(0, i - 5);
                            const contextEnd = Math.min(lines.length, i + 10);
                            const code = lines.slice(contextStart, contextEnd).join('\n');

                            // Try to find function name
                            let functionName = 'unknown';
                            for (let j = i; j >= 0; j--) {
                                const funcMatch = lines[j].match(/(?:function|const|let|var)\s+(\w+)|(\w+)\s*[:=]\s*(?:async\s+)?\(/);
                                if (funcMatch) {
                                    functionName = funcMatch[1] || funcMatch[2];
                                    break;
                                }
                            }

                            return {
                                file,
                                functionName,
                                lineNumber: i + 1,
                                code,
                                callsSite: line.trim()
                            };
                        }
                    }
                }
            } catch (error) {
                // Skip files that can't be read
                continue;
            }
        }

        return null;
    }

    /**
     * Find Java implementation of the gRPC method
     */
    private async findJavaImplementation(
        method: ProtoMethod,
        serviceName: string,
        javaFiles: string[]
    ): Promise<JavaImplementation | null> {
        const methodPattern = new RegExp(`\\b${method.name}\\b`);

        for (const file of javaFiles) {
            try {
                const content = await fs.readFile(file, 'utf-8');

                // Check if file is service implementation
                const serviceImplPattern = new RegExp(`${serviceName}(Impl|Service)`, 'i');
                if (!serviceImplPattern.test(content)) {
                    continue;
                }

                // Look for method implementation
                if (methodPattern.test(content)) {
                    const lines = content.split('\n');

                    // Find method definition
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];

                        // Match method signature
                        if (methodPattern.test(line) && (
                            line.includes('public') || line.includes('private') || line.includes('protected')
                        )) {
                            // Extract method body
                            const methodStart = i;
                            const methodEnd = this.findMethodEnd(lines, methodStart);
                            const code = lines.slice(methodStart, methodEnd).join('\n');

                            // Find class name
                            let className = 'Unknown';
                            for (let j = i; j >= 0; j--) {
                                const classMatch = lines[j].match(/class\s+(\w+)/);
                                if (classMatch) {
                                    className = classMatch[1];
                                    break;
                                }
                            }

                            // Extract annotations
                            const annotations: string[] = [];
                            for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
                                const annMatch = lines[j].match(/@(\w+)/);
                                if (annMatch) {
                                    annotations.unshift(annMatch[0]);
                                } else if (lines[j].trim() && !lines[j].trim().startsWith('//')) {
                                    break;
                                }
                            }

                            return {
                                file,
                                className,
                                methodName: method.name,
                                lineNumber: i + 1,
                                code,
                                annotations
                            };
                        }
                    }
                }
            } catch (error) {
                continue;
            }
        }

        return null;
    }

    /**
     * Find UI update handlers (e.g., state updates, layout changes)
     */
    private async findUIUpdate(
        method: ProtoMethod,
        tsFiles: string[]
    ): Promise<UIUpdate | null> {
        // Look for state updates or layout changes related to the response
        const updatePatterns = [
            /setState/,
            /setLayout/,
            /updateUI/,
            /updateLayout/,
            /dispatch/
        ];

        for (const file of tsFiles) {
            try {
                const content = await fs.readFile(file, 'utf-8');

                // Check if file handles responses from this method
                const methodPattern = new RegExp(`\\b${method.name}\\b`, 'i');
                if (methodPattern.test(content)) {
                    const lines = content.split('\n');

                    // Find update calls near the method call
                    for (let i = 0; i < lines.length; i++) {
                        if (methodPattern.test(lines[i])) {
                            // Look ahead for UI updates
                            for (let j = i; j < Math.min(lines.length, i + 20); j++) {
                                for (const pattern of updatePatterns) {
                                    if (pattern.test(lines[j])) {
                                        const contextStart = Math.max(0, j - 3);
                                        const contextEnd = Math.min(lines.length, j + 5);
                                        const code = lines.slice(contextStart, contextEnd).join('\n');

                                        return {
                                            file,
                                            updateMethod: lines[j].trim(),
                                            lineNumber: j + 1,
                                            code
                                        };
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                continue;
            }
        }

        return null;
    }

    /**
     * Parse proto file to extract services
     */
    private parseProtoServices(content: string, filePath: string): ProtoService[] {
        const nodes = this.protoParser.parse(content, filePath);
        const services: ProtoService[] = [];
        const serviceMap: Map<string, ProtoService> = new Map();

        // First pass: create services
        for (const node of nodes) {
            if (node.type === 'CLASS' && node.modifiers?.includes('service')) {
                const service: ProtoService = {
                    name: node.identifier,
                    filePath,
                    methods: [],
                    lineNumber: node.startLine
                };
                services.push(service);
                serviceMap.set(node.id, service);
            }
        }

        // Second pass: add methods to services
        for (const node of nodes) {
            if (node.type === 'METHOD' && node.parentId) {
                const service = serviceMap.get(node.parentId);
                if (service) {
                    const isClientStreaming = node.modifiers?.includes('client_streaming') || false;
                    const isServerStreaming = node.modifiers?.includes('server_streaming') || false;

                    service.methods.push({
                        name: node.identifier,
                        inputType: node.parameters?.[0]?.type || 'Unknown',
                        outputType: node.returnType || 'Unknown',
                        streaming: {
                            client: isClientStreaming,
                            server: isServerStreaming
                        },
                        lineNumber: node.startLine,
                        signature: node.signature || ''
                    });
                }
            }
        }

        return services;
    }

    /**
     * Check if method name matches feature
     */
    private matchesFeature(methodName: string, featureName: string): boolean {
        const methodLower = methodName.toLowerCase();
        const featureLower = featureName.toLowerCase();

        return methodLower.includes(featureLower) ||
               featureLower.includes(methodLower) ||
               this.camelCaseContains(methodName, featureName);
    }

    /**
     * Check if camelCase string contains another string
     */
    private camelCaseContains(haystack: string, needle: string): boolean {
        const haystackParts = haystack.replace(/([A-Z])/g, ' $1').toLowerCase().split(' ');
        const needleParts = needle.replace(/([A-Z])/g, ' $1').toLowerCase().split(' ');

        for (const needlePart of needleParts) {
            if (haystackParts.some(h => h.includes(needlePart))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Find method end by tracking braces
     */
    private findMethodEnd(lines: string[], start: number): number {
        let braceCount = 0;
        let inMethod = false;

        for (let i = start; i < lines.length; i++) {
            const line = lines[i];

            for (const char of line) {
                if (char === '{') {
                    inMethod = true;
                    braceCount++;
                } else if (char === '}') {
                    braceCount--;
                    if (inMethod && braceCount === 0) {
                        return i + 1;
                    }
                }
            }
        }

        return Math.min(lines.length, start + 50); // Fallback
    }

    /**
     * Find files with specific extensions
     */
    private async findFiles(rootDir: string, ...extensions: string[]): Promise<string[]> {
        const files: string[] = [];

        const traverse = async (dir: string) => {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });

                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);

                    // Skip node_modules, .git, etc.
                    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
                        continue;
                    }

                    if (entry.isDirectory()) {
                        await traverse(fullPath);
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name);
                        if (extensions.includes(ext)) {
                            files.push(fullPath);
                        }
                    }
                }
            } catch (error) {
                // Skip directories we can't read
            }
        };

        await traverse(rootDir);
        return files;
    }

    /**
     * Format feature flow as readable text
     */
    formatFlow(flow: FeatureFlow): string {
        let output = `\n🔍 Feature Flow: ${flow.featureName}\n`;
        output += `📡 Service: ${flow.service}.${flow.method}\n\n`;

        if (flow.flow.trigger) {
            output += `1️⃣ TypeScript Trigger\n`;
            output += `   📄 File: ${path.basename(flow.flow.trigger.file)}\n`;
            output += `   🔧 Function: ${flow.flow.trigger.functionName}\n`;
            output += `   📍 Line: ${flow.flow.trigger.lineNumber}\n`;
            output += `   💡 Call: ${flow.flow.trigger.callsSite}\n\n`;
        }

        if (flow.flow.proto) {
            output += `2️⃣ gRPC Definition\n`;
            output += `   📄 File: ${path.basename(flow.flow.proto.file)}\n`;
            output += `   🔧 Method: ${flow.flow.proto.method}\n`;
            output += `   📥 Input: ${flow.flow.proto.inputType}\n`;
            output += `   📤 Output: ${flow.flow.proto.outputType}\n`;
            if (flow.flow.proto.streaming.server || flow.flow.proto.streaming.client) {
                const streamType = flow.flow.proto.streaming.server ? 'Server Streaming' :
                                   flow.flow.proto.streaming.client ? 'Client Streaming' : 'Bidirectional';
                output += `   🌊 Streaming: ${streamType}\n`;
            }
            output += `\n`;
        }

        if (flow.flow.implementation) {
            output += `3️⃣ Java Implementation\n`;
            output += `   📄 File: ${path.basename(flow.flow.implementation.file)}\n`;
            output += `   🔧 Class: ${flow.flow.implementation.className}\n`;
            output += `   📍 Line: ${flow.flow.implementation.lineNumber}\n`;
            if (flow.flow.implementation.annotations.length > 0) {
                output += `   🏷️  Annotations: ${flow.flow.implementation.annotations.join(', ')}\n`;
            }
            output += `\n`;
        }

        if (flow.flow.uiUpdate) {
            output += `4️⃣ UI Update\n`;
            output += `   📄 File: ${path.basename(flow.flow.uiUpdate.file)}\n`;
            output += `   🔧 Update: ${flow.flow.uiUpdate.updateMethod}\n`;
            output += `   📍 Line: ${flow.flow.uiUpdate.lineNumber}\n`;
        }

        return output;
    }
}
