import {ChatClient} from "../ChatClient";
import {
    ChatClient as DankClient, ClearchatMessage,
    PrivmsgMessage,
    WhisperMessage
} from "dank-twitch-irc";

export class TwitchClient extends ChatClient {
    private readonly username: string;
    private readonly client: DankClient;
    private readonly isAnon: boolean;

    constructor(username?: string, token?: string) {
        super();
        if(!username || !token) {
            this.isAnon = true;
            this.client = new DankClient();
            this.username = "";
        } else {
            this.isAnon = false;
            this.client = new DankClient({username, password : token});
            this.username = username;
        }

        // Register events we want to pass trough
        this.client.on('PRIVMSG', (msg) => {
            this.emitMessage(this.createMessage(msg));
        });

        this.client.on('WHISPER', (msg) => {
            this.emitPrivateMessage(this.createMessage(msg));
        });

        this.client.on('CLEARCHAT', (msg) => {
            const message = this.createMessageClearChat(msg);
            if(message instanceof TimeoutMessage) {
                this.emitTimeoutMessage(message);
            } else {
                this.emitBanMessage(message);
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
                return isMod || this.isBroadcaster(channel);
            }
        }
        return this.isBroadcaster(channel);
    }

    public isBroadcaster(channel: string): boolean {
        if(!this.isAnon) {
            const isBroadcaster = this.client.userStateTracker?.getChannelState(channel)?.badgeInfo.hasBroadcaster;
            if(isBroadcaster !== undefined) {
                return isBroadcaster;
            }
        }
        return false;
    }

    private emitTimeoutMessage(message: TimeoutMessage): void {
        this.emit('timeout', message);
    }

    private emitBanMessage(message: BanMessage): void {
        this.emit('ban', message);
    }

    private createUserClearChat(message: ClearchatMessage): User {
        const isMod = false;
        if(message.isTimeout() || message.isPermaban()) {
            return new User(message.targetUsername, "", this.getPlatform(), isMod, message.channelName);
        }
        throw new Error("Unexpected ClearchatMessage");
    }

    private createMessageClearChat(message: ClearchatMessage): TimeoutMessage|BanMessage {
        if(message.isTimeout()) {
            return new TimeoutMessage(this.createUserClearChat(message), message.channelName, message.banDuration,
                this.getPlatform());
        } else if (message.isPermaban()) {
            return new BanMessage(this.createUserClearChat(message), message.channelName, this.getPlatform());
        }
        throw new Error("Unexpected ClearchatMessage");
    }

    private createUser(message: PrivmsgMessage|WhisperMessage): TwitchUser {
        let isMod = false;
        let isBroadcaster = false;
        if(message instanceof PrivmsgMessage) {
            isBroadcaster = message.badges.hasBroadcaster;
            isMod = message.isMod || isBroadcaster;
        }

        return new TwitchUser(message.senderUsername, message.senderUserID, this.getPlatform(), isMod,
            message.displayName, isBroadcaster);
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