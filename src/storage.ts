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
 * Stores a message into the media group storage, appending it to the
 * existing array or replacing an existing entry with the same message.
 */
export async function storeMessage(
    adapter: StorageAdapter<Message[]>,
    message: Message,
): Promise<void> {
    const mediaGroupId = message.media_group_id;
    if (!mediaGroupId) return;

    const existing = (await adapter.read(mediaGroupId)) ?? [];

    const index = existing.findIndex(
        (m) =>
            m.message_id === message.message_id &&
            m.chat.id === message.chat.id,
    );

    if (index >= 0) {
        existing[index] = message;
    } else {
        existing.push(message);
    }

    await adapter.write(mediaGroupId, existing);
}

/**
 * Stores multiple messages in batch, grouped by `media_group_id`.
 * Performs one read and one write per group instead of per message.
 */
export async function storeMessages(
    adapter: StorageAdapter<Message[]>,
    messages: Message[],
): Promise<void> {
    const groups = new Map<string, Message[]>();
    for (const message of messages) {
        const mediaGroupId = message.media_group_id;
        if (!mediaGroupId) continue;
        let group = groups.get(mediaGroupId);
        if (!group) {
            group = [];
            groups.set(mediaGroupId, group);
        }
        group.push(message);
    }

    for (const [mediaGroupId, newMessages] of groups) {
        const existing = (await adapter.read(mediaGroupId)) ?? [];

        for (const message of newMessages) {
            const index = existing.findIndex(
                (m) =>
                    m.message_id === message.message_id &&
                    m.chat.id === message.chat.id,
            );

            if (index >= 0) {
                existing[index] = message;
            } else {
                existing.push(message);
            }
        }

        await adapter.write(mediaGroupId, existing);
    }
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
