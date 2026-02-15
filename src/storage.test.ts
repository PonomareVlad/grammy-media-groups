import { assertEquals } from "@std/assert";
import type { Message } from "./deps.deno.ts";
import { MemorySessionStorage } from "./deps.deno.ts";
import { MEDIA_GROUP_METHODS, storeMessages, toInputMedia } from "./storage.ts";

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

// --- toInputMedia ---

Deno.test("toInputMedia converts photo messages", () => {
    const messages = [
        msg(1, 100, "g1", {
            photo: [{
                file_id: "small",
                file_unique_id: "s",
                width: 90,
                height: 90,
            }, {
                file_id: "large",
                file_unique_id: "l",
                width: 800,
                height: 600,
            }],
            caption: "My photo",
        }),
    ];
    const result = toInputMedia(messages);
    assertEquals(result.length, 1);
    assertEquals(result[0].type, "photo");
    assertEquals(result[0].media, "large");
    assertEquals(result[0].caption, "My photo");
});

Deno.test("toInputMedia converts video messages", () => {
    const messages = [
        msg(1, 100, "g1", {
            video: {
                file_id: "vid1",
                file_unique_id: "v1",
                width: 1920,
                height: 1080,
                duration: 30,
            },
        }),
    ];
    const result = toInputMedia(messages);
    assertEquals(result.length, 1);
    assertEquals(result[0].type, "video");
    assertEquals(result[0].media, "vid1");
});

Deno.test("toInputMedia converts document messages", () => {
    const messages = [
        msg(1, 100, "g1", {
            document: { file_id: "doc1", file_unique_id: "d1" },
        }),
    ];
    const result = toInputMedia(messages);
    assertEquals(result.length, 1);
    assertEquals(result[0].type, "document");
    assertEquals(result[0].media, "doc1");
});

Deno.test("toInputMedia converts audio messages", () => {
    const messages = [
        msg(1, 100, "g1", {
            audio: { file_id: "aud1", file_unique_id: "a1", duration: 120 },
        }),
    ];
    const result = toInputMedia(messages);
    assertEquals(result.length, 1);
    assertEquals(result[0].type, "audio");
    assertEquals(result[0].media, "aud1");
});

Deno.test("toInputMedia converts animation messages as video", () => {
    const messages = [
        msg(1, 100, "g1", {
            animation: {
                file_id: "anim1",
                file_unique_id: "an1",
                width: 320,
                height: 240,
                duration: 5,
            },
        }),
    ];
    const result = toInputMedia(messages);
    assertEquals(result.length, 1);
    assertEquals(result[0].type, "video");
    assertEquals(result[0].media, "anim1");
});

Deno.test("toInputMedia handles mixed media types", () => {
    const messages = [
        msg(1, 100, "g1", {
            photo: [{
                file_id: "ph1",
                file_unique_id: "p1",
                width: 800,
                height: 600,
            }],
        }),
        msg(2, 100, "g1", {
            video: {
                file_id: "vid1",
                file_unique_id: "v1",
                width: 1920,
                height: 1080,
                duration: 30,
            },
        }),
    ];
    const result = toInputMedia(messages);
    assertEquals(result.length, 2);
    assertEquals(result[0].type, "photo");
    assertEquals(result[1].type, "video");
});

Deno.test("toInputMedia overrides caption on first item", () => {
    const messages = [
        msg(1, 100, "g1", {
            photo: [{
                file_id: "ph1",
                file_unique_id: "p1",
                width: 800,
                height: 600,
            }],
            caption: "Original caption 1",
        }),
        msg(2, 100, "g1", {
            photo: [{
                file_id: "ph2",
                file_unique_id: "p2",
                width: 800,
                height: 600,
            }],
            caption: "Original caption 2",
        }),
    ];
    const entities = [{ type: "bold" as const, offset: 0, length: 3 }];
    const result = toInputMedia(messages, {
        caption: "New caption",
        parse_mode: "HTML",
        caption_entities: entities,
    });
    assertEquals(result[0].caption, "New caption");
    assertEquals(result[0].parse_mode, "HTML");
    assertEquals(result[0].caption_entities, entities);
    assertEquals(result[1].caption, "Original caption 2");
    assertEquals(result[1].parse_mode, undefined);
});

Deno.test("toInputMedia preserves caption_entities without override", () => {
    const entities = [{ type: "bold" as const, offset: 0, length: 5 }];
    const messages = [
        msg(1, 100, "g1", {
            photo: [{
                file_id: "ph1",
                file_unique_id: "p1",
                width: 800,
                height: 600,
            }],
            caption: "Hello",
            caption_entities: entities,
        }),
    ];
    const result = toInputMedia(messages);
    assertEquals(result[0].caption, "Hello");
    assertEquals(result[0].caption_entities, entities);
});

Deno.test("toInputMedia returns empty array for empty input", () => {
    const result = toInputMedia([]);
    assertEquals(result, []);
});

Deno.test("toInputMedia skips unsupported message types", () => {
    const messages = [msg(1, 100, "g1", { text: "just text" })];
    const result = toInputMedia(messages);
    assertEquals(result, []);
});
