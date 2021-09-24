import {Command} from "./command";
import humanizeDuration from "humanize-duration";
import {config} from "../Config";

class Ping extends Command {
    constructor() {
        super(['ping', 'pong']);
    }

    execute(params: string[], message: Message): string {
        let result = `@${message.user.displayName}, 👋 Okayeg running for ${humanizeDuration(Math.round(process.uptime()) * 1000)}`;
        if(config.isDev()) {
            result += " (dev version)";
        }
        return result;
    }
}