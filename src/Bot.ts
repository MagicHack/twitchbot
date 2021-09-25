/**
 * Main class of the bot
 */
import {TwitchClient} from "./twitch/TwitchClient";
import Utils from "./Utils";
import {me} from "dank-twitch-irc";
import {config} from "./Config";

export class Bot {
    private client: TwitchClient;
    private anonClient: TwitchClient;
    private logger = console;
    constructor(client: TwitchClient, anonClient: TwitchClient) {
        this.client = client;
        this.anonClient = anonClient;
    }
    public run(): void {
        this.client.on("message", (message) => {this.handleMessage(message)});
        this.anonClient.on("message", (message) => {this.handleMessage(message)});
    }

    private handleAnonMessage(message : Message) {
        this.logger.info("#" + message.channel + " :" + message.user.rawName + " " + message.message );
    }

    private handleMessage(message : Message) {
        this.logger.info("#" + message.channel + " :" + message.user.rawName + " " + message.message );
        let params = this.splitMessage(message);
    }

    private splitMessage(message : Message): string[] {
        // Split on spaces and remove empty params
        return Utils.splitNoEmpty(message.getCleanMessage(), ' ');
    }

    private startWithPrefix(message: Message): boolean {
        return message.getCleanMessage().startsWith(config.getPrefixChannel(message.channel));
    }
}