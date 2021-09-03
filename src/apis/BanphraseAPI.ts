import {Logger} from "winston";

abstract class BanphraseAPI {
    private readonly url: string;
    protected constructor(url: string) {
        this.url = url;
    }
    /**
     * Returns if the message is banned
     */
    public abstract isBanned(message : Message): boolean;
}