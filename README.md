# EPUB Translator

This project is a substantially improved continuation of the original EPUB Translator codebase.

The original repo proved the core idea: translate EPUB books with LLMs. This version pushes the project much further in the places that matter in real use: better provider support, a usable UI, a CLI workflow, safer XHTML handling, and much stronger protection against silently truncated or unchanged chapter output.

## What is better than the original version

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

## What this project does

EPUB Translator translates EPUB books while trying to preserve the original structure, markup, and reading flow.

It can be used in two ways:

1. **Browser UI** for interactive translation
2. **CLI** for direct file-to-file translation

## Recommended model choices

If you care most about translation quality and chapter completeness, use a stronger OpenAI model.

- **Best default for serious book translation:** `gpt-5.4`
- **Cheaper but weaker:** `gpt-5.4-mini`
- **Local/private option:** LM Studio
- **Browser-only option:** WebLLM

For long-form books with lots of XHTML, `gpt-5.4` is the safer choice.

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
