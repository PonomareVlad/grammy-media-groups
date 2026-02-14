import { assertEquals } from "jsr:@std/assert@1";
import { Api, Context, MemorySessionStorage, type UserFromGetMe } from "./deps.deno.ts";
import type { Message } from "./deps.deno.ts";
import { type MediaGroupsFlavor, mediaGroups } from "./mod.ts";

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
    return new Context(
        update,
        new Api(""),
        {} as UserFromGetMe,
    ) as TestContext;
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

Deno.test("middleware hydrates ctx.getMediaGroup", async () => {
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
        const group = await ctx.getMediaGroup();
        assertEquals(group?.length, 2);
    });
    assertEquals(called, true);
});

Deno.test("middleware stores incoming message with media_group_id", async () => {
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
});

Deno.test("middleware returns undefined for messages without media_group_id", async () => {
    const adapter = new MemorySessionStorage<Message[]>();
    const mg = mediaGroups(adapter);

    const ctx = createCtx({
        update_id: 1,
        message: msg(1, 100),
    });

    await mg.middleware()(ctx, async () => {
        const group = await ctx.getMediaGroup();
        assertEquals(group, undefined);
    });
});

Deno.test("middleware hydrates reply_to_message with getMediaGroup", async () => {
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
        // deno-lint-ignore no-explicit-any
        const reply = (ctx.message as any).reply_to_message;
        assertEquals(typeof reply.getMediaGroup, "function");
        const group = await reply.getMediaGroup();
        assertEquals(group?.length, 2);
    });
});

Deno.test("middleware does not hydrate reply_to_message without media_group_id", async () => {
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
        // deno-lint-ignore no-explicit-any
        const reply = (ctx.message as any).reply_to_message;
        assertEquals(reply.getMediaGroup, undefined);
    });
});
