import { assertEquals } from "jsr:@std/assert@1";
import type { Message } from "./deps.deno.ts";
import {
    Api,
    Context,
    MemorySessionStorage,
    type UserFromGetMe,
} from "./deps.deno.ts";
import { mediaGroups, type MediaGroupsFlavor } from "./mod.ts";

/** Creates a minimal Message-like object for testing. */
function msg(
    messageId: number,
    chatId: number,
    mediaGroupId?: string,
    extra: Record<string, unknown> = {},
): Message {
    return {
        message_id: messageId,
        chat: { id: chatId, type: "private" },
        date: 0,
        media_group_id: mediaGroupId,
        ...extra,
    } as unknown as Message;
}

type TestContext = Context & MediaGroupsFlavor;

/** Creates a Context for testing, casting through `any` to bypass strict Update types. */
// deno-lint-ignore no-explicit-any
function createCtx(update: any): TestContext {
    return new Context(update, new Api(""), {} as UserFromGetMe) as TestContext;
}

Deno.test("mediaGroups exposes getMediaGroup on the composer", async () => {
    const adapter = new MemorySessionStorage<Message[]>();
    const mg = mediaGroups(adapter);
    assertEquals(typeof mg.getMediaGroup, "function");

    // Returns undefined for unknown group
    assertEquals(await mg.getMediaGroup("unknown"), undefined);

    // Returns data after manual write
    const messages = [msg(1, 100, "g1")];
    await adapter.write("g1", messages);
    const result = await mg.getMediaGroup("g1");
    assertEquals(result?.length, 1);
    assertEquals(result?.[0].message_id, 1);
});

Deno.test("mediaGroups exposes adapter on the composer", () => {
    const adapter = new MemorySessionStorage<Message[]>();
    const mg = mediaGroups(adapter);
    assertEquals(mg.adapter, adapter);
});

Deno.test("middleware hydrates ctx.mediaGroups.getMediaGroup", async () => {
    const adapter = new MemorySessionStorage<Message[]>();
    const mg = mediaGroups(adapter);

    // Pre-populate storage
    await adapter.write("g1", [msg(1, 100, "g1"), msg(2, 100, "g1")]);

    const ctx = createCtx({
        update_id: 1,
        message: msg(1, 100, "g1"),
    });

    let called = false;
    await mg.middleware()(ctx, async () => {
        called = true;
        const group = await ctx.mediaGroups.getMediaGroup();
        assertEquals(group?.length, 2);
    });
    assertEquals(called, true);
});

Deno.test(
    "middleware stores incoming message with media_group_id",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        const mg = mediaGroups(adapter);

        const ctx = createCtx({
            update_id: 1,
            message: msg(5, 200, "g2"),
        });

        await mg.middleware()(ctx, async () => {});

        const stored = await adapter.read("g2");
        assertEquals(stored?.length, 1);
        assertEquals(stored?.[0].message_id, 5);
    },
);

Deno.test(
    "middleware returns undefined for messages without media_group_id",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        const mg = mediaGroups(adapter);

        const ctx = createCtx({
            update_id: 1,
            message: msg(1, 100),
        });

        await mg.middleware()(ctx, async () => {
            const group = await ctx.mediaGroups.getMediaGroup();
            assertEquals(group, undefined);
        });
    },
);

Deno.test(
    "middleware provides getMediaGroupForReply for reply_to_message",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        const mg = mediaGroups(adapter);

        // Pre-populate storage with the media group
        await adapter.write("g3", [msg(10, 300, "g3"), msg(11, 300, "g3")]);

        const replyMsg = msg(10, 300, "g3");
        const ctx = createCtx({
            update_id: 1,
            message: {
                ...msg(20, 300),
                reply_to_message: replyMsg,
            },
        });

        await mg.middleware()(ctx, async () => {
            const group = await ctx.mediaGroups.getMediaGroupForReply();
            assertEquals(group?.length, 2);
        });
    },
);

Deno.test(
    "getMediaGroupForReply returns undefined without media_group_id",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        const mg = mediaGroups(adapter);

        const replyMsg = msg(10, 300); // no media_group_id
        const ctx = createCtx({
            update_id: 1,
            message: {
                ...msg(20, 300),
                reply_to_message: replyMsg,
            },
        });

        await mg.middleware()(ctx, async () => {
            const group = await ctx.mediaGroups.getMediaGroupForReply();
            assertEquals(group, undefined);
        });
    },
);

Deno.test(
    "middleware provides getMediaGroupForPinned for pinned_message",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        const mg = mediaGroups(adapter);

        // Pre-populate storage with the media group
        await adapter.write("g4", [msg(30, 400, "g4"), msg(31, 400, "g4")]);

        const pinnedMsg = msg(30, 400, "g4");
        const ctx = createCtx({
            update_id: 1,
            message: {
                ...msg(40, 400),
                pinned_message: pinnedMsg,
            },
        });

        await mg.middleware()(ctx, async () => {
            const group = await ctx.mediaGroups.getMediaGroupForPinned();
            assertEquals(group?.length, 2);
        });
    },
);

Deno.test(
    "getMediaGroupForPinned returns undefined without media_group_id",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        const mg = mediaGroups(adapter);

        const pinnedMsg = msg(30, 400); // no media_group_id
        const ctx = createCtx({
            update_id: 1,
            message: {
                ...msg(40, 400),
                pinned_message: pinnedMsg,
            },
        });

        await mg.middleware()(ctx, async () => {
            const group = await ctx.mediaGroups.getMediaGroupForPinned();
            assertEquals(group, undefined);
        });
    },
);

Deno.test(
    "middleware stores pinned_message with media_group_id",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        const mg = mediaGroups(adapter);

        const pinnedMsg = msg(30, 400, "g5");
        const ctx = createCtx({
            update_id: 1,
            message: {
                ...msg(40, 400),
                pinned_message: pinnedMsg,
            },
        });

        await mg.middleware()(ctx, async () => {});

        const stored = await adapter.read("g5");
        assertEquals(stored?.length, 1);
        assertEquals(stored?.[0].message_id, 30);
    },
);

Deno.test(
    "middleware stores reply_to_message with media_group_id",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        const mg = mediaGroups(adapter);

        const replyMsg = msg(10, 300, "g6");
        const ctx = createCtx({
            update_id: 1,
            message: {
                ...msg(20, 300),
                reply_to_message: replyMsg,
            },
        });

        await mg.middleware()(ctx, async () => {});

        const stored = await adapter.read("g6");
        assertEquals(stored?.length, 1);
        assertEquals(stored?.[0].message_id, 10);
    },
);
