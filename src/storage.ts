import type { Message, StorageAdapter } from "./deps.deno.ts";

/**
 * API methods whose responses may contain messages with `media_group_id`.
 */
export const MEDIA_GROUP_METHODS: string[] = [
    "sendMediaGroup",
    "forwardMessage",
    "editMessageMedia",
    "editMessageCaption",
    "editMessageReplyMarkup",
];

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
 * Extracts messages from an API response result.
 */
export function extractMessages(
    method: string,
    // deno-lint-ignore no-explicit-any
    result: any,
): Message[] {
    if (method === "sendMediaGroup") {
        return Array.isArray(result) ? result : [];
    }

    if (Array.isArray(result)) {
        return result.filter(
            (item): item is Message =>
                item != null &&
                typeof item === "object" &&
                "message_id" in item,
        );
    }

    if (
        result != null &&
        typeof result === "object" &&
        "message_id" in result
    ) {
        return [result as Message];
    }

    return [];
}
