# Token Management System

## Overview

AutoForge includes a smart token management system to prevent context overflow when sending large amounts of codebase information to LLMs. This is critical for large projects where full context could exceed model limits (GPT-4: 128K tokens, Claude Sonnet: 200K tokens).

## Features

### 1. **Token Estimation**
- Accurate character-to-token conversion (~3.5 chars/token for code)
- Real-time token counting before sending context
- Budget tracking with reserved tokens for responses

### 2. **Smart Prioritization**
- Context items ranked by relevance (1-10 priority scale)
- Query-matching features get higher priority
- Greedy selection algorithm includes most important items first

### 3. **Intelligent Truncation**
- Type-specific truncation strategies:
  - **Features**: Keep structure, summarize components
  - **Files**: Keep beginning and end, truncate middle
  - **Selections**: Keep most relevant portion
- Preserves context usefulness while reducing size

### 4. **User Notifications**
- Clear warnings when context is optimized
- Shows items included vs excluded
- Provides actionable tips to refine queries

## Architecture

### Core Components

```typescript
// Token limits for different models
TOKEN_LIMITS = {
    GPT4: 128000,
    GPT4O: 128000,
    CLAUDE_SONNET: 200000,
    DEFAULT: 100000
}

// Context item with priority
interface ContextItem {
    content: string;
    type: 'feature' | 'file' | 'selection' | 'pattern';
    name: string;
    priority: number;        // 1-10, higher = more important
    estimatedTokens: number;
    metadata?: any;
}
```

### TokenManager Class

**Main Methods:**

1. **`optimizeContext()`** - Smart context optimization
   - Input: Array of context items, user prompt, max tokens
   - Output: Optimized context with warnings
   - Algorithm: Priority-based greedy selection + truncation

2. **`createFeatureItems()`** - Convert KB features to context items
   - Automatically assigns priorities based on query match
   - Calculates token estimates
   - Lightweight - can be enriched later

3. **`enrichFeatureItems()`** - Add component details to features
   - Async enrichment with full component info
   - Graceful degradation if enrichment fails
   - Prevents circular dependencies

4. **`renderTokenWarning()`** - User notification
   - Shows optimization statistics
   - Provides actionable tips
   - Only shown when truncation occurs

## Usage Examples

### Basic Usage in Handlers

```typescript
import { TokenManager, ContextItem, estimateTokenCount } from '../utilities/tokenManager';

// Initialize with model limits
const tokenManager = new TokenManager(128000, 4000); // 128K total, 4K reserved

// Create context items from KB features
const features = await kbManager.searchFeatures(userQuery, 5);
let items = TokenManager.createFeatureItems(features, userQuery);

// Enrich with component details
items = await TokenManager.enrichFeatureItems(
    items,
    (featureId) => kbManager.getComponentsForFeature(featureId)
);

// Add session context as lower priority
items.push({
    content: sessionContext,
    type: 'pattern',
    name: 'Session Context',
    priority: 5,
    estimatedTokens: estimateTokenCount(sessionContext)
});

// Optimize for token limits
const optimized = tokenManager.optimizeContext(items, userQuery, 100000);

// Show warnings if truncated
TokenManager.renderTokenWarning(stream, optimized);

// Use optimized context
const finalPrompt = `${userQuery}\n\n${optimized.content}`;
```

### Priority Guidelines

**Priority Scale (1-10):**

- **10**: Exact query matches, user selections
- **8-9**: First few KB features matching query
- **6-7**: Related features, recent session context
- **4-5**: General session context, patterns
- **1-3**: Low-relevance features, supplementary info

### Token Budgets

**Recommended Allocations:**

- User prompt: ~500-2000 tokens
- Response generation: 4000-8000 tokens (reserved)
- Context: Remaining capacity (~100K-120K for GPT-4o)

**Example Budget:**

```
Total:    128,000 tokens (GPT-4o)
Reserved:   4,000 tokens (response)
Prompt:     2,000 tokens (user query)
Available: 122,000 tokens (for context)
```

## Truncation Strategies

### Feature Truncation
```
Original (5000 chars):
  Feature: User Management
  - Description...
  - 50 components listed
  
Truncated (1500 chars):
  Feature: User Management
  - Description...
  - Top 5 components listed
  ... [Component details truncated for token limit]
```

### File Truncation
```
Original (20,000 chars):
  [Full file content]
  
Truncated (5000 chars):
  [First 2500 chars]
  ... [middle section truncated] ...
  [Last 2500 chars]
```

### Selection Truncation
```
Original (3000 chars):
  [Full code selection]
  
Truncated (1500 chars):
  [First 1500 chars]
  ... [selection truncated]
```

## Integration Points

### Current Integrations

1. **`generateHandler.ts`** - Code generation with KB context
   - Uses full token management pipeline
   - Optimizes features + session context
   - Shows warnings when truncated

2. **`askHandler.ts`** - Natural language actions
   - Token-aware context building
   - Imports ready for optimization

3. **Future**: `questionHandler.ts`, `explainHandler.ts`, `analyzeHandler.ts`

### Adding Token Management to a Handler

```typescript
// 1. Import token manager
import { TokenManager, ContextItem, estimateTokenCount } from '../utilities/tokenManager';

// 2. Create items from your context sources
const items: ContextItem[] = [];

// Features
const features = await kbManager.searchFeatures(query, 5);
let featureItems = TokenManager.createFeatureItems(features, query);
featureItems = await TokenManager.enrichFeatureItems(
    featureItems,
    (id) => kbManager.getComponentsForFeature(id)
);
items.push(...featureItems);

// Files
items.push({
    content: fileContent,
    type: 'file',
    name: fileName,
    priority: 8,
    estimatedTokens: estimateTokenCount(fileContent)
});

// 3. Optimize
const tokenManager = new TokenManager();
const optimized = tokenManager.optimizeContext(items, userPrompt);

// 4. Show warnings
TokenManager.renderTokenWarning(stream, optimized);

// 5. Use optimized content
const finalPrompt = `${userPrompt}\n\n${optimized.content}`;
```

## Performance Considerations

### Token Estimation
- **Speed**: ~10μs per estimation (very fast)
- **Accuracy**: ±10% of actual token count
- **Trade-off**: Speed over precision (acceptable for context budgeting)

### Optimization Algorithm
- **Complexity**: O(n log n) for sorting + O(n) for selection = O(n log n)
- **Typical**: 10-50 items = <1ms
- **Large**: 100+ items = ~5ms
- **Acceptable**: <10ms for user-facing operations

### Memory Usage
- **Context Items**: ~1KB each
- **50 items**: ~50KB memory
- **Impact**: Negligible compared to full context strings

## Best Practices

### DO ✅

- Always reserve 4K-8K tokens for responses
- Use priority scoring consistently across handlers
- Show warnings when context is truncated
- Test with large codebases (1000+ files)
- Profile token usage in development

### DON'T ❌

- Don't include all features without prioritization
- Don't ignore truncation warnings
- Don't use same priority for all items
- Don't forget to enrich feature items with components
- Don't exceed 80% of token budget for context

## Troubleshooting

### Problem: "Excluded N items due to token limits"

**Causes:**
- Too many low-priority items
- Query too broad, matching many features
- Large component lists in features

**Solutions:**
- Refine query to be more specific
- Increase priority of most relevant items
- Limit feature search results (e.g., top 3 instead of 5)
- Use feature summaries instead of full details

### Problem: Context still too large after optimization

**Solutions:**
1. Reduce reserved tokens (min 2K)
2. Decrease max features returned (3 instead of 5)
3. Skip enrichment (basic feature info only)
4. Implement progressive loading (start small, add on request)

### Problem: Important context being excluded

**Solutions:**
1. Increase priority of critical items (8-10 range)
2. Reduce priority of supplementary items (1-3 range)
3. Add query-matching boost in priority calculation
4. Review prioritization logic for your use case

## Future Enhancements

### Planned Features

1. **Dynamic Token Limits** - Detect model from VS Code settings
2. **Context Caching** - Reuse previous context for follow-ups
3. **Streaming Context** - Progressive context loading
4. **User Preferences** - Configurable token budgets
5. **Analytics** - Track token usage patterns

### Potential Optimizations

- Semantic compression (summarize redundant info)
- Context deduplication (remove repeated components)
- Lazy loading (fetch components only when needed)
- LLM-based summarization (for very large contexts)

## References

- [OpenAI Token Limits](https://platform.openai.com/docs/models)
- [Claude Context Windows](https://www.anthropic.com/claude)
- [Token Counting Best Practices](https://cookbook.openai.com/examples/how_to_count_tokens_with_tiktoken)

---

**Last Updated**: February 1, 2026  
**Version**: 1.0.0  
**Status**: Production Ready ✅
