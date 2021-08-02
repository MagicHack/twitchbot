import {ChatClient} from "./chatClient";
import {
    ChatClient as DankClient, ClearchatMessage,
    PrivmsgMessage,
    WhisperMessage
} from "dank-twitch-irc";

class TwitchClient extends ChatClient {
    private readonly client: DankClient;
    private readonly isAnon: boolean;

    constructor(username?: string, token?: string) {
        super();
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

        this.client.on('CLEARCHAT', (msg) => {
            if(msg.isTimeout()) {
                // TODO
            } else if (msg.isPermaban()) {
                // TODO
            }
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


    public async banUser(user: User, channel: string, reason?: string): Promise<boolean> {
        if(this.isMod(channel)) {
            await this.client.ban(channel, user.rawName, reason);
            return true;
        }
        return false;
    }

    public async deleteMessage(messageId:string, channel:string): Promise<boolean> {
        if(this.isMod(channel)) {
            await this.client.privmsg(channel,`/delete ${messageId}`);
            return true;
        }
        return false;
    }

    public isMod(channel: string): boolean {
        if(!this.isAnon) {
            const isMod = this.client.userStateTracker?.getChannelState(channel)?.isMod;
            if (isMod !== undefined) {
                return isMod;
            }
        }
        return false;
    }

    // TODO : emit a TwitchClientEvent? or just shove everything in ChatClientEvents eShrug
    private emitTimeoutMessage(message: TimeoutMessage): void {
        this.emit('systemMessage', message);
    }

    private emitBanMessage(message: BanMessage): void {
        this.emit('systemMessage', message);
    }

    private createUser(message: PrivmsgMessage|WhisperMessage): User {
        let isMod = false;
        if(message instanceof PrivmsgMessage) {
            isMod = message.isMod;
        }
        return new User(message.senderUsername, message.senderUserID, this.getPlatform(), isMod,
            message.displayName);
    }

    private createMessage(message: PrivmsgMessage|WhisperMessage): Message {
        let channelName: string;
        if(message instanceof PrivmsgMessage) {
            channelName = message.channelName;
        } else {
            channelName = message.senderUsername;
        }
        return new Message(message.messageText, this.createUser(message), channelName,  message.messageID,
            this.getPlatform());
    }
}