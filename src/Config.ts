/**
 * Stores the configuration for everything inside the bot
 */
import {Command} from "./commands/command";
import Utils from "./Utils";

class Config {
    private readonly isDevEnv: boolean;
    private prefix: string;
    constructor() {
        try {
            this.isDevEnv = Utils.getEnvValue("dev") === "true";
        } catch (e) {
            this.isDevEnv = false;
        }
        this.prefix = "&";
    }
    // Check if a command can run in a specific channel
    public commandCanRunChannel(command: Command, channel: string): boolean {
        // TODO
        return false;
    }
    // Check if a command can run globally
    public commandCanRun(command: Command): boolean {
        // TODO
        return false;
    }

    public setPrefixGlobal(prefix: string) {
        this.prefix = prefix;
    }

    public setPrefixChannel(prefix: string) {
        // TODO
    }

    public isDev(): boolean {
        return this.isDevEnv;
    }

    public getPrefixChannel() {
        // TODO, fetch in file channel
        // Double the prefix in dev mode
        return this.getPrefixGlobal();
    }

    public getPrefixGlobal() {
        // Double the prefix in dev mode
        if(this.isDevEnv) {
            return this.prefix + this.prefix;
        }
        return this.prefix;
    }
}

export const config = new Config();