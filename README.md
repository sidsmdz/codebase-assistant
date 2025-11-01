# Codebase Assistant

AI-powered code generation assistant for VS Code that helps developers generate code following company-specific patterns.

## Features

- 🤖 **@codebase Chat Participant** - Interact with your codebase through natural language
- 📚 **Local Knowledge Base** - Store and search code patterns locally
- 🎯 **Context-Aware Generation** - Copilot generates code following your company's standards
- 🔒 **Fully Local** - No external API calls, air-gapped deployment ready
- 📈 **Learning Loop** - System improves over time from successful generations

## Usage

### Basic Chat

Open Copilot Chat and type:
```
@codebase add a datatable with real-time updates
```

The assistant will:
1. Search for relevant patterns in your knowledge base
2. Ask clarifying questions (columns, message types, etc.)
3. Guide Copilot to generate code following your patterns

### Commands

- **Codebase Assistant: Hello World** - Test the extension

## Requirements

- VS Code 1.85.0 or higher
- GitHub Copilot extension

## Installation

1. Download `codebase-assistant-0.1.0.vsix`
2. In VS Code: Extensions → `...` → Install from VSIX
3. Reload VS Code
4. Test with `@codebase hello`

## Development Status

🚧 **MVP in Development**

### Current Sprint (Sprint 1)
- ✅ Story 1.1: Extension Scaffolding
- ⏳ Story 1.2: Register Chat Participant
- ⏳ Story 1.3: Call Copilot Programmatically
- ⏳ Story 1.4: Air-Gapped Packaging

## Configuration

No configuration required. Extension activates automatically on VS Code startup.

## Known Issues

- Packaging requires Node.js 20+
- See [GitHub Issues](https://github.com/sidsmdz/codebase-assistant/issues)

## Contributing

This is an internal tool. For questions, see the [GitHub Issues](https://github.com/sidsmdz/codebase-assistant/issues).

## Release Notes

### 0.1.0 (Initial Release)

- Basic extension scaffolding
- @codebase chat participant with echo handler
- Foundation for knowledge base and pattern learning

## License

Proprietary - Internal Use Only

---

**For more information:**
- [Architecture Documentation](docs/architecture.md)
- [GitHub Repository](https://github.com/sidsmdz/codebase-assistant)