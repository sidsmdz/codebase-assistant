/**
 * Protocol Buffer (.proto) Parser
 * Parses gRPC service definitions to extract services, methods, and messages
 * This enables cross-language feature tracking: TypeScript → gRPC → Java
 */

import { ASTNode, ASTParser, Parameter } from './ASTParser';

export interface ProtoService {
    name: string;
    filePath: string;
    methods: ProtoMethod[];
    lineNumber: number;
}

export interface ProtoMethod {
    name: string;
    inputType: string;
    outputType: string;
    streaming: {
        client: boolean;
        server: boolean;
    };
    lineNumber: number;
    signature: string;
}

export interface ProtoMessage {
    name: string;
    filePath: string;
    fields: ProtoField[];
    lineNumber: number;
}

export interface ProtoField {
    name: string;
    type: string;
    number: number;
    repeated: boolean;
    optional: boolean;
}

export class ProtoParser extends ASTParser {
    /**
     * Parse a .proto file and extract AST nodes
     */
    parse(content: string, filePath: string): ASTNode[] {
        const nodes: ASTNode[] = [];

        // Extract services
        const services = this.extractServices(content, filePath);
        services.forEach(service => {
            // Add service node (as CLASS type since there's no SERVICE type)
            const serviceId = this.generateId(filePath, service.name, service.lineNumber);
            nodes.push({
                id: serviceId,
                type: 'CLASS',
                identifier: service.name,
                signature: `service ${service.name}`,
                filePath,
                startLine: service.lineNumber,
                endLine: service.lineNumber + 1,
                language: 'java', // Proto is language-agnostic but used with Java/TS
                modifiers: ['service']
            });

            // Add method nodes
            service.methods.forEach(method => {
                const methodId = this.generateId(filePath, method.name, method.lineNumber);
                const streaming = [];
                if (method.streaming.client) {streaming.push('client_streaming');}
                if (method.streaming.server) {streaming.push('server_streaming');}

                const parameters: Parameter[] = [{
                    name: 'request',
                    type: method.inputType
                }];

                nodes.push({
                    id: methodId,
                    type: 'METHOD',
                    identifier: method.name,
                    signature: method.signature,
                    filePath,
                    startLine: method.lineNumber,
                    endLine: method.lineNumber + 1,
                    language: 'java',
                    parameters,
                    returnType: method.outputType,
                    parentId: serviceId,
                    modifiers: streaming.length > 0 ? streaming : undefined
                });
            });
        });

        // Extract messages
        const messages = this.extractMessages(content, filePath);
        messages.forEach(message => {
            // Add message node
            const messageId = this.generateId(filePath, message.name, message.lineNumber);
            nodes.push({
                id: messageId,
                type: 'CLASS',
                identifier: message.name,
                signature: `message ${message.name}`,
                filePath,
                startLine: message.lineNumber,
                endLine: message.lineNumber + 1,
                language: 'java',
                modifiers: ['message']
            });

            // Add field nodes as VARIABLE type
            message.fields.forEach(field => {
                const fieldId = this.generateId(filePath, `${message.name}.${field.name}`, 0);
                const modifiers = [];
                if (field.repeated) {modifiers.push('repeated');}
                if (field.optional) {modifiers.push('optional');}

                nodes.push({
                    id: fieldId,
                    type: 'VARIABLE',
                    identifier: field.name,
                    signature: `${modifiers.join(' ')} ${field.type} ${field.name} = ${field.number}`,
                    filePath,
                    startLine: 0,
                    endLine: 0,
                    language: 'java',
                    returnType: field.type,
                    parentId: messageId,
                    modifiers: modifiers.length > 0 ? modifiers : undefined
                });
            });
        });

        return nodes;
    }

    /**
     * Extract services from proto content
     */
    private extractServices(content: string, filePath: string): ProtoService[] {
        const services: ProtoService[] = [];

        // Match: service ServiceName {
        const serviceRegex = /service\s+(\w+)\s*\{/g;
        let match;

        while ((match = serviceRegex.exec(content)) !== null) {
            const serviceName = match[1];
            const serviceStart = match.index;

            // Find line number
            const lineNumber = content.substring(0, serviceStart).split('\n').length;

            // Extract service body
            const serviceBody = this.extractBlock(content, serviceStart);

            // Extract methods from service body
            const methods = this.extractMethods(serviceBody);

            services.push({
                name: serviceName,
                filePath,
                methods,
                lineNumber
            });
        }

        return services;
    }

    /**
     * Extract methods from service body
     */
    private extractMethods(serviceBody: string): ProtoMethod[] {
        const methods: ProtoMethod[] = [];

        // Match: rpc MethodName (stream? InputType) returns (stream? OutputType);
        const methodRegex = /rpc\s+(\w+)\s*\(\s*(stream\s+)?(\w+)\s*\)\s*returns\s*\(\s*(stream\s+)?(\w+)\s*\)/g;
        let match;

        while ((match = methodRegex.exec(serviceBody)) !== null) {
            const methodName = match[1];
            const clientStreaming = !!match[2];
            const inputType = match[3];
            const serverStreaming = !!match[4];
            const outputType = match[5];

            const signature = this.buildMethodSignature(
                methodName,
                inputType,
                outputType,
                clientStreaming,
                serverStreaming
            );

            methods.push({
                name: methodName,
                inputType,
                outputType,
                streaming: {
                    client: clientStreaming,
                    server: serverStreaming
                },
                lineNumber: 0,
                signature
            });
        }

        return methods;
    }

    /**
     * Build method signature string
     */
    private buildMethodSignature(
        name: string,
        input: string,
        output: string,
        clientStream: boolean,
        serverStream: boolean
    ): string {
        const inputStr = clientStream ? `stream ${input}` : input;
        const outputStr = serverStream ? `stream ${output}` : output;
        return `rpc ${name}(${inputStr}) returns (${outputStr})`;
    }

    /**
     * Extract messages from proto content
     */
    private extractMessages(content: string, filePath: string): ProtoMessage[] {
        const messages: ProtoMessage[] = [];

        // Match: message MessageName {
        const messageRegex = /message\s+(\w+)\s*\{/g;
        let match;

        while ((match = messageRegex.exec(content)) !== null) {
            const messageName = match[1];
            const messageStart = match.index;

            // Find line number
            const lineNumber = content.substring(0, messageStart).split('\n').length;

            // Extract message body
            const messageBody = this.extractBlock(content, messageStart);

            // Extract fields from message body
            const fields = this.extractFields(messageBody);

            messages.push({
                name: messageName,
                filePath,
                fields,
                lineNumber
            });
        }

        return messages;
    }

    /**
     * Extract fields from message body
     */
    private extractFields(messageBody: string): ProtoField[] {
        const fields: ProtoField[] = [];

        // Match: (repeated|optional)? Type fieldName = number;
        const fieldRegex = /(repeated|optional)?\s*(\w+)\s+(\w+)\s*=\s*(\d+)/g;
        let match;

        while ((match = fieldRegex.exec(messageBody)) !== null) {
            const modifier = match[1];
            const type = match[2];
            const name = match[3];
            const number = parseInt(match[4], 10);

            fields.push({
                name,
                type,
                number,
                repeated: modifier === 'repeated',
                optional: modifier === 'optional'
            });
        }

        return fields;
    }

    /**
     * Extract a block (content between curly braces)
     */
    private extractBlock(content: string, startIndex: number): string {
        let braceCount = 0;
        let inBlock = false;
        let blockStart = -1;
        let blockEnd = -1;

        for (let i = startIndex; i < content.length; i++) {
            const char = content[i];

            if (char === '{') {
                if (!inBlock) {
                    inBlock = true;
                    blockStart = i + 1;
                }
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0 && inBlock) {
                    blockEnd = i;
                    break;
                }
            }
        }

        if (blockStart !== -1 && blockEnd !== -1) {
            return content.substring(blockStart, blockEnd);
        }

        return '';
    }
}
