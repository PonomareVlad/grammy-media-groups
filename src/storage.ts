import type { Message, StorageAdapter } from "./deps.deno.ts";

/**
 * API methods whose responses may contain messages with `media_group_id`.
 */
export const MEDIA_GROUP_METHODS: string[] = [
    "sendMediaGroup",
    "copyMessage",
    "forwardMessage",
    "editMessageMedia",
    "editMessageCaption",
    "editMessageText",
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
