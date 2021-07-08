/**
 * TwitchBot Class
 */
import { Logger } from "winston";
import { ChatClient } from 'dank-twitch-irc';

export { TwitchBot };

class TwitchBot {
    // Default client with interaction
    private readonly client : ChatClient;
    // For channels where joining isn't required or wanted
    private readonly anonClient : ChatClient;
    private readonly logger :Logger;
    constructor(username :string, token :string, logger :Logger) {
        this.logger = logger;
        logger.info("Created anonymous TwitchClient");
        this.anonClient = new ChatClient();
        this.client = new ChatClient({
            username,
            password : token
        });
        logger.info("Creating authenticated TwitchClient with username : " + username);
        this.client = new ChatClient();
    }

    private async test() {
        return "test";
    }

    private joinChannel(channel :string) {
        // TODO : add to config
        this.logger.info("Joining channel " + channel);
        this.client.join(channel);
    }
}