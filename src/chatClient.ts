import EventEmitter from 'eventemitter3';

/**
 * Generic chat client
 */
export abstract class ChatClient extends EventEmitter<ChatClientEvent> {
    /**
     * Sends a message in a specified channel
     */
    abstract sendMessage(message: string, channel: string): Promise<boolean>;

    /**
     * Send a private message to a user (whisper/dm)
     */
    public abstract sendPrivateMessage(message: string, user: string): Promise<boolean>;

    /**
     * Ban a user in a channel, optional reason for the ban
     */
    public abstract banUser(user: User, channel: string, reason?: string): Promise<boolean>;

    /**
     * Delete a message by it's id in a channel
     */
    public abstract deleteMessage(messageId: string, channel: string): Promise<boolean>;

    /**
     * @return platform of the chat client (ex: twitch)
     */
    public abstract getPlatform(): PLATFORM;

    /**
     * Check if the client is a moderator in a channel
     */
    public abstract isMod(channel: string): boolean;

    protected emitMessage(message: Message): void {
        this.emit('message', message);
    }

    protected emitPrivateMessage(message: Message): void {
        this.emit('privateMessage', message);
    }

    protected emitSystemMessage(message: Message): void {
        this.emit('systemMessage', message);
    }

    protected emitError(error: Error): void {
        this.emit('error', error);
    }
}