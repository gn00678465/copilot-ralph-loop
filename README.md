# Copilot SDK Starter Template 🚀

A minimal starter template for building GitHub Copilot extensions using the [@github/copilot-sdk](https://github.com/copilot-extensions/copilot-sdk.js).

## ✨ Features

- 🔧 Pre-configured with Copilot SDK
- ⚡ Bun / pnpm runtime support
- 📦 TypeScript ready
- 🤖 Multi-agent skill support (GitHub Copilot, Gemini CLI, Claude Code)
- 🎯 Minimal setup - get started in minutes

## 🚀 Quick Start

**1. Use this template**

Click "Use this template" button or:
```bash
gh repo create my-copilot-extension --template yourusername/copilot-sdk-starter
```

**2. Install Copilot Skills**

```bash
# Set up skills for all agents (default)
pnpm setup
# or
bun run setup

# Set up skills for specific agents only
pnpm setup -a github-copilot
pnpm setup -a claude-code -a gemini-cli
```

Available agents: `claude-code`, `github-copilot`, `gemini-cli`

**3. Install project dependencies**

```bash
pnpm install
# or
bun install
```

**4. Start building**

Edit `index.js` to build your Copilot extension, then run:
```bash
bun run index.js
```

## 📁 Project Structure

```
copilot-sdk-starter/
├── script/
│   └── setup.ts      # Skill installation & setup script
├── index.js          # Your extension entry point (create this)
├── package.json      # Dependencies and scripts
├── README.md         # This file
└── .gitignore        # Git ignore rules
```

## 🛠️ Development

Refer to the [Copilot SDK documentation](https://github.com/copilot-extensions/copilot-sdk.js) for available APIs.

## 📦 Built With

- [@github/copilot-sdk](https://github.com/copilot-extensions/copilot-sdk.js) - GitHub Copilot SDK
- [Bun](https://bun.com) - Fast JavaScript runtime
- [pnpm](https://pnpm.io) - Fast, disk space efficient package manager
- [TypeScript](https://www.typescriptlang.org/) - Type safety

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

---

**Created from template:** [copilot-sdk-starter](https://github.com/yourusername/copilot-sdk-starter)
