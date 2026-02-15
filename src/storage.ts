import type { Message, StorageAdapter } from "./deps.deno.ts";

/** Wraps a single Message in an array. */
const toArray = (result: Message): Message[] => [result];

/** Returns a Message in an array if it's an object, or empty if `true` (inline edit). */
// deno-lint-ignore no-explicit-any
const toArrayIfObject = (result: any): Message[] =>
    result !== null && typeof result === "object" ? [result] : [];

/**
 * Static mapping of API methods to their result extraction logic.
 * Keys are method names whose responses may contain messages with `media_group_id`.
 * Values are functions that extract `Message[]` from the raw API result.
 */
// deno-lint-ignore no-explicit-any
export const MEDIA_GROUP_METHODS: Record<string, (result: any) => Message[]> = {
    sendMediaGroup: (result) => (Array.isArray(result) ? result : []),
    forwardMessage: toArray,
    editMessageMedia: toArrayIfObject,
    editMessageCaption: toArrayIfObject,
    editMessageReplyMarkup: toArrayIfObject,
};

/**
 * Stores messages in batch, grouped by `media_group_id`.
 * Performs one read and one write per group instead of per message.
 * Messages without `media_group_id` are skipped.
 * Existing entries with the same `(message_id, chat.id)` are replaced in-place.
 */
export async function storeMessages(
    adapter: StorageAdapter<Message[]>,
    messages: Message[],
): Promise<void> {
    const groups: Record<string, Message[]> = {};

    for (const message of messages) {
        const { media_group_id } = message;
        if (!media_group_id) continue;

        const group =
            (groups[media_group_id] ??= (await adapter.read(media_group_id)) ??
                []);

        const index = group.findIndex(
            (m) =>
                m.message_id === message.message_id &&
                m.chat.id === message.chat.id,
        );

        group[index >= 0 ? index : group.length] = message;
    }

    await Promise.all(
        Object.entries(groups).map(([key, value]) => adapter.write(key, value)),
    );
}
