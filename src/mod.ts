import {
    Composer,
    Context,
    MemorySessionStorage,
    type StorageAdapter,
    type Transformer,
} from "./deps.deno.ts";
import type { Message } from "./deps.deno.ts";
import { extractMessages, MEDIA_GROUP_METHODS, storeMessages } from "./storage.ts";

export { extractMessages, MEDIA_GROUP_METHODS, storeMessages } from "./storage.ts";

/**
 * Flavor for context that adds media group methods.
 */
export type MediaGroupsFlavor = {
    /**
     * Gets all messages belonging to the current message's media group.
     * Returns `undefined` if the current message is not part of a media group.
     */
    getMediaGroup: () => Promise<Message[] | undefined>;
};

type MediaGroupsContext = Context & MediaGroupsFlavor;

/**
 * Creates middleware and transformer that collect media group messages
 * from incoming updates and outgoing API responses, and hydrate the
 * context with methods to retrieve stored media groups.
 *
 * @param adapter Storage adapter for persisting media group data (defaults to `MemorySessionStorage`)
 * @returns A composer with middleware installed
 *
 * @example
 * ```typescript
 * import { Bot, Context, InputMediaBuilder } from "grammy";
 * import { type MediaGroupsFlavor, mediaGroups } from "@grammyjs/media-groups";
 *
 * type MyContext = Context & MediaGroupsFlavor;
 *
 * const bot = new Bot<MyContext>("<token>");
 *
 * // Uses MemorySessionStorage by default
 * const mg = mediaGroups();
 * bot.use(mg);
 *
 * // Programmatic access
 * const messages = await mg.getMediaGroup("some-media-group-id");
 *
 * // In a command handler replying to a media group message
 * bot.command("album", async (ctx) => {
 *   const group = await ctx.msg?.reply_to_message?.getMediaGroup?.();
 *   if (group) {
 *     await ctx.replyWithMediaGroup(
 *       group.map((msg) => {
 *         const opts = { caption: msg.caption };
 *         if (msg.photo) return InputMediaBuilder.photo(msg.photo.at(-1)!.file_id, opts);
 *         if (msg.video) return InputMediaBuilder.video(msg.video.file_id, opts);
 *         if (msg.document) return InputMediaBuilder.document(msg.document.file_id, opts);
 *         return InputMediaBuilder.photo(""); // fallback
 *       }),
 *     );
 *   }
 * });
 * ```
 */
export function mediaGroups(
    adapter: StorageAdapter<Message[]> = new MemorySessionStorage<Message[]>(),
): Composer<MediaGroupsContext> & {
    /**
     * Fetches a media group by its ID from storage.
     *
     * @param mediaGroupId The media group ID to look up
     * @returns Array of messages in the media group, or `undefined` if not found
     */
    getMediaGroup: (mediaGroupId: string) => Promise<Message[] | undefined>;
} {
    const composer = new Composer<MediaGroupsContext>();

    const getMediaGroup = async (
        mediaGroupId: string,
    ): Promise<Message[] | undefined> => {
        return await adapter.read(mediaGroupId);
    };

    // deno-lint-ignore no-explicit-any
    const mediaGroupTransformer: Transformer<any> = async (
        prev,
        method,
        payload,
        signal,
    ) => {
        const res = await prev(method, payload, signal);
        if (res.ok && MEDIA_GROUP_METHODS.includes(method)) {
            const messages = extractMessages(method, res.result);
            await storeMessages(adapter, messages);
        }
        return res;
    };

    // Install transformer to capture outgoing API responses (once per API instance)
    const installedApis = new WeakSet<object>();
    composer.use((ctx, next) => {
        if (!installedApis.has(ctx.api)) {
            installedApis.add(ctx.api);
            ctx.api.config.use(mediaGroupTransformer);
        }
        return next();
    });

    // Hydrate context and store incoming messages
    composer.use(async (ctx, next) => {
        const msg = ctx.msg ?? ctx.message;

        ctx.getMediaGroup = async () => {
            const mediaGroupId = msg?.media_group_id;
            if (!mediaGroupId) return undefined;
            return await getMediaGroup(mediaGroupId);
        };

        // Collect messages to store in batch
        const toStore: Message[] = [];

        if (msg?.media_group_id) {
            toStore.push(msg);
        }

        // Hydrate reply_to_message with getMediaGroup if present
        if (msg && "reply_to_message" in msg && msg.reply_to_message) {
            const replyToMessage = msg.reply_to_message;

            if (replyToMessage.media_group_id) {
                toStore.push(replyToMessage);

                Object.defineProperty(replyToMessage, "getMediaGroup", {
                    value: () => getMediaGroup(replyToMessage.media_group_id!),
                    enumerable: false,
                });
            }
        }

        if (toStore.length > 0) {
            await storeMessages(adapter, toStore);
        }

        return next();
    });

    // Attach the standalone getMediaGroup function
    const result = composer as Composer<MediaGroupsContext> & {
        getMediaGroup: (
            mediaGroupId: string,
        ) => Promise<Message[] | undefined>;
    };
    result.getMediaGroup = getMediaGroup;

    return result;
}

export default mediaGroups;
