class BanMessage extends Message {
    constructor(user: User, channel: string, platform : PLATFORM) {
        const message = `${user.displayName} has been permanently banned from ${channel}`;
        super(message, user, channel, "", platform);
    }
}