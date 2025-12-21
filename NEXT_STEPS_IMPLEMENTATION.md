# Immediate Implementation Plan

Based on your feedback, here are the critical issues and solutions:

## 🔴 Critical Issue #1: Example Prompts Don't Work

**Problem**: Clicking AG Grid, CreateAsyncService examples does nothing

**Root Cause**: Event listeners not attached to `.example-prompt` elements

**Fix Needed** in `chatViewProvider.ts`:

```javascript
// Add after line ~1000 (after defining basic elements)
document.querySelectorAll('.example-prompt').forEach(prompt => {
    prompt.addEventListener('click', () => {
        const promptText = prompt.getAttribute('data-prompt');
        if (promptText) {
            input.value = promptText;
            sendMessage();
        }
    });
});
```

---

## 🔴 Critical Issue #2: End-to-End Feature Tracking

**Problem**: Plugin should help understand features across the entire stack (TS → Proto → Java)

**Solution**: Implement **Protocol Buffer Parser** + **Cross-Language Dependency Graph**

### Implementation Steps:

#### 1. Add Proto Parser (New File)

`src/parsers/ProtoParser.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';

export interface ProtoService {
    name: string;
    methods: ProtoMethod[];
    filePath: string;
}

export interface ProtoMethod {
    name: string;
    requestType: string;
    responseType: string;
    streaming: {
        client: boolean;
        server: boolean;
    };
}

export interface ProtoMessage {
    name: string;
    fields: ProtoField[];
    filePath: string;
}

export interface ProtoField {
    name: string;
    type: string;
    number: number;
    repeated: boolean;
}

export class ProtoParser {
    /**
     * Parse a .proto file and extract services and messages
     */
    parse(filePath: string): {
        services: ProtoService[];
        messages: ProtoMessage[];
    } {
        const content = fs.readFileSync(filePath, 'utf-8');

        return {
            services: this.extractServices(content, filePath),
            messages: this.extractMessages(content, filePath)
        };
    }

    private extractServices(content: string, filePath: string): ProtoService[] {
        const services: ProtoService[] = [];

        // Match: service ServiceName { ... }
        const serviceRegex = /service\s+(\w+)\s*\{([^}]+)\}/g;
        let serviceMatch;

        while ((serviceMatch = serviceRegex.exec(content)) !== null) {
            const serviceName = serviceMatch[1];
            const serviceBody = serviceMatch[2];

            const methods = this.extractMethods(serviceBody);

            services.push({
                name: serviceName,
                methods,
                filePath
            });
        }

        return services;
    }

    private extractMethods(serviceBody: string): ProtoMethod[] {
        const methods: ProtoMethod[] = [];

        // Match: rpc MethodName (RequestType) returns (stream ResponseType);
        const methodRegex = /rpc\s+(\w+)\s*\(\s*(stream\s+)?(\w+)\s*\)\s*returns\s*\(\s*(stream\s+)?(\w+)\s*\)/g;
        let methodMatch;

        while ((methodMatch = methodRegex.exec(serviceBody)) !== null) {
            methods.push({
                name: methodMatch[1],
                requestType: methodMatch[3],
                responseType: methodMatch[5],
                streaming: {
                    client: !!methodMatch[2],
                    server: !!methodMatch[4]
                }
            });
        }

        return methods;
    }

    private extractMessages(content: string, filePath: string): ProtoMessage[] {
        const messages: ProtoMessage[] = [];

        // Match: message MessageName { ... }
        const messageRegex = /message\s+(\w+)\s*\{([^}]+)\}/g;
        let messageMatch;

        while ((messageMatch = messageRegex.exec(content)) !== null) {
            const messageName = messageMatch[1];
            const messageBody = messageMatch[2];

            const fields = this.extractFields(messageBody);

            messages.push({
                name: messageName,
                fields,
                filePath
            });
        }

        return messages;
    }

    private extractFields(messageBody: string): ProtoField[] {
        const fields: ProtoField[] = [];

        // Match: repeated Type fieldName = number;
        const fieldRegex = /(repeated\s+)?(\w+)\s+(\w+)\s*=\s*(\d+)/g;
        let fieldMatch;

        while ((fieldMatch = fieldRegex.exec(messageBody)) !== null) {
            fields.push({
                name: fieldMatch[3],
                type: fieldMatch[2],
                number: parseInt(fieldMatch[4]),
                repeated: !!fieldMatch[1]
            });
        }

        return fields;
    }

    /**
     * Find all .proto files in a directory
     */
    static findProtoFiles(dir: string): string[] {
        const protoFiles: string[] = [];

        function traverse(currentPath: string) {
            const items = fs.readdirSync(currentPath);

            for (const item of items) {
                const fullPath = path.join(currentPath, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
                    traverse(fullPath);
                } else if (stat.isFile() && item.endsWith('.proto')) {
                    protoFiles.push(fullPath);
                }
            }
        }

        traverse(dir);
        return protoFiles;
    }
}
```

#### 2. Cross-Language Feature Tracker

`src/analysis/FeatureTracker.ts`:

```typescript
import { ProtoParser, ProtoService, ProtoMethod } from '../parsers/ProtoParser';
import { JavaASTParser } from '../parsers/JavaASTParser';
import { TypeScriptASTParser } from '../parsers/TypeScriptASTParser';
import { ASTNode } from '../parsers/ASTParser';

export interface FeatureFlow {
    featureName: string;
    trigger: {
        file: string;
        component: string;
        method: string;
        language: 'typescript';
    };
    protocol: {
        service: string;
        method: string;
        requestType: string;
        responseType: string;
        streaming: boolean;
    };
    implementation: {
        file: string;
        class: string;
        method: string;
        language: 'java';
    };
    uiUpdates: {
        file: string;
        method: string;
        layoutBuilders: string[];
    }[];
}

export class FeatureTracker {
    private protoParser: ProtoParser;
    private javaParser: JavaASTParser;
    private tsParser: TypeScriptASTParser;

    constructor() {
        this.protoParser = new ProtoParser();
        this.javaParser = new JavaASTParser();
        this.tsParser = new TypeScriptASTParser(true);
    }

    /**
     * Trace a feature end-to-end across the stack
     */
    async traceFeature(
        tsFiles: string[],
        protoFiles: string[],
        javaFiles: string[]
    ): Promise<FeatureFlow[]> {
        const features: FeatureFlow[] = [];

        // Step 1: Parse proto files to get the "bridge"
        const protoServices = this.parseProtoFiles(protoFiles);

        // Step 2: For each proto service method, find TS triggers and Java implementations
        for (const service of protoServices) {
            for (const method of service.methods) {
                const feature = await this.traceMethodFlow(
                    method,
                    service.name,
                    tsFiles,
                    javaFiles
                );

                if (feature) {
                    features.push(feature);
                }
            }
        }

        return features;
    }

    private parseProtoFiles(protoFiles: string[]): ProtoService[] {
        const services: ProtoService[] = [];

        for (const file of protoFiles) {
            const parsed = this.protoParser.parse(file);
            services.push(...parsed.services);
        }

        return services;
    }

    private async traceMethodFlow(
        method: ProtoMethod,
        serviceName: string,
        tsFiles: string[],
        javaFiles: string[]
    ): Promise<FeatureFlow | null> {
        // Find TypeScript component that calls this gRPC method
        const trigger = this.findTSTrigger(method, serviceName, tsFiles);
        if (!trigger) return null;

        // Find Java implementation of this gRPC method
        const implementation = this.findJavaImplementation(method, serviceName, javaFiles);
        if (!implementation) return null;

        // Find UI updates in Java (Layout.Builder calls)
        const uiUpdates = this.findUIUpdates(javaFiles, method);

        return {
            featureName: `${serviceName}.${method.name}`,
            trigger,
            protocol: {
                service: serviceName,
                method: method.name,
                requestType: method.requestType,
                responseType: method.responseType,
                streaming: method.streaming.server || method.streaming.client
            },
            implementation,
            uiUpdates
        };
    }

    private findTSTrigger(method: ProtoMethod, serviceName: string, tsFiles: string[]): any {
        // Search for gRPC client calls in TypeScript
        for (const file of tsFiles) {
            const content = require('fs').readFileSync(file, 'utf-8');

            // Look for: client.methodName(...) or Client.methodName(...)
            const callPattern = new RegExp(`\\b(client|Client)\\.${method.name}\\s*\\(`, 'i');

            if (callPattern.test(content)) {
                // Parse file to get more details
                const nodes = this.tsParser.parse(content, file);

                // Find the component/function containing this call
                const componentNode = nodes.find(n =>
                    n.type === 'CLASS' || n.type === 'FUNCTION'
                );

                return {
                    file,
                    component: componentNode?.identifier || 'Unknown',
                    method: method.name,
                    language: 'typescript' as const
                };
            }
        }

        return null;
    }

    private findJavaImplementation(method: ProtoMethod, serviceName: string, javaFiles: string[]): any {
        // Search for gRPC service implementation in Java
        for (const file of javaFiles) {
            const content = require('fs').readFileSync(file, 'utf-8');

            // Look for: extends ServiceNameGrpc.ServiceNameImplBase
            const implPattern = new RegExp(`extends\\s+${serviceName}Grpc\\.${serviceName}ImplBase`);

            if (implPattern.test(content)) {
                const nodes = this.javaParser.parse(content, file);

                // Find the class
                const classNode = nodes.find(n => n.type === 'CLASS');

                // Find the method implementation
                const methodNode = nodes.find(n =>
                    n.type === 'METHOD' && n.identifier === method.name
                );

                if (classNode && methodNode) {
                    return {
                        file,
                        class: classNode.identifier,
                        method: method.name,
                        language: 'java' as const
                    };
                }
            }
        }

        return null;
    }

    private findUIUpdates(javaFiles: string[], method: ProtoMethod): any[] {
        const uiUpdates: any[] = [];

        for (const file of javaFiles) {
            const content = require('fs').readFileSync(file, 'utf-8');

            // Look for Layout.Builder or Component.Builder patterns
            const layoutPattern = /(\w+)\.newBuilder\(\)|\.setComponent\(|\.addComponent\(/g;

            if (layoutPattern.test(content)) {
                const nodes = this.javaParser.parse(content, file);

                // Find methods that build layouts
                const builderMethods = nodes.filter(n =>
                    n.type === 'METHOD' &&
                    n.code?.includes('Builder')
                );

                if (builderMethods.length > 0) {
                    uiUpdates.push({
                        file,
                        method: builderMethods[0].identifier,
                        layoutBuilders: builderMethods.map(m => m.identifier)
                    });
                }
            }
        }

        return uiUpdates;
    }
}
```

#### 3. Add Chat Command for Feature Tracing

In chat panel, add new command:

```
User: "trace feature: update user profile"
or
User: "show flow for updateLayout gRPC method"
```

Handler returns:

```
📊 Feature Flow: UserService.updateLayout

1. 🎯 Trigger (TypeScript)
   File: src/components/UserProfile.tsx
   Component: UserProfileComponent
   Calls: client.updateLayout(request)

2. 🔌 Protocol (gRPC)
   Service: UserService
   Method: updateLayout
   Request: UpdateLayoutRequest
   Response: stream LayoutResponse

3. ⚙️ Implementation (Java)
   File: UserServiceImpl.java
   Class: UserServiceImpl
   Method: updateLayout

4. 🎨 UI Updates
   - buildUserProfileLayout()
   - buildHeaderComponent()
   - buildActionButtons()
```

---

## 🎯 Priority Order

1. **Fix example prompts** (5 minutes) ← DO THIS FIRST
2. **Add pattern browser UI** (1 hour)
3. **Add proto parser** (1 hour)
4. **Add feature tracker** (2 hours)
5. **Write comprehensive tests** (1 hour)

Total: ~5 hours for complete end-to-end feature

---

## Quick Fix for Example Prompts

**File**: `src/chatViewProvider.ts`

**Find** (around line 1050):
```javascript
const sendButton = document.getElementById('send-button');
```

**Add after**:
```javascript
// Fix example prompts
document.querySelectorAll('.example-prompt').forEach(prompt => {
    prompt.addEventListener('click', () => {
        const promptText = prompt.getAttribute('data-prompt');
        if (promptText) {
            input.value = promptText;
            sendMessage();
        }
    });
});
```

This will immediately fix the broken example prompts!

---

Let me know which part you'd like me to implement first - I recommend:
1. Fix example prompts (immediate win)
2. Add pattern browser
3. Then add proto parser + feature tracker for the full end-to-end vision
