import { InputMediaBuilder, type StorageAdapter } from "./deps.deno.ts";
import type {
    InputMedia,
    Message,
    MessageEntity,
    ParseMode,
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
 * Options for {@link toInputMedia}.
 */
export interface ToInputMediaOptions {
    /** Override caption on the first item of the media group. */
    caption?: string;
    /**
     * Text formatting mode for the overridden caption.
     * Only applied when `caption` is provided.
     */
    parse_mode?: ParseMode;
    /**
     * Entities for the overridden caption.
     * Only applied when `caption` is provided.
     */
    caption_entities?: MessageEntity[];
    /**
     * Show caption above the media.
     * Only applied when `caption` is provided (first item).
     */
    show_caption_above_media?: boolean;
    /** Mark media as containing a spoiler (applies to all photo and video items). */
    has_spoiler?: boolean;
}

/**
 * Converts an array of media group messages into an `InputMedia[]` array
 * suitable for {@link https://core.telegram.org/bots/api#sendmediagroup sendMediaGroup}.
 *
 * Supports photo, video, document, audio and animation messages.
 * Animations are mapped to `"video"` since `sendMediaGroup` does not
 * accept `"animation"` as an input media type.
 *
 * @param messages Array of messages belonging to a media group
 * @param options  Optional overrides: caption, parse_mode, caption_entities,
 *                 show_caption_above_media (all first item only when caption is set),
 *                 has_spoiler (all photo/video items)
 * @returns An array of `InputMedia` objects ready to be sent
 *
 * @example
 * ```typescript
 * const group = await ctx.mediaGroups.getForReply();
 * if (group) {
 *     await ctx.replyWithMediaGroup(toInputMedia(group));
 * }
 * ```
 *
 * @example With caption override:
 * ```typescript
 * const group = await ctx.mediaGroups.getForReply();
 * if (group) {
 *     const media = toInputMedia(group, {
 *         caption: "<b>Forwarded album</b>",
 *         parse_mode: "HTML",
 *     });
 *     await ctx.replyWithMediaGroup(media);
 * }
 * ```
 */
export function toInputMedia(
    messages: Message[],
    options: ToInputMediaOptions = {},
): InputMedia[] {
    const { has_spoiler } = options;
    return messages.map((msg, i): InputMedia | undefined => {
        const hasCaption = options.caption !== undefined && i === 0;
        const base = {
            caption: hasCaption ? options.caption : msg.caption,
            parse_mode: hasCaption ? options.parse_mode : undefined,
            caption_entities: hasCaption
                ? options.caption_entities
                : msg.caption_entities,
            show_caption_above_media: hasCaption
                ? options.show_caption_above_media
                : msg.show_caption_above_media,
        };
        const visual = { ...base, has_spoiler };
        switch (true) {
            case "photo" in msg:
                return InputMediaBuilder.photo(
                    msg.photo!.at(-1)!.file_id,
                    visual,
                );
            case "video" in msg:
                return InputMediaBuilder.video(msg.video!.file_id, visual);
            case "animation" in msg:
                return InputMediaBuilder.video(msg.animation!.file_id, visual);
            case "document" in msg:
                return InputMediaBuilder.document(msg.document!.file_id, base);
            case "audio" in msg:
                return InputMediaBuilder.audio(msg.audio!.file_id, base);
        }
    }).filter(Boolean) as InputMedia[];
}
