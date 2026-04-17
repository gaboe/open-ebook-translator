# EPUB Translator

EPUB Translator is a tool for translating EPUB books with LLMs while preserving the original structure, markup, and reading flow as safely as possible.

It supports both interactive use in the browser and file-to-file translation from the command line, with multiple provider backends including OpenAI, OpenRouter, LM Studio, WebLLM, and OpenCode CLI.

## Ways to use it

### 1. Browser UI

Run the local app and translate EPUB files interactively.

### 2. CLI

Translate one EPUB into another directly from the terminal.

## Quick start

### Install

```bash
bun install
```

### Run the UI

```bash
bun run dev
```

### Build

```bash
bun run build
```

## CLI usage

The CLI translates one EPUB into another.

```bash
bun run translate --input <input.epub> --output <output.epub>
```

Example with OpenAI:

```bash
bun run translate \
  --input book.epub \
  --output book.sk.epub \
  --target Slovak \
  --provider openai \
  --model gpt-5.4
```

Example with OpenRouter:

```bash
bun run translate \
  --input book.epub \
  --output book.sk.epub \
  --target Slovak \
  --provider openrouter \
  --model google/gemma-3-27b-it:free
```

Example with LM Studio:

```bash
bun run translate \
  --input book.epub \
  --output book.sk.epub \
  --target Slovak \
  --provider lmstudio \
  --model meta-llama-3.1-8b-instruct
```

## CLI options

| Flag | Alias | Meaning | Default |
| --- | --- | --- | --- |
| `--input` | `-i` | Input EPUB file | required |
| `--output` | `-o` | Output EPUB file | `<input>.translated.epub` |
| `--target` | `-t` | Target language | `Slovak` |
| `--provider` | `-p` | `openai`, `openrouter`, `lmstudio`, `webllm`, `opencode` | `openai` |
| `--model` | `-m` | Model id | provider default |
| `--prompt` |  | Extra translation instructions | optional |
| `--api-key` | `-k` | API key for cloud providers | optional |

## Based on the original project

This project is based on the original EPUB Translator idea and codebase.

If you want the reference point, see the original project here:

- Original project: https://github.com/gaboe/open-ebook-translator

## What this version does better

- Safer translation pipeline for real EPUB/XHTML files, including minified chapter HTML
- Better handling of truncated model output
- Retry paths when a model returns invalid structured output
- Retry paths when a model effectively returns the source text unchanged
- Structural validation before writing translated chapters back into the EPUB
- Support for multiple providers:
  - OpenAI
  - OpenRouter
  - LM Studio
  - WebLLM
  - OpenCode CLI
- SolidJS browser UI for interactive use
- Bun/Effect CLI for batch and scripted usage
- Automated tests around the translation failure modes we hit in real books

## Recommended model choices

If you care most about translation quality and chapter completeness, use a stronger OpenAI model.

- **Best default for serious book translation:** `gpt-5.4`
- **Cheaper but weaker:** `gpt-5.4-mini`
- **Local/private option:** LM Studio
- **Browser-only option:** WebLLM

For long-form books with lots of XHTML, `gpt-5.4` is the safer choice.

## Provider notes

### OpenAI

Best option for reliable full-book translation.

Recommended models:

- `gpt-5.4`
- `gpt-5.4-mini`
- `gpt-4.1-mini`

### OpenRouter

Useful if you want cheaper hosted models or free experiments.

### LM Studio

Useful for local/private inference. Quality depends heavily on the model you load.

### WebLLM

Runs in the browser. Convenient, but not the best option for large book translation.

### OpenCode CLI

Supported as an extra provider path.

## Reliability work added in this version

The biggest change versus the original repo is reliability.

This version adds:

- XHTML-aware chunk splitting instead of relying only on blank lines
- detection of truncated model responses via `finish_reason`
- retries when the model returns bad structured output
- retries when the model returns content that is effectively unchanged
- validation of translated chapter structure before saving
- preservation of original markup by translating text segments and reconstructing the original XHTML

These changes were added because real books exposed failure modes that the earlier version did not catch well enough.

## Development checks

Run the full test suite:

```bash
bun run test
```

Typecheck:

```bash
bun run typecheck
```

All checks:

```bash
bun run check all
```

## Stack

- **Bun**
- **TypeScript**
- **Effect**
- **SolidJS**
- **JSZip**
- **OpenAI-compatible provider adapters**

## Status

Compared with the original repo, this codebase has made strong practical progress:

- it handles real-world EPUB failure cases much better
- it supports more provider setups
- it has a cleaner CLI + UI workflow
- it has test coverage for the hard bugs we actually hit

If you want the shortest summary: the original repo had the right idea, and this version makes it much more usable for serious book translation.
