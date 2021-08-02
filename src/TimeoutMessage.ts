class TimeoutMessage extends Message {
    constructor(user: User, channel: string, duration: number, platform : PLATFORM) {
        const message = `${user.displayName} has been timed out for ${duration}s from ${channel}`;
        super(message, user, channel, "", platform);
    }
}