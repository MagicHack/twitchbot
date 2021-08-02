/**
 * Platform an object comes from
 */
enum PLATFORM {
    twitch = "twitch",
    discord = "discord"
}

/**
 * Events shared between most chat clients
 */
interface BaseChatClientEvent {
    message : Message;
    privateMessage : Message;
    systemMessage : Message;
    error : Error;
}

/**
 * Events specific to twitch
 */
interface TwitchClientEvent {
    // TODO add subs/resubs raid etc...
    timeout : TimeoutMessage;
    ban : BanMessage;
}

type ChatClientEvent = BaseChatClientEvent & TwitchClientEvent;