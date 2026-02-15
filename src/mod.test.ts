import { assertEquals } from "@std/assert";
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

Deno.test("middleware hydrates ctx.mediaGroups.getForMsg", async () => {
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
        const group = await ctx.mediaGroups.getForMsg();
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
            const group = await ctx.mediaGroups.getForMsg();
            assertEquals(group, undefined);
        });
    },
);

Deno.test(
    "middleware provides getForReply for reply_to_message",
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
            const group = await ctx.mediaGroups.getForReply();
            assertEquals(group?.length, 2);
        });
    },
);

Deno.test(
    "getForReply returns undefined without media_group_id",
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
            const group = await ctx.mediaGroups.getForReply();
            assertEquals(group, undefined);
        });
    },
);

Deno.test(
    "middleware provides getForPinned for pinned_message",
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
            const group = await ctx.mediaGroups.getForPinned();
            assertEquals(group?.length, 2);
        });
    },
);

Deno.test(
    "getForPinned returns undefined without media_group_id",
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
            const group = await ctx.mediaGroups.getForPinned();
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

Deno.test(
    "autoStore: false skips automatic message storing",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        const mg = mediaGroups(adapter, { autoStore: false });

        const ctx = createCtx({
            update_id: 1,
            message: msg(5, 200, "g7"),
        });

        await mg.middleware()(ctx, async () => {});

        // Should NOT be stored automatically
        const stored = await adapter.read("g7");
        assertEquals(stored, undefined);
    },
);

Deno.test(
    "ctx.mediaGroups.store() manually stores a message",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        const mg = mediaGroups(adapter, { autoStore: false });

        const message = msg(5, 200, "g8");
        const ctx = createCtx({
            update_id: 1,
            message,
        });

        await mg.middleware()(ctx, async () => {
            await ctx.mediaGroups.store(message);
        });

        const stored = await adapter.read("g8");
        assertEquals(stored?.length, 1);
        assertEquals(stored?.[0].message_id, 5);
    },
);

Deno.test(
    "ctx.mediaGroups.store() works in auto mode too",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        const mg = mediaGroups(adapter);

        const message = msg(5, 200, "g9");
        const ctx = createCtx({
            update_id: 1,
            message: msg(1, 100), // no media_group_id
        });

        await mg.middleware()(ctx, async () => {
            await ctx.mediaGroups.store(message);
        });

        const stored = await adapter.read("g9");
        assertEquals(stored?.length, 1);
        assertEquals(stored?.[0].message_id, 5);
    },
);

Deno.test(
    "autoStore: false still hydrates getForMsg methods",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        const mg = mediaGroups(adapter, { autoStore: false });

        // Pre-populate storage
        await adapter.write("g10", [msg(1, 100, "g10"), msg(2, 100, "g10")]);

        const ctx = createCtx({
            update_id: 1,
            message: msg(1, 100, "g10"),
        });

        await mg.middleware()(ctx, async () => {
            const group = await ctx.mediaGroups.getForMsg();
            assertEquals(group?.length, 2);
        });
    },
);

Deno.test(
    "ctx.mediaGroups.delete() removes a media group from storage",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        const mg = mediaGroups(adapter);

        // Pre-populate storage
        await adapter.write("g11", [msg(1, 100, "g11"), msg(2, 100, "g11")]);

        const ctx = createCtx({
            update_id: 1,
            message: msg(1, 100, "g11"),
        });

        await mg.middleware()(ctx, async () => {
            // Verify group exists
            const group = await ctx.mediaGroups.getForMsg();
            assertEquals(group?.length, 2);

            // Delete it
            await ctx.mediaGroups.delete("g11");

            // Verify it's gone
            const deleted = await ctx.mediaGroups.getForMsg();
            assertEquals(deleted, undefined);
        });
    },
);

Deno.test(
    "mg.deleteMediaGroup() removes a media group from storage",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        const mg = mediaGroups(adapter);

        // Pre-populate storage
        await adapter.write("g12", [msg(1, 100, "g12"), msg(2, 100, "g12")]);

        // Verify group exists
        const before = await mg.getMediaGroup("g12");
        assertEquals(before?.length, 2);

        // Delete it
        await mg.deleteMediaGroup("g12");

        // Verify it's gone
        const after = await mg.getMediaGroup("g12");
        assertEquals(after, undefined);
    },
);
