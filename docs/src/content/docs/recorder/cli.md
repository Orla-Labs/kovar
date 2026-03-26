---
title: CLI Reference
description: Command-line options for kovar record
---

## Command

```bash
kovar record <url> [options]
```

## Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--output <dir>` | `-o` | Output directory for generated files | `./tests` |
| `--name <name>` | `-n` | Test file name (without extension) | Auto-generated from URL path |
| `--source <dir>` | `-s` | Source directory for codebase-aware locators | Off |
| `--provider <name>` | | LLM provider: `anthropic` or `openai` | Auto-detect from env |
| `--model <name>` | | LLM model override | `claude-sonnet-4-20250514` or `gpt-4o` |
| `--heal` | | After generating tests, run them and use AI to fix failures | Off |
| `--heal-attempts <n>` | | Maximum number of self-healing attempts | `3` |
| `--help` | `-h` | Show help | |

## Examples

Basic recording:

```bash
kovar record https://your-app.com
```

Custom output directory and test name:

```bash
kovar record https://your-app.com -o ./e2e -n checkout-flow
```

With codebase awareness for better locators:

```bash
kovar record https://your-app.com --source ./src
```

Use a specific provider and model:

```bash
kovar record https://your-app.com --provider openai --model gpt-4o
```

Record, then auto-fix any test failures:

```bash
kovar record https://your-app.com --heal
```

Allow up to 5 healing attempts:

```bash
kovar record https://your-app.com --heal --heal-attempts 5
```

## Environment Variables

The recorder reads API keys from environment variables or a `.env` file:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude models) |
| `OPENAI_API_KEY` | OpenAI API key (for GPT models) |

The provider is auto-detected from whichever key is available. Use `--provider` to override.

## Session Limits

| Limit | Value |
|-------|-------|
| Max actions | 200 (configurable) |
| Max duration | 30 minutes |
| Inactivity timeout | 5 minutes |

## Related

- [Recorder Getting Started](/recorder/getting-started) -- step-by-step walkthrough.
- [What Gets Generated](/recorder/output) -- output file examples.
- [Self-Healing](/recorder/self-healing) -- auto-fix test failures after recording.
- [Codebase Awareness](/recorder/codebase-awareness) -- improve locators with source mapping.
