# Feature Comparison: `moonlight-shine/grammy-media-group`

Analysis of [`moonlight-shine/grammy-media-group`](https://github.com/moonlight-shine/grammy-media-group)
(v1.0.4) and features that may be ported to this plugin
(`PonomareVlad/grammy-media-groups`).

## Architecture Comparison

| Aspect                    | `moonlight-shine/grammy-media-group`                                                                   | This plugin (`grammy-media-groups`)                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Collection strategy       | Timeout-based: buffers incoming messages in a `Map` and processes the group after a configurable delay | Storage-based: persists each message immediately via a `StorageAdapter` and retrieves on demand      |
| Persistence               | None — in-memory `Map`, lost on restart                                                                | Pluggable `StorageAdapter` (defaults to `MemorySessionStorage`); supports any grammY storage backend |
| Outgoing message tracking | Not supported                                                                                          | Transformer intercepts API responses (`sendMediaGroup`, `forwardMessage`, `editMessage*`)            |
| Runtime                   | Node.js only                                                                                           | Deno-first with Node.js build via `deno2node`                                                        |

## Features in `moonlight-shine/grammy-media-group`

### 1. `mediaGroup` filter predicate ✨ **Portable**

A type-narrowing predicate for `bot.filter()`:

```ts
bot.filter(mediaGroup, async (ctx) => {
    const media = ctx.media_group; // PhotoOrVideoMessage[]
});
```

**Status in this plugin:** Not present.

**Recommendation:** Port this idea as a `hasMediaGroup` predicate (or
similar) that narrows the context to guarantee `ctx.mediaGroups.getForMsg()`
will return a non-empty result. This is a clean ergonomic improvement that
fits grammY's `bot.filter()` pattern.

**Considerations:** This plugin stores messages incrementally, so the
predicate should check `ctx.msg?.media_group_id` (which is synchronous and
always available from the update). The actual media group content is
asynchronous, so the predicate would only guarantee the message _belongs_ to
a media group — not that the full group is available yet.

---

### 2. `copyMediaGroup()` utility function ✨ **Portable**

Converts a `PhotoOrVideoMessage[]` to `InputMedia[]` ready for
`sendMediaGroup`, with optional caption/parse_mode override:

```ts
const copied = copyMediaGroup(ctx.media_group, {
    caption: "<b>Here's the album!</b>",
    parse_mode: "HTML",
});
await ctx.api.sendMediaGroup(ctx.chat.id, copied);
```

**Status in this plugin:** Not present. The README shows a manual
`switch/case` mapping of stored `Message[]` to `InputMediaBuilder` calls.

**Recommendation:** Port this as a utility function that converts a
`Message[]` to `InputMedia[]`. Improvements over the original:

- Support all media group types (photo, video, **document**, **audio**,
  **animation**), not just photo/video.
- Accept a full options object (caption, parse_mode, caption_entities).
- Optionally expose it on `ctx.mediaGroups` as a convenience method.

This would greatly simplify the most common use case — resending a media
group.

---

### 3. `ctx.copyMediaGroup()` context method ✨ **Portable**

A convenience method on context that calls `copyMediaGroup` with the
current `ctx.media_group`:

```ts
const copied = ctx.copyMediaGroup({ caption: "New caption" });
await ctx.api.sendMediaGroup(ctx.chat.id, copied);
```

**Status in this plugin:** Not present.

**Recommendation:** If `copyMediaGroup()` is ported, adding a context
convenience method is trivial. It could be added to the `ctx.mediaGroups`
namespace:

```ts
const group = await ctx.mediaGroups.getForMsg();
if (group) {
    const media = ctx.mediaGroups.toInputMedia(group, opts);
    await ctx.replyWithMediaGroup(media);
}
```

---

### 4. Configurable timeout/delay ⚠️ **Not recommended**

The `MediaGroupHandler` accepts a `delay` parameter (default 4000ms) to
wait for all messages in a media group to arrive before processing.

**Status in this plugin:** Not applicable — this plugin uses a fundamentally
different strategy (immediate storage + on-demand retrieval) that does not
require timeouts.

**Recommendation:** **Do not port.** The timeout-based approach is
inherently unreliable (acknowledged in their own README: _"may be unreliable
or imprecise"_). This plugin's storage-based approach is superior: messages
are stored as they arrive and the full group can be retrieved at any time.

---

### 5. `ctx.media_group` property ⚠️ **Already covered differently**

Attaches the collected array of media group messages directly to context.

**Status in this plugin:** Already covered by
`ctx.mediaGroups.getForMsg()`, which is asynchronous (fetches from storage)
but provides the same data.

**Recommendation:** No action needed. The async approach is correct for a
storage-backed plugin.

---

## Summary: Features Worth Porting

| # | Feature                                              | Priority   | Effort             |
| - | ---------------------------------------------------- | ---------- | ------------------ |
| 1 | `copyMediaGroup()` / `toInputMedia()` utility        | **High**   | Low                |
| 2 | `hasMediaGroup` filter predicate for `bot.filter()`  | **Medium** | Low                |
| 3 | `ctx.mediaGroups.toInputMedia()` context convenience | **Low**    | Trivial (after #1) |

### Not recommended for porting

- **Timeout-based collection** — inferior to this plugin's storage strategy
- **`ctx.media_group` direct property** — already covered by
  `ctx.mediaGroups.getForMsg()`

## Detailed Porting Suggestions

### `toInputMedia()` utility

```ts
import type { InputMedia, Message } from "./deps.deno.ts";

interface ToInputMediaOptions {
    /** Override caption on the first item */
    caption?: string;
    /** Parse mode for the overridden caption */
    parse_mode?: ParseMode;
}

function toInputMedia(
    messages: Message[],
    opts?: ToInputMediaOptions,
): InputMedia[] {
    return messages.map((msg, i) => {
        const base = {
            caption: opts?.caption && i === 0 ? opts.caption : msg.caption,
            parse_mode: opts?.parse_mode,
            caption_entities: opts?.caption && i === 0
                ? undefined
                : msg.caption_entities,
        };
        if ("photo" in msg) {
            return {
                type: "photo" as const,
                media: msg.photo![msg.photo!.length - 1].file_id,
                ...base,
            };
        }
        if ("video" in msg) {
            return {
                type: "video" as const,
                media: msg.video!.file_id,
                ...base,
            };
        }
        if ("document" in msg) {
            return {
                type: "document" as const,
                media: msg.document!.file_id,
                ...base,
            };
        }
        if ("audio" in msg) {
            return {
                type: "audio" as const,
                media: msg.audio!.file_id,
                ...base,
            };
        }
        if ("animation" in msg) {
            return {
                type: "animation" as const,
                media: msg.animation!.file_id,
                ...base,
            };
        }
        // Fallback — should not happen in a valid media group
        return { type: "photo" as const, media: "", ...base };
    });
}
```

### `hasMediaGroup` filter predicate

```ts
function hasMediaGroup<C extends Context>(
    ctx: C,
): ctx is C & { msg: { media_group_id: string } } {
    return typeof ctx.msg?.media_group_id === "string";
}

// Usage:
bot.filter(hasMediaGroup, async (ctx) => {
    // ctx.msg.media_group_id is guaranteed to be a string here
    const group = await ctx.mediaGroups.getForMsg();
});
```
