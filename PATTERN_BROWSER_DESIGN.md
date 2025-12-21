# Pattern Browser Enhancement - Design Document

## Current State

The chat panel currently has:
- ✅ Welcome screen with example prompts
- ✅ Chat interface for asking questions
- ✅ Save Pattern form
- ✅ Action buttons (Show Context, Save Pattern, Clear Chat, Stats)
- ✅ Live KB statistics in header

## Requested Enhancement

Add a **professional, searchable pattern browser** to view all saved patterns in the knowledge base.

## Design Proposal

### 1. Add "Browse Patterns" Button

Add to action buttons area:
```html
<button class="action-btn" id="browse-patterns-btn">📚 Browse Patterns</button>
```

### 2. Pattern Browser Modal/Panel

```html
<div id="pattern-browser-modal" class="modal">
    <div class="modal-content pattern-browser">
        <!-- Header -->
        <div class="browser-header">
            <h2>📚 Knowledge Base Patterns</h2>
            <button class="close-btn">×</button>
        </div>

        <!-- Search Bar -->
        <div class="browser-search">
            <input
                type="text"
                id="pattern-search-input"
                placeholder="🔍 Search patterns by name, tag, language..."
                class="search-input"
            />
            <div class="search-filters">
                <select id="language-filter">
                    <option value="all">All Languages</option>
                    <option value="java">Java</option>
                    <option value="typescript">TypeScript</option>
                    <option value="javascript">JavaScript</option>
                </select>
                <select id="sort-by">
                    <option value="recent">Most Recent</option>
                    <option value="name">Name (A-Z)</option>
                    <option value="language">Language</option>
                </select>
            </div>
        </div>

        <!-- Pattern Count -->
        <div class="browser-stats">
            <span id="pattern-count">Loading patterns...</span>
        </div>

        <!-- Pattern List -->
        <div class="pattern-list" id="pattern-list">
            <!-- Patterns will be dynamically inserted here -->
        </div>
    </div>
</div>
```

### 3. Pattern Card Design

Each pattern displayed as a card:

```html
<div class="pattern-card" data-pattern-id="{{id}}">
    <div class="pattern-card-header">
        <div class="pattern-title">
            <span class="pattern-icon">{{icon}}</span>
            <span class="pattern-name">{{name}}</span>
        </div>
        <div class="pattern-language-badge">{{language}}</div>
    </div>

    <div class="pattern-card-body">
        <p class="pattern-description">{{description}}</p>

        <div class="pattern-tags">
            {{#each tags}}
            <span class="tag">{{this}}</span>
            {{/each}}
        </div>

        <div class="pattern-metadata">
            <span class="metadata-item">📅 {{savedAt}}</span>
            {{#if metadata.framework}}
            <span class="metadata-item">🔧 {{metadata.framework}}</span>
            {{/if}}
        </div>
    </div>

    <div class="pattern-card-actions">
        <button class="card-action-btn view-btn" data-action="view">
            👁️ View Code
        </button>
        <button class="card-action-btn use-btn" data-action="use">
            💬 Use in Chat
        </button>
        <button class="card-action-btn delete-btn" data-action="delete">
            🗑️ Delete
        </button>
    </div>
</div>
```

### 4. Pattern Detail View

When clicking "View Code":

```html
<div class="pattern-detail-modal">
    <div class="detail-header">
        <h3>{{name}}</h3>
        <span class="language-badge">{{language}}</span>
    </div>

    <div class="detail-description">
        {{description}}
    </div>

    <div class="detail-code">
        <pre><code class="language-{{language}}">{{code}}</code></pre>
    </div>

    <div class="detail-metadata">
        <div class="metadata-row">
            <strong>Tags:</strong>
            <div class="tags-list">
                {{#each tags}}
                <span class="tag">{{this}}</span>
                {{/each}}
            </div>
        </div>

        {{#if metadata.filePath}}
        <div class="metadata-row">
            <strong>File:</strong>
            <span class="file-path">{{metadata.filePath}}</span>
        </div>
        {{/if}}

        <div class="metadata-row">
            <strong>Saved:</strong>
            <span>{{savedAt}}</span>
        </div>
    </div>

    <div class="detail-actions">
        <button class="btn-primary">💬 Use in Chat</button>
        <button class="btn-secondary">📋 Copy Code</button>
        <button class="btn-danger">🗑️ Delete</button>
    </div>
</div>
```

### 5. CSS Styling

```css
/* Pattern Browser Modal */
.modal {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    animation: fadeIn 0.2s;
}

.modal.active {
    display: flex;
    align-items: center;
    justify-content: center;
}

.pattern-browser {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    width: 90%;
    max-width: 1200px;
    height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

/* Browser Header */
.browser-header {
    padding: 20px;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.browser-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
}

.close-btn {
    background: none;
    border: none;
    font-size: 28px;
    cursor: pointer;
    color: var(--vscode-foreground);
    opacity: 0.7;
    transition: opacity 0.2s;
}

.close-btn:hover {
    opacity: 1;
}

/* Search Bar */
.browser-search {
    padding: 16px 20px;
    border-bottom: 1px solid var(--vscode-panel-border);
}

.search-input {
    width: 100%;
    padding: 10px 16px;
    border: 1px solid var(--vscode-input-border);
    border-radius: 6px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-size: 14px;
    margin-bottom: 12px;
}

.search-filters {
    display: flex;
    gap: 12px;
}

.search-filters select {
    padding: 6px 12px;
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-size: 13px;
}

/* Browser Stats */
.browser-stats {
    padding: 12px 20px;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
}

/* Pattern List */
.pattern-list {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 16px;
    align-content: start;
}

/* Pattern Card */
.pattern-card {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 16px;
    transition: all 0.2s;
    cursor: pointer;
}

.pattern-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-color: var(--vscode-focusBorder);
}

.pattern-card-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    margin-bottom: 12px;
}

.pattern-title {
    display: flex;
    align-items: center;
    gap: 8px;
}

.pattern-icon {
    font-size: 20px;
}

.pattern-name {
    font-weight: 600;
    font-size: 15px;
}

.pattern-language-badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
}

.pattern-card-body {
    margin-bottom: 12px;
}

.pattern-description {
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
    margin: 0 0 12px 0;
    line-height: 1.5;
}

.pattern-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
}

.tag {
    padding: 3px 8px;
    border-radius: 10px;
    font-size: 11px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
}

.pattern-metadata {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
}

.pattern-card-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--vscode-panel-border);
}

.card-action-btn {
    flex: 1;
    padding: 6px 12px;
    border: 1px solid var(--vscode-button-border);
    border-radius: 4px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
}

.card-action-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
}

.use-btn {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
}

.use-btn:hover {
    background: var(--vscode-button-hoverBackground);
}

.delete-btn {
    background: var(--vscode-inputValidation-errorBackground);
}

/* Empty State */
.empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--vscode-descriptionForeground);
}

.empty-state-icon {
    font-size: 48px;
    margin-bottom: 16px;
}

.empty-state-title {
    font-size: 18px;
    margin-bottom: 8px;
}

.empty-state-message {
    font-size: 14px;
    opacity: 0.8;
}
```

### 6. JavaScript Implementation

```javascript
// Pattern Browser State
let allPatterns = [];
let filteredPatterns = [];

// Browse Patterns Button Click
document.getElementById('browse-patterns-btn').addEventListener('click', async () => {
    // Request patterns from backend
    vscode.postMessage({ type: 'getAllPatterns' });

    // Show modal
    document.getElementById('pattern-browser-modal').classList.add('active');
});

// Handle patterns response from backend
window.addEventListener('message', event => {
    const message = event.data;

    if (message.type === 'allPatterns') {
        allPatterns = message.patterns;
        filteredPatterns = allPatterns;
        renderPatterns(filteredPatterns);
        updatePatternCount();
    }
});

// Render patterns in the list
function renderPatterns(patterns) {
    const listDiv = document.getElementById('pattern-list');

    if (patterns.length === 0) {
        listDiv.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📚</div>
                <div class="empty-state-title">No Patterns Found</div>
                <div class="empty-state-message">
                    Save some patterns from chat or index your workspace
                </div>
            </div>
        `;
        return;
    }

    listDiv.innerHTML = patterns.map(pattern => createPatternCard(pattern)).join('');

    // Add event listeners to cards
    attachCardListeners();
}

// Create pattern card HTML
function createPatternCard(pattern) {
    const icon = getLanguageIcon(pattern.language);
    const tagsHtml = pattern.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
    const date = new Date(pattern.savedAt).toLocaleDateString();

    return `
        <div class="pattern-card" data-pattern-id="${pattern.id}">
            <div class="pattern-card-header">
                <div class="pattern-title">
                    <span class="pattern-icon">${icon}</span>
                    <span class="pattern-name">${escapeHtml(pattern.name)}</span>
                </div>
                <div class="pattern-language-badge">${pattern.language}</div>
            </div>

            <div class="pattern-card-body">
                <p class="pattern-description">${escapeHtml(pattern.description)}</p>

                <div class="pattern-tags">${tagsHtml}</div>

                <div class="pattern-metadata">
                    <span class="metadata-item">📅 ${date}</span>
                    ${pattern.metadata?.framework ? `<span class="metadata-item">🔧 ${pattern.metadata.framework}</span>` : ''}
                </div>
            </div>

            <div class="pattern-card-actions">
                <button class="card-action-btn view-btn" data-action="view" data-id="${pattern.id}">
                    👁️ View
                </button>
                <button class="card-action-btn use-btn" data-action="use" data-id="${pattern.id}">
                    💬 Use
                </button>
                <button class="card-action-btn delete-btn" data-action="delete" data-id="${pattern.id}">
                    🗑️
                </button>
            </div>
        </div>
    `;
}

// Search functionality
document.getElementById('pattern-search-input').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    filterPatterns(searchTerm);
});

function filterPatterns(searchTerm) {
    const languageFilter = document.getElementById('language-filter').value;

    filteredPatterns = allPatterns.filter(pattern => {
        const matchesSearch =
            pattern.name.toLowerCase().includes(searchTerm) ||
            pattern.description.toLowerCase().includes(searchTerm) ||
            pattern.tags.some(tag => tag.toLowerCase().includes(searchTerm));

        const matchesLanguage =
            languageFilter === 'all' || pattern.language === languageFilter;

        return matchesSearch && matchesLanguage;
    });

    renderPatterns(filteredPatterns);
    updatePatternCount();
}

// Helper functions
function getLanguageIcon(language) {
    const icons = {
        'java': '☕',
        'typescript': '📘',
        'javascript': '📜',
        'python': '🐍',
        'go': '🐹',
        'rust': '🦀'
    };
    return icons[language] || '📄';
}

function updatePatternCount() {
    const countSpan = document.getElementById('pattern-count');
    countSpan.textContent = `Showing ${filteredPatterns.length} of ${allPatterns.length} patterns`;
}
```

## Backend Implementation

Add to `chatViewProvider.ts`:

```typescript
// In handleMessage method
case 'getAllPatterns': {
    const patterns = await this.kbManager.getAllPatterns();
    this.panel?.webview.postMessage({
        type: 'allPatterns',
        patterns: patterns
    });
    break;
}

case 'viewPattern': {
    const pattern = await this.kbManager.getPatternById(message.patternId);
    this.panel?.webview.postMessage({
        type: 'patternDetails',
        pattern: pattern
    });
    break;
}

case 'usePattern': {
    // Insert pattern into chat as a message
    const pattern = await this.kbManager.getPatternById(message.patternId);
    this.panel?.webview.postMessage({
        type: 'insertPattern',
        pattern: pattern
    });
    break;
}
```

## User Experience Flow

1. User clicks "📚 Browse Patterns" button
2. Modal opens with searchable pattern library
3. User can:
   - Search by name, tags, description
   - Filter by language
   - Sort by date/name/language
4. Click on pattern card to:
   - **View Code**: See full code in detail modal
   - **Use in Chat**: Insert as example in chat
   - **Delete**: Remove from KB
5. Professional, clean, VSCode-themed interface

## Benefits

- ✅ **Discoverable**: See all saved patterns at a glance
- ✅ **Searchable**: Find patterns quickly
- ✅ **Professional**: Clean, modern UI matching VSCode
- ✅ **Self-explanatory**: Clear labels and icons
- ✅ **Actionable**: View, use, or delete from one place
- ✅ **Fast**: Grid layout shows many patterns at once

This design provides a professional knowledge base browser that enhances the user experience significantly!
