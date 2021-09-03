class Message {
    public readonly message: string;
    public readonly user: User;
    public readonly platform: PLATFORM;
    public readonly channel: string;
    public readonly id: string;
    constructor(message: string, user: User, channel: string, id: string, platform : PLATFORM) {
        this.message = message;
        this.user = user;
        this.platform = platform;
        this.channel = channel;
        this.id = id;
    }

    /**
     * Returns the message without extra spaces.
     */
    public getCleanMessage() {
        // TODO, remove chatterino invisible char?
        return this.message.trim().replace(/\s+/g, ' ');
    }
}