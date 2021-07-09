/**
 * Platform an object comes from
 */
enum PLATFORM {
    twitch = "twitch",
    discord = "discord"
}

interface ChatClientEvent {
    message : Message;
    privateMessage : Message;
    systemMessage : Message;
    error : Error;
}