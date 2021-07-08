import humanizeDuration from 'humanize-duration';
import {PrivmsgMessage} from "dank-twitch-irc";
class Ping extends Command {
    constructor() {
        super(['ping', 'pong', 'pang']);
    }
    execute(message: PrivmsgMessage): string {
        return "";
    }
    private formatMs(timeMs : number) {
        return humanizeDuration(timeMs, {round : true});
    }
}