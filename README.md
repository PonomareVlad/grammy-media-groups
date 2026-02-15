# Media Groups Storage Plugin for grammY

A [grammY](https://grammy.dev/) plugin that stores media group messages using
the [storages](https://github.com/grammyjs/storages) protocol. It collects all
messages that share the same `media_group_id` from both incoming updates and
outgoing API responses, and lets you retrieve the full group at any time.

## Features

- **Middleware** — automatically stores every incoming message that has a
  `media_group_id`.
- **Transformer** — intercepts Telegram API responses (`sendMediaGroup`,
  `forwardMessage`, `editMessageMedia`, `editMessageCaption`,
  `editMessageReplyMarkup`) and stores returned messages.
- **Context hydration** — adds `ctx.mediaGroups.getForMsg()` to fetch the
  current message's media group.
- **Reply/pinned helpers** — `ctx.mediaGroups.getForReply()` and
  `ctx.mediaGroups.getForPinned()` for sub-messages.
- **Programmatic access** — the returned composer exposes
  `getMediaGroup(mediaGroupId)` for use outside of middleware.
- **Manual mode** — pass `{ autoStore: false }` to disable automatic storing
  and use `ctx.mediaGroups.store(message)` for full control.
- **Delete** — `ctx.mediaGroups.delete(mediaGroupId)` or
  `mg.deleteMediaGroup(mediaGroupId)` removes a media group from storage.
- **Copy** — `copyMediaGroup(messages)` or
  `ctx.mediaGroups.copyMediaGroup(messages)` converts stored messages into
  `InputMedia[]` ready for `sendMediaGroup`. Supports photo, video, document,
  audio and animation, with optional caption/parse_mode override.

## Installation

### Node.js

```bash
npm install github:PonomareVlad/grammy-media-groups
```

### Deno

```typescript
import {
    copyMediaGroup,
    mediaGroups,
    type MediaGroupsFlavor,
} from "https://raw.githubusercontent.com/PonomareVlad/grammy-media-groups/main/src/mod.ts";
```

## Usage

```typescript
import { Bot, Context } from "grammy";
import { mediaGroups, type MediaGroupsFlavor } from "@grammyjs/media-groups";

type MyContext = Context & MediaGroupsFlavor;

const bot = new Bot<MyContext>("<your-bot-token>");

// Uses MemorySessionStorage by default — pass a custom adapter for persistence
const mg = mediaGroups();
bot.use(mg);

// Install transformer for outgoing API responses
bot.api.config.use(mg.transformer);

// Retrieve the media group of the current message
bot.on("message", async (ctx) => {
    const group = await ctx.mediaGroups.getForMsg();
    if (group) {
        console.log(`Media group has ${group.length} messages`);
    }
});

// Reply to an album message with /album to resend the full media group
bot.command("album", async (ctx) => {
    const group = await ctx.mediaGroups.getForReply();
    if (group) {
        await ctx.replyWithMediaGroup(
            ctx.mediaGroups.copyMediaGroup(group),
        );
    }
});

// Resend with a custom caption
bot.command("copy", async (ctx) => {
    const group = await ctx.mediaGroups.getForReply();
    if (group) {
        await ctx.replyWithMediaGroup(
            ctx.mediaGroups.copyMediaGroup(group, {
                caption: "<b>Forwarded album</b>",
                parse_mode: "HTML",
            }),
        );
    }
});

// Programmatic access outside middleware
const messages = await mg.getMediaGroup("some-media-group-id");
```

### Manual Mode

To disable automatic storing, pass `{ autoStore: false }`. This gives you full
control over which messages get stored via `ctx.mediaGroups.store()`:

```typescript
const mg = mediaGroups(undefined, { autoStore: false });
bot.use(mg);

bot.on("message", async (ctx) => {
    // Only store messages you care about
    if (ctx.msg.media_group_id) {
        await ctx.mediaGroups.store(ctx.msg);
    }

    // You can also manually store reply_to_message
    const reply = ctx.msg.reply_to_message;
    if (reply?.media_group_id) {
        await ctx.mediaGroups.store(reply);
    }

    // Delete a media group when no longer needed
    // await ctx.mediaGroups.delete("some-media-group-id");
});

// Delete from outside middleware
// await mg.deleteMediaGroup("some-media-group-id");
```
