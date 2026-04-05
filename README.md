<p align="center">
  <h1 align="center">Normie 🤙</h1>
</p>

<p align="center">
  <a href="https://docs.composio.dev/tool-router/overview">
    <img src="https://img.shields.io/badge/Composio-Tool%20Router-orange" alt="Composio">
  </a>
  <a href="https://platform.claude.com/docs/en/agent-sdk/overview">
    <img src="https://img.shields.io/badge/Claude-Agent%20SDK-blue" alt="Claude Agent SDK">
  </a>
  <a href="https://github.com/anthropics/claude-code">
    <img src="https://img.shields.io/badge/Powered%20by-Claude%20Code-purple" alt="Claude Code">
  </a>
  <a href="https://twitter.com/composio">
    <img src="https://img.shields.io/twitter/follow/composio?style=social" alt="Twitter">
  </a>
</p>

<p align="center">
  An open-source desktop chat application powered by Claude Agent SDK and Composio Tool Router. Automate your work end-to-end across desktop and all your work apps in one place.
  <br><br>
  <a href="https://platform.composio.dev">
    <b>Get your free API key to get started →</b>
  </a>
</p>

---

## Quick Start

```bash
git clone <your-repo-url>
cd normie
pnpm install
```

Then run:
```bash
pnpm dev
```

For Electron mode:
```bash
pnpm dev:electron
```

---

## Features

- **Multi-Provider Support** - Claude Agent SDK, Opencode, Kimi, AWS Bedrock
- **Persistent Sessions** - Context maintained across messages
- **Real-time Streaming** - Token-by-token response display
- **Tool Visualization** - See tool inputs/outputs in the sidebar
- **Skills Support** - Extend Claude with custom capabilities
- **Modern UI** - Clean, dark-themed interface with Tailwind CSS
- **500+ Integrations** - Gmail, Slack, GitHub, Calendar and more via Composio

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Desktop | Electron.js |
| Backend | Node.js + Express |
| AI | Claude Agent SDK + Opencode SDK |
| Tools | Composio Tool Router + MCP |
| Streaming | Server-Sent Events (SSE) |

---

## Configuration

### API Keys (BYOK - Bring Your Own Key)

Normie uses a **BYOK model** - all AI providers are enabled by default. 
Simply add API keys for the providers you want to use.

**Minimum required:**
- **Anthropic API key** from [console.anthropic.com](https://console.anthropic.com) (for Claude models)
- **Composio API key** from [app.composio.dev](https://app.composio.dev) (for tool integrations)

**Optional providers** (add keys for any you want to use):
- **OpenAI** - [platform.openai.com](https://platform.openai.com)
- **Google/Gemini** - [aistudio.google.com](https://aistudio.google.com)
- **Groq** - [console.groq.com](https://console.groq.com)
- **X.AI (Grok)** - [x.ai](https://x.ai)
- **Mistral** - [console.mistral.ai](https://console.mistral.ai)
- **OpenRouter** - [openrouter.ai](https://openrouter.ai) (aggregates multiple providers)
- **AWS Bedrock** - Uses AWS credentials
- **Azure OpenAI** - Uses Azure credentials
- **Ollama** - Runs locally, no API key needed

And many more! Check `.env.example` for the full list.

```bash
cp .env.example .env
# Edit .env with your keys
```

**Note:** You can limit enabled providers by setting `ENABLED_PROVIDERS` in your `.env` file.

### Skills

Extend Claude with custom skills by adding `SKILL.md` files to `.claude/skills/`:

```markdown
---
description: Use this skill when the user asks about [topic]
---

# My Skill

Instructions for Claude...
```

See [Agent Skills documentation](https://platform.claude.com/docs/en/agent-sdk/skills) for details.

---

## Project Structure

```
normie/
├── electron/           # Electron main process
├── packages/           # Shared packages (types, utils)
├── apps/
│   ├── web/           # Frontend (React + Vite + Tailwind)
│   └── server/        # Backend (Express + TypeScript)
└── .claude/skills/    # Custom agent skills
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't connect to backend | Ensure server is running on port 3001 |
| API key error | Check `.env` - Anthropic keys start with `sk-ant-` |
| Session not persisting | Check server logs for session ID |
| Streaming slow | Check firewall/network for SSE connections |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Resources

- [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-agent-sdk)
- [Composio Tool Router](https://docs.composio.dev/tool-router)
- [Composio Dashboard](https://app.composio.dev)
- [Electron Docs](https://www.electronjs.org/docs)

---

## Community

- [Discord](https://discord.com/invite/composio) - Chat with developers
- [Twitter/X](https://x.com/composio) - Updates and features
- [support@composio.dev](mailto:support@composio.dev) - Questions

---

<p align="center">
  <b>Join 200,000+ developers building agents in production</b>
</p>

<p align="center">
  <a href="https://platform.composio.dev">
    <img src="https://img.shields.io/badge/Get_Started_For_Free-4F46E5?style=for-the-badge" alt="Get Started For Free"/>
  </a>
</p>

<p align="center">
  Built with Claude Code and Composio
</p>
