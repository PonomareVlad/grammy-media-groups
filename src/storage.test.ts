import { assertEquals } from "@std/assert";
import type { Message } from "./deps.deno.ts";
import { MemorySessionStorage } from "./deps.deno.ts";
import { MEDIA_GROUP_METHODS, storeMessages } from "./storage.ts";

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

// --- storeMessages ---

Deno.test("storeMessages skips messages without media_group_id", async () => {
    const adapter = new MemorySessionStorage<Message[]>();
    await storeMessages(adapter, [msg(1, 100)]);
    assertEquals(await adapter.read("any"), undefined);
});

Deno.test("storeMessages stores a new message", async () => {
    const adapter = new MemorySessionStorage<Message[]>();
    await storeMessages(adapter, [msg(1, 100, "g1")]);
    const stored = await adapter.read("g1");
    assertEquals(stored?.length, 1);
    assertEquals(stored?.[0].message_id, 1);
});

Deno.test(
    "storeMessages appends different messages to the same group",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        await storeMessages(adapter, [msg(1, 100, "g1")]);
        await storeMessages(adapter, [msg(2, 100, "g1")]);
        const stored = await adapter.read("g1");
        assertEquals(stored?.length, 2);
        assertEquals(stored?.[0].message_id, 1);
        assertEquals(stored?.[1].message_id, 2);
    },
);

Deno.test(
    "storeMessages replaces an existing message (update-in-place)",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        await storeMessages(adapter, [msg(1, 100, "g1", { text: "old" })]);
        await storeMessages(adapter, [msg(1, 100, "g1", { text: "new" })]);
        const stored = await adapter.read("g1");
        assertEquals(stored?.length, 1);
        assertEquals(
            (stored?.[0] as unknown as Record<string, unknown>).text,
            "new",
        );
    },
);

Deno.test(
    "storeMessages treats same message_id in different chats as distinct",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        await storeMessages(adapter, [msg(1, 100, "g1")]);
        await storeMessages(adapter, [msg(1, 200, "g1")]);
        const stored = await adapter.read("g1");
        assertEquals(stored?.length, 2);
    },
);

// --- MEDIA_GROUP_METHODS extractors ---

Deno.test("sendMediaGroup extractor returns array", () => {
    const messages = [msg(1, 100), msg(2, 100)];
    assertEquals(MEDIA_GROUP_METHODS.sendMediaGroup(messages), messages);
});

Deno.test("sendMediaGroup extractor returns empty for non-array", () => {
    assertEquals(MEDIA_GROUP_METHODS.sendMediaGroup("not an array"), []);
    assertEquals(MEDIA_GROUP_METHODS.sendMediaGroup(null), []);
});

Deno.test("forwardMessage extractor wraps single message", () => {
    const m = msg(1, 100);
    const result = MEDIA_GROUP_METHODS.forwardMessage(m);
    assertEquals(result.length, 1);
    assertEquals(result[0].message_id, 1);
});

Deno.test("editMessageMedia extractor returns empty for true", () => {
    assertEquals(MEDIA_GROUP_METHODS.editMessageMedia(true), []);
});

Deno.test("editMessageMedia extractor returns message for object", () => {
    const m = msg(1, 100);
    const result = MEDIA_GROUP_METHODS.editMessageMedia(m);
    assertEquals(result.length, 1);
    assertEquals(result[0].message_id, 1);
});

Deno.test("unknown method is not in MEDIA_GROUP_METHODS", () => {
    assertEquals(MEDIA_GROUP_METHODS["someMethod"], undefined);
});

// --- MEDIA_GROUP_METHODS ---

Deno.test("MEDIA_GROUP_METHODS contains expected methods", () => {
    const expected = [
        "sendMediaGroup",
        "forwardMessage",
        "editMessageMedia",
        "editMessageCaption",
        "editMessageReplyMarkup",
    ];
    assertEquals(Object.keys(MEDIA_GROUP_METHODS), expected);
});

// --- storeMessages (batch) ---

Deno.test(
    "storeMessages stores multiple messages in a single batch",
    async () => {
        const adapter = new MemorySessionStorage<Message[]>();
        await storeMessages(adapter, [
            msg(1, 100, "g1"),
            msg(2, 100, "g1"),
            msg(3, 100, "g1"),
        ]);
        const stored = await adapter.read("g1");
        assertEquals(stored?.length, 3);
    },
);

Deno.test("storeMessages skips messages without media_group_id", async () => {
    const adapter = new MemorySessionStorage<Message[]>();
    await storeMessages(adapter, [msg(1, 100), msg(2, 100, "g1")]);
    assertEquals(await adapter.read("g1"), [msg(2, 100, "g1")]);
});

Deno.test("storeMessages replaces existing messages in batch", async () => {
    const adapter = new MemorySessionStorage<Message[]>();
    await storeMessages(adapter, [msg(1, 100, "g1", { text: "old" })]);
    await storeMessages(adapter, [
        msg(1, 100, "g1", { text: "new" }),
        msg(2, 100, "g1"),
    ]);
    const stored = await adapter.read("g1");
    assertEquals(stored?.length, 2);
    assertEquals(
        (stored?.[0] as unknown as Record<string, unknown>).text,
        "new",
    );
    assertEquals(stored?.[1].message_id, 2);
});

Deno.test("storeMessages handles empty array", async () => {
    const adapter = new MemorySessionStorage<Message[]>();
    await storeMessages(adapter, []);
    assertEquals(await adapter.read("g1"), undefined);
});
