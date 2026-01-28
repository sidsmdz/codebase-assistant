# Debug: Java Files Not Being Indexed

## Issue
When indexing the sdui-broker project, only TypeScript patterns appear, no Java patterns are saved.

## Investigation Steps

### 1. Check if Java Files Exist
```bash
find test-fixtures/sdui-broker -name "*.java"
```

Result: ✅ 6 Java files found:
- backend/sdui/LayoutController.java (substantial file)
- backend/sdui/SideEffectEngine.java
- backend/sdui/EventProcessor.java
- backend/broker/SessionManager.java
- backend/broker/WebSocketBroker.java (173 lines)
- backend/broker/MessageRouter.java

### 2. Check File Size Threshold
In [ingestionService.ts:215](src/ingestionService.ts#L215):
```typescript
if (content.length < 200) {
    return true; // Skip file
}
```

All Java files are > 200 characters, so they pass this check.

### 3. Check AST Node Code Length Threshold
In [ingestionService.ts:112](src/ingestionService.ts#L112):
```typescript
if (!node.code || node.code.trim().length < 100) {
    continue; // Skip this node
}
```

**POTENTIAL ISSUE**: If the Java parser is returning AST nodes with code snippets < 100 characters, they'll be skipped!

### 4. Check JavaASTParser Implementation

The Java parser might be:
1. **Failing silently** - throwing exceptions that are caught
2. **Returning empty nodes** - no identifier or code
3. **Returning nodes with code < 100 chars** - methods/classes with minimal code

## Recommended Fixes

### Fix 1: Add Debug Logging

Add console logging in ingestionService.ts to see what's happening:

```typescript
// After line 103
if (language === 'java') {
    astNodes = this.javaParser.parse(content, file.fsPath);
    console.log(`Java AST Parser returned ${astNodes.length} nodes for ${relativePath}`);
    astNodes.forEach((node, idx) => {
        console.log(`  Node ${idx}: ${node.type} ${node.identifier}, code length: ${node.code?.length || 0}`);
    });
}
```

### Fix 2: Lower Code Length Threshold for Java

Java classes might have less boilerplate than TypeScript. Consider lowering the threshold or making it language-specific:

```typescript
const minCodeLength = language === 'java' ? 50 : 100;
if (!node.code || node.code.trim().length < minCodeLength) {
    continue;
}
```

### Fix 3: Check Parser Error Handling

Look at the try-catch at line 166:
```typescript
} catch (e) {
    console.warn(`Could not parse ${file.fsPath}: ${e}`);
}
```

This swallows all errors! Check if Java files are throwing errors during parsing.

## Quick Test

To verify if Java parsing works at all:

1. Add a simple test file: `test-java-parse.js`
```javascript
const { JavaASTParser } = require('./out/parsers/JavaASTParser');
const fs = require('fs');

const parser = new JavaASTParser();
const content = fs.readFileSync('test-fixtures/sdui-broker/backend/broker/WebSocketBroker.java', 'utf-8');
const nodes = parser.parse(content, 'WebSocketBroker.java');

console.log(`Parsed ${nodes.length} nodes`);
nodes.forEach(node => {
    console.log(`- ${node.type} ${node.identifier}: ${node.code.length} chars`);
});
```

2. Run: `node test-java-parse.js`

## Next Steps

1. ✅ Fixed modal UX (keep open on View/Use)
2. ✅ Added toast notifications
3. ⏳ Need to debug Java parser output
4. ⏳ Consider adding better error visibility during indexing
