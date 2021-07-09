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
     * @return platform of the chat client (ex: twitch)
     */
    public abstract getPlatform(): PLATFORM;

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