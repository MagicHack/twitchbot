import 'dotenv/config';
import winston from "winston";

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

const TWITCH_USERNAME = getEnvValue('TWITCH_USERNAME');
const TWITCH_TOKEN = getEnvValue('TWITCH_TOKEN');

function getEnvValue(key :string) :string {
    const result = process.env[key];
    if(result === undefined) {
        const message = `Error reading ${key} from .env file`;
        logger.error(message);
        throw message;
    }
    return result;
}