/**
 * Main file, gets credentials from config and starts the bot
 */
import 'dotenv/config';
import winston from "winston";
import {TwitchClient} from "./twitch/TwitchClient";
import {Bot} from "./Bot"
import Utils from "./Utils";

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { service: 'MagicBot' },
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ],
});
logger.info("MagicBot started");

const TWITCH_USERNAME = Utils.getEnvValue('TWITCH_USERNAME');
const TWITCH_TOKEN = Utils.getEnvValue('TWITCH_TOKEN');

const twitchClient = new TwitchClient(TWITCH_USERNAME, TWITCH_TOKEN);
const anonTwitchClient = new TwitchClient();

const bot = new Bot(twitchClient, anonTwitchClient);
bot.run();