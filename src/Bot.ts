/**
 * Main class of the bot
 */
import {TwitchClient} from "./twitch/TwitchClient";

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
    }

    private splitMessage(message : Message): string[] {
        // Split on spaces and remove empty params
        return message.getCleanMessage().split(' ').filter(val => val.length !== 0);
    }
}