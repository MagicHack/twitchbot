class User {
    public readonly rawName: string;
    public readonly displayName: string;
    public readonly isMod: boolean;
    public readonly id: string;
    public readonly platform: PLATFORM;
    constructor(name: string, id: string, platform: PLATFORM, isMod = false, displayName= name) {
        this.rawName = name;
        this.displayName = displayName;
        this.id = id;
        this.isMod = isMod;
        this.platform = platform;
    }
}