import {ChatClient} from "./chatClient";
import {ChatClient as DankClient, IRCMessage, me, PrivmsgMessage, WhisperMessage} from "dank-twitch-irc";

class TwitchClient extends ChatClient {
    private readonly client: DankClient;
    private readonly isAnon: boolean;

    constructor(username?: string, token?: string) {
        super();
        // TODO, login/anon and stuff
        if(!username || !token) {
            this.isAnon = true;
            this.client = new DankClient();
        } else {
            this.isAnon = false;
            this.client = new DankClient({username, password : token});
        }

        // Register events we want to pass trough
        this.client.on('PRIVMSG', (msg) => {
            this.emitMessage(this.createMessage(msg));
        });

        this.client.on('WHISPER', (msg) => {
            this.emitPrivateMessage(this.createMessage(msg));
        });
    }

    public getPlatform(): PLATFORM {
        return PLATFORM.twitch;
    }

    public async sendMessage(message: string, channel: string): Promise<boolean> {
        if(this.isAnon) {
            return false;
        }
        await this.client.say(channel, message);
        return true;
    }

    public async sendPrivateMessage(message: string, user: string): Promise<boolean> {
        if(this.isAnon) {
            return false;
        }
        await this.client.whisper(user, message);
        return true;
    }

    private createUser(message: PrivmsgMessage|WhisperMessage): User {
        let isMod = false;
        if(TwitchClient.isPrivateMsg(message)) {
            isMod = message.isMod;
        }
        return new User(message.senderUsername, message.senderUserID, this.getPlatform(), isMod,
            message.displayName);
    }

    private createMessage(message: PrivmsgMessage|WhisperMessage): Message {
        let channelName: string;
        if(TwitchClient.isPrivateMsg(message)) {
            channelName = message.channelName;
        } else {
            channelName = message.senderUsername;
        }
        return new Message(message.messageText, this.createUser(message), channelName, this.getPlatform());
    }

    private static isPrivateMsg(message: IRCMessage) : message is PrivmsgMessage {
        return (message as PrivmsgMessage).channelName !== undefined;
    }

    private static isWhishper(message: IRCMessage) : message is WhisperMessage {
        return (message as WhisperMessage).recipientUsername !== undefined;
    }
}