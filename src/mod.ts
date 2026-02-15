import type { Message } from "./deps.deno.ts";
import {
    Composer,
    Context,
    MemorySessionStorage,
    type StorageAdapter,
    type Transformer,
} from "./deps.deno.ts";
import { MEDIA_GROUP_METHODS, storeMessages } from "./storage.ts";

export { MEDIA_GROUP_METHODS, storeMessages } from "./storage.ts";

/**
 * Options for the media groups plugin.
 */
export interface MediaGroupsOptions {
    /**
     * When `true` (default), the middleware automatically stores every
     * incoming message that has a `media_group_id` (including
     * `reply_to_message` and `pinned_message`).
     *
     * Set to `false` to disable automatic storing. In that case use
     * `ctx.mediaGroups.store(message)` to store messages manually.
     */
    autoStore?: boolean;
}

/**
 * Flavor for context that adds media group methods.
 */
export type MediaGroupsFlavor = {
    /**
     * Namespace of the `media-groups` plugin
     */
    mediaGroups: {
        /**
         * Gets all messages belonging to the current message's media group.
         * Returns `undefined` if the current message is not part of a media group.
         */
        getMediaGroup: () => Promise<Message[] | undefined>;
        /**
         * Gets the media group of the message being replied to.
         * Returns `undefined` if there is no reply or it is not part of a media group.
         */
        getMediaGroupForReply: () => Promise<Message[] | undefined>;
        /**
         * Gets the media group of the pinned message.
         * Returns `undefined` if there is no pinned message or it is not part of a media group.
         */
        getMediaGroupForPinned: () => Promise<Message[] | undefined>;
        /**
         * Manually stores a message in its media group.
         * The message must have a `media_group_id` to be stored.
         *
         * @param message The message to store
         */
        store: (message: Message) => Promise<void>;
    };
};

type MediaGroupsContext = Context & MediaGroupsFlavor;

/**
 * Creates a transformer that intercepts outgoing API responses and
 * stores returned messages containing `media_group_id`.
 *
 * Install it manually on your bot's API:
 *
 * ```typescript
 * bot.api.config.use(mediaGroupTransformer(adapter));
 * ```
 *
 * @param adapter Storage adapter for persisting media group data
 * @returns An API transformer
 */
export function mediaGroupTransformer(
    adapter: StorageAdapter<Message[]>,
    // deno-lint-ignore no-explicit-any
): Transformer<any> {
    return async (prev, method, payload, signal) => {
        const res = await prev(method, payload, signal);
        const extractor = MEDIA_GROUP_METHODS[method];
        if (res.ok && extractor) {
            await storeMessages(adapter, extractor(res.result));
        }
        return res;
    };
}

/**
 * Creates middleware that collects media group messages from incoming
 * updates and hydrates the context with methods to retrieve stored
 * media groups.
 *
 * @param adapter Storage adapter for persisting media group data (defaults to `MemorySessionStorage`)
 * @param options Plugin options
 * @returns A composer with middleware installed
 *
 * @example
 * ```typescript
 * import { Bot, Context, InputMediaBuilder } from "grammy";
 * import {
 *     type MediaGroupsFlavor,
 *     mediaGroups,
 *     mediaGroupTransformer,
 * } from "@grammyjs/media-groups";
 *
 * type MyContext = Context & MediaGroupsFlavor;
 *
 * const bot = new Bot<MyContext>("<token>");
 *
 * // Uses MemorySessionStorage by default
 * const mg = mediaGroups();
 * bot.use(mg);
 *
 * // Install transformer for outgoing API responses
 * bot.api.config.use(mediaGroupTransformer(mg.adapter));
 *
 * // Programmatic access
 * const messages = await mg.getMediaGroup("some-media-group-id");
 *
 * // In a command handler replying to a media group message
 * bot.command("album", async (ctx) => {
 *     const group = await ctx.mediaGroups.getMediaGroupForReply();
 *     if (group) {
 *         await ctx.replyWithMediaGroup(
 *             group
 *                 .map((msg) => {
 *                     const opts = {
 *                         caption: msg.caption,
 *                         caption_entities: msg.caption_entities,
 *                     };
 *                     switch (true) {
 *                         case "photo" in msg: {
 *                             const id = msg.photo?.at(-1)?.file_id;
 *                             return InputMediaBuilder.photo(id, opts);
 *                         }
 *                         case "video" in msg: {
 *                             const id = msg.video?.file_id;
 *                             return InputMediaBuilder.video(id, opts);
 *                         }
 *                         case "document" in msg: {
 *                             const id = msg.document?.file_id;
 *                             return InputMediaBuilder.document(id, opts);
 *                         }
 *                     }
 *                 })
 *                 .filter(Boolean),
 *         );
 *     }
 * });
 *
 * // Access media group of current message via namespace
 * bot.on("message", async (ctx) => {
 *     const group = await ctx.mediaGroups.getMediaGroup();
 *     if (group) console.log(`Album has ${group.length} items`);
 * });
 * ```
 *
 * @example Manual mode — disable automatic storing and use `ctx.mediaGroups.store()` instead:
 * ```typescript
 * const mg = mediaGroups(undefined, { autoStore: false });
 * bot.use(mg);
 *
 * bot.on("message", async (ctx) => {
 *     if (ctx.msg.media_group_id) {
 *         await ctx.mediaGroups.store(ctx.msg);
 *     }
 * });
 * ```
 */
export function mediaGroups(
    adapter: StorageAdapter<Message[]> = new MemorySessionStorage<Message[]>(),
    options: MediaGroupsOptions = {},
): Composer<MediaGroupsContext> & {
    /** The storage adapter used by the plugin. */
    adapter: StorageAdapter<Message[]>;
    /**
     * Fetches a media group by its ID from storage.
     *
     * @param mediaGroupId The media group ID to look up
     * @returns Array of messages in the media group, or `undefined` if not found
     */
    getMediaGroup: (mediaGroupId: string) => Promise<Message[] | undefined>;
} {
    const { autoStore = true } = options;
    const composer = new Composer<MediaGroupsContext>();

    const getMediaGroup = async (
        mediaGroupId: string,
    ): Promise<Message[] | undefined> => {
        return await adapter.read(mediaGroupId);
    };

    const store = (message: Message) => storeMessages(adapter, [message]);

    // Hydrate context and store incoming messages
    composer.use(async (ctx, next) => {
        // Resolve a media_group_id from a nested message
        const getGroupFor = (nested: Message | undefined) => {
            const id = nested?.media_group_id;
            return id ? getMediaGroup(id) : Promise.resolve(undefined);
        };

        ctx.mediaGroups = {
            getMediaGroup: () => getGroupFor(ctx.msg),
            getMediaGroupForReply: () =>
                getGroupFor(ctx.msg?.reply_to_message),
            getMediaGroupForPinned: () =>
                getGroupFor(ctx.msg?.pinned_message),
            store,
        };

        if (autoStore) {
            const msg = ctx.msg;
            const replyMsg = msg?.reply_to_message;
            const pinnedMsg = msg?.pinned_message;

            // Collect messages to store in batch
            const toStore: Message[] = [];
            if (msg?.media_group_id) toStore.push(msg);
            if (replyMsg?.media_group_id) toStore.push(replyMsg);
            if (pinnedMsg?.media_group_id) toStore.push(pinnedMsg);

            if (toStore.length > 0) {
                await storeMessages(adapter, toStore);
            }
        }

        return next();
    });

    // Attach standalone helpers
    const result = composer as Composer<MediaGroupsContext> & {
        adapter: StorageAdapter<Message[]>;
        getMediaGroup: (mediaGroupId: string) => Promise<Message[] | undefined>;
    };
    result.adapter = adapter;
    result.getMediaGroup = getMediaGroup;

    return result;
}

export default mediaGroups;
