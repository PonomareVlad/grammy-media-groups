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
- **Context hydration** — adds `ctx.getMediaGroup()` to fetch the current
  message's media group.
- **Reply hydration** — adds `getMediaGroup()` to `reply_to_message` when it
  belongs to a media group.
- **Programmatic access** — the returned composer exposes
  `getMediaGroup(mediaGroupId)` for use outside of middleware.

## Installation

### Node.js

```bash
npm install @grammyjs/media-groups
```

### Deno

```typescript
// Update the URL below once the module is published on deno.land
import {
    mediaGroups,
    type MediaGroupsFlavor,
} from "https://deno.land/x/grammy_media_groups/mod.ts";
```

## Usage

```typescript
import { Bot, Context, InputMediaBuilder } from "grammy";
import { mediaGroups, type MediaGroupsFlavor } from "@grammyjs/media-groups";

type MyContext = Context & MediaGroupsFlavor;

const bot = new Bot<MyContext>("<your-bot-token>");

// Uses MemorySessionStorage by default — pass a custom adapter for persistence
const mg = mediaGroups();
bot.use(mg);

// Retrieve the media group of the current message
bot.on("message", async (ctx) => {
    const group = await ctx.getMediaGroup();
    if (group) {
        console.log(`Media group has ${group.length} messages`);
    }
});

// Reply to an album message with /album to resend the full media group
bot.command("album", async (ctx) => {
    const group = await ctx.msg?.reply_to_message?.getMediaGroup?.();
    if (group) {
        await ctx.replyWithMediaGroup(
            group
                .map((msg) => {
                    const opts = { caption: msg.caption };
                    switch (true) {
                        case "photo" in msg: {
                            const id = msg.photo?.at(-1)?.file_id;
                            return InputMediaBuilder.photo(id, opts);
                        }
                        case "video" in msg: {
                            const id = msg.video?.file_id;
                            return InputMediaBuilder.video(id, opts);
                        }
                        case "document" in msg: {
                            const id = msg.document?.file_id;
                            return InputMediaBuilder.document(id, opts);
                        }
                    }
                })
                .filter(Boolean),
        );
    }
});

// Programmatic access outside middleware
const messages = await mg.getMediaGroup("some-media-group-id");
```
