class TwitchUser extends User {
    public readonly isBroadcaster: boolean;
    constructor(name: string, id: string, platform: PLATFORM, isMod = false, displayName= name, isBroadCaster = false) {
        super(name, id, platform, isMod, displayName);
        this.isBroadcaster = isBroadCaster;
    }
}