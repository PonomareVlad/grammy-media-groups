# Copilot Instructions for grammy-media-groups

## Project Overview

This is a **Media Groups Storage Plugin for [grammY](https://grammy.dev/)** — a Telegram bot framework plugin that collects messages sharing the same `media_group_id` from both incoming updates and outgoing API responses, and stores them for retrieval. It supports both Deno and Node.js runtimes.

## Repository Structure

```
src/
├── mod.ts            # Main entry point: mediaGroups() middleware, mediaGroupTransformer(), types
├── storage.ts        # Storage logic: storeMessages(), MEDIA_GROUP_METHODS extractor map
├── deps.deno.ts      # Deno imports (from https://lib.deno.dev/x/grammy@v1/)
├── deps.node.ts      # Node.js imports (from npm grammy package)
├── mod.test.ts       # Integration tests for middleware and composer
└── storage.test.ts   # Unit tests for storage logic and extractors
```

- **`deps.deno.ts` / `deps.node.ts`**: Platform-specific dependency files. `deno2node` swaps `deps.deno.ts` for `deps.node.ts` during the Node.js build. Always import from `./deps.deno.ts` in source code.
- **`mod.ts`**: Exports `mediaGroups()` (default export), `mediaGroupTransformer()`, `MediaGroupsFlavor`, `MediaGroupsOptions`, and re-exports from `storage.ts`.
- **`storage.ts`**: Exports `storeMessages()` for batch storage and `MEDIA_GROUP_METHODS` (a `Record<string, (result) => Message[]>`) mapping Telegram API method names to result extractors.

## Runtime & Tooling

This is a **Deno-first** project. All development commands use Deno (v2.x):

| Task                  | Command                                                             |
| --------------------- | ------------------------------------------------------------------- |
| **Format check**      | `deno fmt --check`                                                  |
| **Lint**              | `deno lint`                                                         |
| **Run tests**         | `deno test --allow-import src/`                                     |
| **Build for Node.js** | `npm run build` (uses `deno2node tsconfig.json`, outputs to `out/`) |

### CI Pipeline

CI runs on pull requests via `.github/workflows/ci.yml` with two jobs:

1. **lint**: `deno fmt --check` then `deno lint`
2. **test**: `deno test --allow-import src/`

Both use `denoland/setup-deno@v2` with `deno-version: v2.x`.

### Important Notes

- The `--allow-import` flag is required for `deno test` because tests import from remote URLs (`https://lib.deno.dev/x/grammy@v1/`).
- `deno.jsonc` sets `"lock": false` — there is no lock file.
- The `out/` directory and `node_modules/` are git-ignored build artifacts.

## Code Style & Formatting

### Formatter

Deno's built-in formatter (`deno fmt`) is the primary formatter, configured in `deno.jsonc`:

- 4-space indentation
- `proseWrap: "preserve"`
- Excludes `node_modules/`, `out/`, `package-lock.json`

A `.prettierrc` is also present for editor compatibility:

- 80-character print width
- Double quotes
- Semicolons
- Trailing commas (`"all"`)
- Arrow function parentheses always required
- LF line endings

### Lint Rules

Deno's built-in linter (`deno lint`) is used. Key rules to be aware of:

- **`no-import-prefix`**: Use bare specifiers for jsr/npm dependencies (e.g., `@std/assert`), not inline prefixes like `jsr:@std/assert`. The import map in `deno.jsonc` maps `@std/assert` → `jsr:@std/assert@1`.
- Use `// deno-lint-ignore no-explicit-any` when `any` types are unavoidable (see existing examples in `mod.ts` and `storage.ts`).

### TypeScript

- Strict mode enabled (`tsconfig.json`)
- `noImplicitReturns` and `noUnusedParameters` are enforced
- Use `export type` for type-only exports
- Comprehensive JSDoc comments on all public exports

## Testing

Tests use `Deno.test()` with assertions from `@std/assert` (mapped via bare specifier in `deno.jsonc`).

### Test Conventions

- Test files are co-located with source files, named `*.test.ts`
- Use `MemorySessionStorage<Message[]>` from grammY as the test storage adapter
- Helper function `msg()` creates minimal `Message` objects for testing:
  ```typescript
  function msg(messageId, chatId, mediaGroupId?, extra?): Message;
  ```
- For middleware tests, use `createCtx()` to build a `Context` from a mock update object, casting through `any` to bypass strict Update types
- Tests verify both positive paths (data stored/retrieved) and negative paths (undefined for missing data)

## Dependencies

- **Runtime peer dependency**: `grammy` ^1.40.0
- **Dev dependency**: `deno2node` ^1.16.0 (TypeScript → CommonJS transpiler for Node.js build)
- **Test dependency**: `@std/assert` via Deno's import map

## Key Architecture Patterns

1. **Dual-platform support**: Source imports from `deps.deno.ts`; `deno2node` automatically substitutes `deps.node.ts` for the Node.js build. Never import directly from grammY URLs or npm — always go through the `deps.*.ts` files.

2. **Composer pattern**: `mediaGroups()` returns a grammY `Composer` extended with extra properties (`adapter`, `transformer`, `getMediaGroup`, `deleteMediaGroup`).

3. **Transformer pattern**: `mediaGroupTransformer()` creates an API transformer that intercepts outgoing API responses to extract and store messages. Install via `bot.api.config.use(mg.transformer)`.

4. **Batch storage**: `storeMessages()` groups messages by `media_group_id`, performs one read and one write per group (not per message), and replaces existing entries in-place by matching `(message_id, chat.id)`.

5. **Context flavor**: `MediaGroupsFlavor` adds a `ctx.mediaGroups` namespace with short method names: `getForMsg()`, `getForReply()`, `getForPinned()`, `store()`, `delete()`.

## Common Tasks

### Adding a new tracked API method

Add the method name and its result extractor function to `MEDIA_GROUP_METHODS` in `src/storage.ts`. Use `toArray` for methods returning a single `Message`, or `toArrayIfObject` for methods that may return `true` (inline edits) or a `Message`.

### Modifying context hydration

Edit the `composer.use()` middleware in `src/mod.ts`. The `ctx.mediaGroups` namespace is set up there, along with the `autoStore` logic.

### Adding new context methods

1. Add the method signature to the `MediaGroupsFlavor` type in `src/mod.ts`
2. Implement it in the middleware's `ctx.mediaGroups` assignment
3. Add corresponding tests in `src/mod.test.ts`
