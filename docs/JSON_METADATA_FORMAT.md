# JSON Metadata Format for Context Hierarchies

## Problem

The LLM needs to understand **hierarchical relationships** between code elements across languages. For example:

```
Frontend (TypeScript)          Backend (Java)
─────────────────────          ──────────────
usePermission.ts hook    →     PermissionService.java
  ↓ calls                        ↓ validates
PermissionContext.tsx    →     Permission.java entity
  ↓ renders                      ↓ throws
PermissionBadge.tsx      →     PermissionDeniedException.java
```

Current context just shows **flat list** of files. LLM doesn't understand the **call flow** or **dependency hierarchy**.

## Solution: Structured JSON Metadata

Inject JSON metadata into the context that shows relationships:

```markdown
### 🎯 SYSTEM INSTRUCTION - CONTEXT ANCHORING
**Use the provided interfaces as GROUND TRUTH.**
**Do NOT ask clarifying questions if definitions exist.**

### 📊 CONTEXT METADATA
```json
{
  "feature": "permissions",
  "languages": ["java", "typescript"],
  "callGraph": {
    "frontend": {
      "entry": "usePermission.ts",
      "flow": [
        {
          "file": "hooks/usePermission.ts",
          "type": "hook",
          "exports": ["usePermission", "PermissionState"],
          "calls": ["/api/permissions/check"],
          "dependencies": ["PermissionContext"]
        },
        {
          "file": "contexts/PermissionContext.tsx",
          "type": "context",
          "exports": ["PermissionProvider", "usePermissionContext"],
          "provides": {
            "hasPermission": "function",
            "permissions": "string[]",
            "loading": "boolean"
          }
        }
      ]
    },
    "backend": {
      "entry": "PermissionController.java",
      "flow": [
        {
          "file": "controllers/PermissionController.java",
          "type": "controller",
          "endpoints": [
            {
              "path": "/api/permissions/check",
              "method": "POST",
              "calls": ["PermissionService.validatePermission"]
            }
          ]
        },
        {
          "file": "services/PermissionService.java",
          "type": "service",
          "methods": {
            "validatePermission": {
              "params": ["userId", "resource", "action"],
              "returns": "boolean",
              "throws": ["PermissionDeniedException"],
              "transactional": true
            }
          },
          "dependencies": ["PermissionRepository", "Permission"]
        },
        {
          "file": "entities/Permission.java",
          "type": "entity",
          "table": "permissions",
          "fields": {
            "id": "Long",
            "userId": "Long",
            "resource": "String",
            "actions": "Set<String>"
          }
        }
      ]
    },
    "crossLanguageLinks": [
      {
        "frontend": "hooks/usePermission.ts",
        "backend": "controllers/PermissionController.java",
        "connection": "API endpoint /api/permissions/check"
      },
      {
        "frontend": "types/Permission.ts",
        "backend": "entities/Permission.java",
        "connection": "Data model mapping"
      }
    ]
  },
  "diagnostics": [
    {
      "file": "services/PermissionService.java",
      "line": 45,
      "severity": "error",
      "message": "PermissionDeniedException may not be caught",
      "context": "This exception flows to frontend as 403 Forbidden"
    }
  ]
}
```

### 📋 WORKSPACE SKELETON
...rest of context...
```

## Metadata Structure

### Top-Level Schema

```typescript
interface ContextMetadata {
    feature: string;              // "permissions", "authentication", etc.
    languages: string[];          // ["java", "typescript"]
    callGraph: CallGraph;
    diagnostics?: Diagnostic[];
    
    // Optional: Performance data
    hotPaths?: HotPath[];
    
    // Optional: Security context
    securityContext?: SecurityInfo;
}
```

### Call Graph Schema

```typescript
interface CallGraph {
    frontend?: FrontendFlow;
    backend?: BackendFlow;
    crossLanguageLinks: CrossLanguageLink[];
}

interface FrontendFlow {
    entry: string;               // Entry point file
    framework: string;           // "react", "vue", "angular"
    flow: FrontendNode[];
}

interface FrontendNode {
    file: string;
    type: "hook" | "component" | "context" | "service" | "utility";
    exports?: string[];
    imports?: string[];
    calls?: string[];            // API endpoints called
    dependencies?: string[];     // Other frontend files
    props?: Record<string, string>;
    state?: Record<string, string>;
}

interface BackendFlow {
    entry: string;               // Entry point file
    framework: string;           // "spring", "express", "django"
    flow: BackendNode[];
}

interface BackendNode {
    file: string;
    type: "controller" | "service" | "repository" | "entity" | "dto";
    annotations?: string[];      // ["@RestController", "@Transactional"]
    endpoints?: Endpoint[];
    methods?: Record<string, MethodInfo>;
    dependencies?: string[];     // Other backend files
    database?: DatabaseInfo;
}

interface Endpoint {
    path: string;                // "/api/permissions/check"
    method: "GET" | "POST" | "PUT" | "DELETE";
    calls: string[];             // ["PermissionService.validatePermission"]
    params?: Parameter[];
    returns?: string;
    throws?: string[];
}

interface MethodInfo {
    params: string[];
    returns: string;
    throws?: string[];
    transactional?: boolean;
    async?: boolean;
    cached?: boolean;
}

interface CrossLanguageLink {
    frontend: string;            // File path
    backend: string;             // File path
    connection: string;          // Human-readable description
    type: "api" | "model" | "event" | "websocket";
}

interface Diagnostic {
    file: string;
    line: number;
    severity: "error" | "warning" | "info";
    message: string;
    context?: string;            // Why this matters for current query
}
```

## Generation Algorithm

### Step 1: Detect Feature

```typescript
function detectFeature(query: string, activeFiles: string[]): string | null {
    const keywords = extractKeywords(query);
    
    // Check active file names
    for (const file of activeFiles) {
        const basename = path.basename(file, path.extname(file));
        if (keywords.some(kw => basename.toLowerCase().includes(kw))) {
            return basename.replace(/Controller|Service|Repository/gi, '');
        }
    }
    
    // Check query directly
    const features = ['permission', 'auth', 'user', 'payment', 'order'];
    for (const feature of features) {
        if (keywords.some(kw => kw.includes(feature))) {
            return feature;
        }
    }
    
    return null;
}
```

### Step 2: Build Call Graph

```typescript
async function buildCallGraph(
    feature: string,
    workspaceFiles: string[]
): Promise<CallGraph> {
    const frontendFiles = workspaceFiles.filter(f => 
        f.includes('frontend') && (f.endsWith('.ts') || f.endsWith('.tsx'))
    );
    const backendFiles = workspaceFiles.filter(f => 
        f.includes('backend') && f.endsWith('.java')
    );
    
    // Find entry points
    const frontendEntry = findFrontendEntry(feature, frontendFiles);
    const backendEntry = findBackendEntry(feature, backendFiles);
    
    // Build flows
    const frontend = await buildFrontendFlow(frontendEntry, frontendFiles);
    const backend = await buildBackendFlow(backendEntry, backendFiles);
    
    // Find cross-language links
    const crossLanguageLinks = await findCrossLanguageLinks(frontend, backend);
    
    return { frontend, backend, crossLanguageLinks };
}
```

### Step 3: Extract Backend Flow (Java/Spring)

```typescript
async function buildBackendFlow(
    entryFile: string,
    allFiles: string[]
): Promise<BackendFlow> {
    const flow: BackendNode[] = [];
    const visited = new Set<string>();
    
    async function traverse(file: string, depth: number) {
        if (visited.has(file) || depth > 5) return;
        visited.add(file);
        
        const doc = await vscode.workspace.openTextDocument(file);
        const ast = await treeS parser.parse(doc.getText(), 'java');
        
        const node: BackendNode = {
            file,
            type: detectNodeType(file, ast),
            annotations: extractAnnotations(ast),
            dependencies: []
        };
        
        // Extract endpoints (if controller)
        if (node.type === 'controller') {
            node.endpoints = extractEndpoints(ast);
        }
        
        // Extract methods (if service)
        if (node.type === 'service') {
            node.methods = extractMethods(ast);
        }
        
        // Find dependencies
        const imports = extractImports(ast);
        for (const imp of imports) {
            const depFile = resolveImport(imp, allFiles);
            if (depFile) {
                node.dependencies!.push(path.basename(depFile));
                await traverse(depFile, depth + 1);
            }
        }
        
        flow.push(node);
    }
    
    await traverse(entryFile, 0);
    
    return {
        entry: path.basename(entryFile),
        framework: 'spring',
        flow
    };
}
```

### Step 4: Extract Frontend Flow (TypeScript/React)

```typescript
async function buildFrontendFlow(
    entryFile: string,
    allFiles: string[]
): Promise<FrontendFlow> {
    const flow: FrontendNode[] = [];
    const visited = new Set<string>();
    
    async function traverse(file: string, depth: number) {
        if (visited.has(file) || depth > 5) return;
        visited.add(file);
        
        const doc = await vscode.workspace.openTextDocument(file);
        const ast = await treeSitterParser.parse(doc.getText(), 'typescript');
        
        const node: FrontendNode = {
            file,
            type: detectNodeType(file, ast),
            exports: extractExports(ast),
            imports: extractImports(ast),
            dependencies: []
        };
        
        // Extract API calls
        node.calls = extractApiCalls(ast);
        
        // Extract props/state (if component)
        if (node.type === 'component' || node.type === 'hook') {
            node.props = extractProps(ast);
            node.state = extractState(ast);
        }
        
        // Find dependencies
        for (const imp of node.imports || []) {
            if (imp.startsWith('.')) {  // Local import
                const depFile = resolveRelativeImport(imp, file, allFiles);
                if (depFile) {
                    node.dependencies!.push(path.basename(depFile));
                    await traverse(depFile, depth + 1);
                }
            }
        }
        
        flow.push(node);
    }
    
    await traverse(entryFile, 0);
    
    return {
        entry: path.basename(entryFile),
        framework: 'react',
        flow
    };
}
```

### Step 5: Find Cross-Language Links

```typescript
function findCrossLanguageLinks(
    frontend: FrontendFlow,
    backend: BackendFlow
): CrossLanguageLink[] {
    const links: CrossLanguageLink[] = [];
    
    // Match API endpoints
    for (const frontendNode of frontend.flow) {
        for (const apiCall of frontendNode.calls || []) {
            for (const backendNode of backend.flow) {
                if (backendNode.type === 'controller') {
                    for (const endpoint of backendNode.endpoints || []) {
                        if (apiCall.includes(endpoint.path)) {
                            links.push({
                                frontend: frontendNode.file,
                                backend: backendNode.file,
                                connection: `API endpoint ${endpoint.path}`,
                                type: 'api'
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Match data models
    const frontendModels = frontend.flow.filter(n => 
        n.file.includes('types/') || n.file.includes('models/')
    );
    const backendEntities = backend.flow.filter(n => n.type === 'entity');
    
    for (const frontendModel of frontendModels) {
        for (const backendEntity of backendEntities) {
            const frontendBase = path.basename(frontendModel.file, '.ts');
            const backendBase = path.basename(backendEntity.file, '.java');
            
            if (frontendBase.toLowerCase() === backendBase.toLowerCase()) {
                links.push({
                    frontend: frontendModel.file,
                    backend: backendEntity.file,
                    connection: 'Data model mapping',
                    type: 'model'
                });
            }
        }
    }
    
    return links;
}
```

## Helper Functions

### Extract Endpoints from Controller

```typescript
function extractEndpoints(ast: Parser.Tree): Endpoint[] {
    const endpoints: Endpoint[] = [];
    
    // Find @GetMapping, @PostMapping, etc.
    const query = `
        (method_declaration
            (modifiers
                (annotation
                    name: (identifier) @annotation
                    arguments: (annotation_argument_list
                        (string_literal) @path)?))
            name: (identifier) @method_name
            body: (block) @body)
    `;
    
    const captures = ast.rootNode.query(query);
    
    for (const capture of captures) {
        if (capture.name === 'annotation') {
            const annotation = capture.node.text;
            if (annotation.match(/GetMapping|PostMapping|PutMapping|DeleteMapping/)) {
                const method = annotation.includes('Get') ? 'GET' :
                              annotation.includes('Post') ? 'POST' :
                              annotation.includes('Put') ? 'PUT' : 'DELETE';
                
                const pathCapture = captures.find(c => 
                    c.name === 'path' && 
                    c.node.startPosition.row === capture.node.startPosition.row
                );
                const path = pathCapture ? 
                    pathCapture.node.text.replace(/['"]/g, '') : '';
                
                const bodyCapture = captures.find(c => 
                    c.name === 'body' && 
                    c.node.startPosition.row === capture.node.startPosition.row
                );
                const calls = bodyCapture ? 
                    extractMethodCalls(bodyCapture.node) : [];
                
                endpoints.push({ path, method, calls });
            }
        }
    }
    
    return endpoints;
}
```

### Extract API Calls from Frontend

```typescript
function extractApiCalls(ast: Parser.Tree): string[] {
    const calls: string[] = [];
    
    // Find fetch(), axios.get(), etc.
    const query = `
        (call_expression
            function: [
                (identifier) @func
                (member_expression
                    property: (property_identifier) @method)
            ]
            arguments: (arguments
                (string) @url))
    `;
    
    const captures = ast.rootNode.query(query);
    
    for (const capture of captures) {
        if (capture.name === 'url') {
            const url = capture.node.text.replace(/['"` ]/g, '');
            if (url.startsWith('/api/')) {
                calls.push(url);
            }
        }
    }
    
    return calls;
}
```

## Integration into ContextProvider

```typescript
// In ContextProvider.ts
async function formatAsPrompt(context: HybridContext): Promise<string> {
    const metadata = await generateContextMetadata(context);
    
    return `
### 🎯 SYSTEM INSTRUCTION - CONTEXT ANCHORING
**Use the provided interfaces as GROUND TRUTH.**
**Do NOT ask clarifying questions if definitions exist.**

### 📊 CONTEXT METADATA
\`\`\`json
${JSON.stringify(metadata, null, 2)}
\`\`\`

### 📋 WORKSPACE SKELETON (signatures only)
${formatSkeletonMap(context.skeletonMap)}

### 🔗 EXTERNAL DEPENDENCIES (LSP resolved)
${formatDependencies(context.dependencies)}

### 🎯 ACTIVE CODE (focal point)
${formatFocalPoint(context.focalPoint)}

**END OF CONTEXT GRAPH**
`;
}
```

## Example Output

For query: "@autoforge explain permissions"

```markdown
### 🎯 SYSTEM INSTRUCTION - CONTEXT ANCHORING
**Use the provided interfaces as GROUND TRUTH.**
**Do NOT ask clarifying questions if definitions exist.**

### 📊 CONTEXT METADATA
```json
{
  "feature": "permissions",
  "languages": ["java", "typescript"],
  "callGraph": {
    "frontend": {
      "entry": "usePermission.ts",
      "framework": "react",
      "flow": [
        {
          "file": "hooks/usePermission.ts",
          "type": "hook",
          "exports": ["usePermission"],
          "calls": ["/api/permissions/check"],
          "dependencies": ["PermissionContext.tsx"]
        }
      ]
    },
    "backend": {
      "entry": "PermissionController.java",
      "framework": "spring",
      "flow": [
        {
          "file": "PermissionController.java",
          "type": "controller",
          "endpoints": [{
            "path": "/api/permissions/check",
            "method": "POST",
            "calls": ["permissionService.validatePermission"]
          }]
        },
        {
          "file": "PermissionService.java",
          "type": "service",
          "methods": {
            "validatePermission": {
              "params": ["userId", "resource", "action"],
              "returns": "boolean",
              "throws": ["PermissionDeniedException"]
            }
          }
        }
      ]
    },
    "crossLanguageLinks": [{
      "frontend": "hooks/usePermission.ts",
      "backend": "PermissionController.java",
      "connection": "API endpoint /api/permissions/check",
      "type": "api"
    }]
  }
}
```

### 📋 WORKSPACE SKELETON
...

```

## Benefits

1. **Hierarchy Visibility:** LLM sees call flow, not just flat list
2. **Cross-Language Context:** Understands Java ↔ TypeScript connections
3. **API Mapping:** Knows which frontend calls which backend
4. **Error Context:** Diagnostics explain why errors matter
5. **Structured Data:** JSON easier to parse than prose

## Testing

```typescript
// Test metadata generation
const metadata = await generateContextMetadata(context);
console.log(JSON.stringify(metadata, null, 2));

// Should show:
// - Feature detected: "permissions"
// - Frontend entry: usePermission.ts
// - Backend entry: PermissionController.java
// - Cross-language link: /api/permissions/check
// - Dependencies: PermissionService → Permission entity
```

## Next Steps

1. Implement `generateContextMetadata()` function
2. Add JSON block to `formatAsPrompt()`
3. Test with permissions query
4. Verify LLM understands hierarchy

Want me to implement this now?
