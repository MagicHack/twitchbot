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
interface ChatClientEvent {
    message : Message;
    privateMessage : Message;
    systemMessage : Message;
    error : Error;
}

/**
 * Events specific to twitch
 */
interface TwitchClientEvent extends ChatClientEvent {
    // TODO add subs/resubs raid etc...
    timeout : TimeoutMessage;
    ban : BanMessage;
}