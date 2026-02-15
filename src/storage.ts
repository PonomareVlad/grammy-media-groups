import type { Message, StorageAdapter } from "./deps.deno.ts";

/**
 * Static mapping of API methods to their result extraction logic.
 * Keys are method names whose responses may contain messages with `media_group_id`.
 * Values are functions that extract `Message[]` from the raw API result.
 */
// deno-lint-ignore no-explicit-any
export const MEDIA_GROUP_METHODS: Record<string, (result: any) => Message[]> = {
    /** Returns `Message[]` */
    sendMediaGroup: (result) => (Array.isArray(result) ? result : []),
    /** Returns `Message` */
    forwardMessage: (result) => [result],
    /** Returns `Message | true` */
    editMessageMedia: (result) =>
        typeof result === "object" ? [result] : [],
    /** Returns `Message | true` */
    editMessageCaption: (result) =>
        typeof result === "object" ? [result] : [],
    /** Returns `Message | true` */
    editMessageReplyMarkup: (result) =>
        typeof result === "object" ? [result] : [],
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

/**
 * Extracts messages from an API response result using the static method map.
 */
export function extractMessages(
    method: string,
    // deno-lint-ignore no-explicit-any
    result: any,
): Message[] {
    const extractor = MEDIA_GROUP_METHODS[method];
    return extractor ? extractor(result) : [];
}
