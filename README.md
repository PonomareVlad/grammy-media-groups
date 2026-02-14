# Media Groups Storage Plugin for grammY

A [grammY](https://grammy.dev/) plugin that stores media group messages using
the [storages](https://github.com/grammyjs/storages) protocol. It collects all
messages that share the same `media_group_id` from both incoming updates and
outgoing API responses, and lets you retrieve the full group at any time.

## Features

- **Middleware** — automatically stores every incoming message that has a
  `media_group_id`.
- **Transformer** — intercepts Telegram API responses (`sendMediaGroup`,
  `copyMessage`, `forwardMessage`, `editMessage*`) and stores returned messages.
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
import { mediaGroups, type MediaGroupsFlavor } from "https://deno.land/x/grammy_media_groups/mod.ts";
```

## Usage

```typescript
import { Bot, Context, MemorySessionStorage } from "grammy";
import type { Message } from "grammy/types";
import { mediaGroups, type MediaGroupsFlavor } from "@grammyjs/media-groups";

type MyContext = Context & MediaGroupsFlavor;

const bot = new Bot<MyContext>("<your-bot-token>");

// Use any StorageAdapter<Message[]> — here we use an in-memory store
const adapter = new MemorySessionStorage<Message[]>();

// Install the plugin
const mg = mediaGroups(adapter);
bot.use(mg);

// Retrieve the media group of the current message
bot.on("message", async (ctx) => {
    const group = await ctx.getMediaGroup();
    if (group) {
        console.log(`Media group has ${group.length} messages`);
    }
});

// Use with reply_to_message — e.g. a /forward command
bot.command("forward", async (ctx) => {
    const reply = ctx.msg?.reply_to_message;
    if (reply?.getMediaGroup) {
        const group = await reply.getMediaGroup();
        if (group) {
            // Forward every message in the album
            for (const msg of group) {
                await ctx.api.forwardMessage(ctx.chat.id, msg.chat.id, msg.message_id);
            }
        }
    }
});

// Programmatic access outside middleware
const messages = await mg.getMediaGroup("some-media-group-id");
```
