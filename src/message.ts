class Message {
    public readonly message: string;
    public readonly user: User;
    public readonly platform: PLATFORM;
    public readonly channel: string;
    constructor(message: string, user: User, channel: string, platform = user.platform) {
        this.message = message;
        this.user = user;
        this.platform = platform;
        this.channel = channel;
    }

    /**
     * Returns the message without extra spaces.
     */
    public getCleanMessage() {
        // TODO, remove chatterino invisible char?
        return this.message.trim().replace(/\s+/g, ' ');
    }
}