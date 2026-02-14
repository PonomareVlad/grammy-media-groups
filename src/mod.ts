import {
    Composer,
    Context,
    type StorageAdapter,
    type Transformer,
} from "./deps.deno.ts";
import type { Message } from "./deps.deno.ts";

/**
 * Flavor for context that adds media group methods.
 */
export type MediaGroupsFlavor = {
    /**
     * Namespace for the `media-groups` plugin.
     */
    mediaGroups: {
        /**
         * Gets all messages belonging to the current message's media group.
         * Returns `undefined` if the current message is not part of a media group.
         */
        getMediaGroup: () => Promise<Message[] | undefined>;
    };
};

/**
 * Extended message type with an optional method to fetch its media group.
 */
export type MediaGroupMessage = Message & {
    /**
     * Gets all messages belonging to this message's media group.
     * Returns `undefined` if the message is not part of a media group.
     */
    getMediaGroup?: () => Promise<Message[] | undefined>;
};

type MediaGroupsContext = Context & MediaGroupsFlavor;

/**
 * API methods whose responses may contain messages with `media_group_id`.
 */
const MEDIA_GROUP_METHODS = [
    "sendPhoto",
    "sendVideo",
    "sendAnimation",
    "sendAudio",
    "sendDocument",
    "sendMediaGroup",
    "copyMessages",
    "forwardMessage",
    "forwardMessages",
] as const;

/**
 * Stores a message into the media group storage, appending it to the
 * existing array or creating a new entry.
 */
async function storeMessage(
    adapter: StorageAdapter<Message[]>,
    message: Message,
): Promise<void> {
    const mediaGroupId = message.media_group_id;
    if (!mediaGroupId) return;

    const existing = (await adapter.read(mediaGroupId)) ?? [];

    if (existing.some((m) => m.message_id === message.message_id && m.chat.id === message.chat.id)) {
        return;
    }

    existing.push(message);
    await adapter.write(mediaGroupId, existing);
}

/**
 * Extracts messages from an API response result.
 */
function extractMessages(
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
                item != null && typeof item === "object" && "message_id" in item,
        );
    }

    if (result != null && typeof result === "object" && "message_id" in result) {
        return [result as Message];
    }

    return [];
}

/**
 * Creates a function to fetch a media group by its ID from storage.
 */
function createGetMediaGroup(
    adapter: StorageAdapter<Message[]>,
): (mediaGroupId: string) => Promise<Message[] | undefined> {
    return async (mediaGroupId: string) => {
        return await adapter.read(mediaGroupId);
    };
}

/**
 * Hydrates a message object with a `getMediaGroup` method.
 */
function hydrateMessage(
    message: Message,
    adapter: StorageAdapter<Message[]>,
): MediaGroupMessage {
    const hydrated = message as MediaGroupMessage;
    if (message.media_group_id) {
        const mediaGroupId = message.media_group_id;
        hydrated.getMediaGroup = async () => await adapter.read(mediaGroupId);
    }
    return hydrated;
}

/**
 * Creates middleware and transformer that collect media group messages
 * from incoming updates and outgoing API responses, and hydrate the
 * context with methods to retrieve stored media groups.
 *
 * @param adapter Storage adapter for persisting media group data
 * @returns A composer with middleware installed
 *
 * @example
 * ```typescript
 * import { Bot, Context, MemorySessionStorage } from "grammy";
 * import { type MediaGroupsFlavor, mediaGroups } from "@grammyjs/media-groups";
 *
 * type MyContext = Context & MediaGroupsFlavor;
 *
 * const adapter = new MemorySessionStorage<Message[]>();
 * const bot = new Bot<MyContext>("<token>");
 *
 * const mg = mediaGroups(adapter);
 * bot.use(mg);
 *
 * // Programmatic access
 * const messages = await mg.getMediaGroup("some-media-group-id");
 *
 * // In a command handler replying to a media group message
 * bot.command("forward", async (ctx) => {
 *   const group = await ctx.mediaGroups.getMediaGroup();
 *   if (group) {
 *     // forward all messages in the group
 *   }
 * });
 * ```
 */
export function mediaGroups(
    adapter: StorageAdapter<Message[]>,
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
    const getMediaGroup = createGetMediaGroup(adapter);

    // Install transformer to capture outgoing API responses
    let transformerInstalled = false;
    composer.use((ctx, next) => {
        if (!transformerInstalled) {
            ctx.api.config.use(mediaGroupTransformer);
            transformerInstalled = true;
        }
        return next();
    });

    // deno-lint-ignore no-explicit-any
    const mediaGroupTransformer: Transformer<any> = async (
        prev,
        method,
        payload,
        signal,
    ) => {
        const res = await prev(method, payload, signal);
        if (
            res.ok &&
            MEDIA_GROUP_METHODS.includes(
                method as (typeof MEDIA_GROUP_METHODS)[number],
            )
        ) {
            const messages = extractMessages(method, res.result);
            for (const message of messages) {
                await storeMessage(adapter, message);
            }
        }
        return res;
    };

    // Hydrate context with mediaGroups namespace
    composer.use(async (ctx, next) => {
        ctx.mediaGroups = {
            getMediaGroup: async () => {
                const msg = ctx.msg ?? ctx.message;
                const mediaGroupId = msg?.media_group_id;
                if (!mediaGroupId) return undefined;
                return await getMediaGroup(mediaGroupId);
            },
        };

        // Store message from incoming update if it has media_group_id
        const msg = ctx.msg ?? ctx.message;
        if (msg?.media_group_id) {
            await storeMessage(adapter, msg);
        }

        // Hydrate reply_to_message if present
        if (msg) {
            const replyToMessage = (msg as Message.CommonMessage)
                .reply_to_message;
            if (replyToMessage) {
                hydrateMessage(replyToMessage, adapter);

                // Also store the reply_to_message if it has media_group_id
                if (replyToMessage.media_group_id) {
                    await storeMessage(adapter, replyToMessage);
                }
            }
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
