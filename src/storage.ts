import type {
    InputMedia,
    Message,
    ParseMode,
    StorageAdapter,
} from "./deps.deno.ts";

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

/**
 * Options for {@link copyMediaGroup}.
 */
export interface CopyMediaGroupOptions {
    /** Override caption on the first item of the media group. */
    caption?: string;
    /** Text formatting mode for the overridden caption. */
    parse_mode?: ParseMode;
}

/**
 * Converts an array of media group messages into an `InputMedia[]` array
 * suitable for {@link https://core.telegram.org/bots/api#sendmediagroup sendMediaGroup}.
 *
 * Supports photo, video, document, audio and animation messages.
 *
 * @param messages Array of messages belonging to a media group
 * @param options  Optional caption/parse_mode override applied to the first item
 * @returns An array of `InputMedia` objects ready to be sent
 *
 * @example
 * ```typescript
 * const group = await ctx.mediaGroups.getForReply();
 * if (group) {
 *     await ctx.replyWithMediaGroup(copyMediaGroup(group));
 * }
 * ```
 *
 * @example With caption override:
 * ```typescript
 * const group = await ctx.mediaGroups.getForReply();
 * if (group) {
 *     const media = copyMediaGroup(group, {
 *         caption: "<b>Forwarded album</b>",
 *         parse_mode: "HTML",
 *     });
 *     await ctx.replyWithMediaGroup(media);
 * }
 * ```
 */
export function copyMediaGroup(
    messages: Message[],
    options: CopyMediaGroupOptions = {},
): InputMedia[] {
    return messages.map((msg, i) => {
        const overrideCaption = options.caption !== undefined && i === 0;
        const base = {
            caption: overrideCaption ? options.caption : msg.caption,
            parse_mode: overrideCaption ? options.parse_mode : undefined,
            caption_entities: overrideCaption
                ? undefined
                : msg.caption_entities,
        };
        if ("photo" in msg && msg.photo) {
            return {
                type: "photo" as const,
                media: msg.photo.at(-1)!.file_id,
                ...base,
            };
        }
        if ("video" in msg && msg.video) {
            return {
                type: "video" as const,
                media: msg.video.file_id,
                ...base,
            };
        }
        if ("animation" in msg && msg.animation) {
            return {
                type: "animation" as const,
                media: msg.animation.file_id,
                ...base,
            };
        }
        if ("document" in msg && msg.document) {
            return {
                type: "document" as const,
                media: msg.document.file_id,
                ...base,
            };
        }
        if ("audio" in msg && msg.audio) {
            return {
                type: "audio" as const,
                media: msg.audio.file_id,
                ...base,
            };
        }
        return { type: "photo" as const, media: "", ...base };
    });
}
