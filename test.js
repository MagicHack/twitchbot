import fetch from 'node-fetch';
import sfetch from 'sync-fetch';
import tmi from 'tmi.js';
import fs from 'fs';
import humanizeDuration from 'humanize-duration';
import Push from 'pushover-notifications';
import momentTZ from 'moment-timezone';
import moment from 'moment';
import util from 'util';
import childProcess from 'child_process';
import {isLive, getStream, usernameToId, uidToUsername} from "./twitchapi.js";
import prettyBytes from 'pretty-bytes';
import { existsSync } from 'fs';
import { transliterate as transliterate, slugify } from 'transliteration';

const exec = util.promisify(childProcess.exec);

// Number of message that can be sent every 30 seconds
const rateLimitMessages = 20;
const rateLimitMessagesMod = 100;

// Minimum time in between messages to no go over rate limit
const rateLimitDelay = 30 / rateLimitMessages;
const rateLimitDelayMod = 30 / rateLimitMessagesMod;

// Time between chatter fetch
const delayChatterRefresh = 120;

// Prefix for commands, ex: &ping
let prefix = '&';

// name of file storing raid users
const RAID_FILE = 'raid.json';
let raidData = [];
try {
    raidData = readDataJson(RAID_FILE);
    console.log("Successfully read ping file");
} catch (e) {
    console.log(e);
}

const RAID_HISTORY_FILE = "raidHistory.json";
let raidHistory = [];
try {
    raidHistory = readDataJson(RAID_HISTORY_FILE);
    console.log("Successfully read history file");
} catch (e) {
    console.log(e);
}
let lastRaid = null;
if (raidHistory.length > 0) {
    lastRaid = raidHistory[raidHistory.length - 1];
}
const IGNORE_FILE = 'ignore.json';
let peopleToIgnore = [];
try {
    peopleToIgnore = readDataJson(IGNORE_FILE);
    console.log("Successfully read ignore file");
} catch (e) {
    console.log(e);
}

const PING_CHANNELS_FILE = 'pingChannels.json';
let raidPingChannels = [];
try {
    raidPingChannels = readDataJson(PING_CHANNELS_FILE);
    console.log("Successfully read ping channels file");
} catch (e) {
    console.log(e);
}

// channel where we can mod/vip spam
let modSpamChannels = ['#pepto__bismol', "#sunephef", "#hackmagic", "#lzackhdl"];

// Weird char in twitch messages
const blankchar = '󠀀';

// Auto random timeouts TrollDespair
const TIMEOUTS_FILE = "timeouts.json";
let timeoutList = [];
try {
    timeoutList = readDataJson(TIMEOUTS_FILE);
    console.log("read timeout file");
} catch (e) {
    console.log(e);
}

const configFilePath = 'config.json';
const channelsFilePath = 'channels.json';
let channels = [];

let username = '';
let password = '';
let weatherApiKey = '';


let pushoverToken = '';
let pushoverUser = '';
let ignoreUsersPing = [];
const IGNORE_PING_FILE = 'ignorePings.json';

try {
    ignoreUsersPing = readDataJson(IGNORE_PING_FILE);
    console.log("Raid ingore pings file");
} catch (e) {
    console.log(e);
}

try {
    let configData = readDataJson(configFilePath);
    channels = readDataJson(channelsFilePath);
    username = configData["username"];
    password = configData["token"];
    weatherApiKey = configData["weatherKey"];
    pushoverToken = configData["ptoken"];
    pushoverUser = configData["puser"];
} catch (err) {
    console.error(typeof err + " " + err.message);
    console.log("Error, could not read config/channels file. Quitting");
    process.exit(1);
}


const donkRepliesPriority = ['g0ldfishbot', 'doo_dul', 'ron__bot']
const trusted = ['hackmagic']

const pushover = new Push({user: pushoverUser, token: pushoverToken});

const client = new tmi.Client({
    options: {debug: false, messagesLogLevel: "info"},
    connection: {
        reconnect: true,
        secure: true
    },
    identity: {
        username: username,
        password: password
    },
    channels: channels
});

let channelsChatters = {};
let chattersRoles = {};

let uniqueChatters = [];
let massPingNum = 3;

let lastMessageTimeStampMs = 0;
let lastSentMessage = '';
let messageQueue = [];
let messagePriorityQueue = [];

// refresh all chatters peridically
setInterval(getAllChatters, delayChatterRefresh * 1000);

client.connect().catch(console.error);

let bans = [];
try {
    bans = readDataJson("bans.json");
} catch (e) {
    console.log(e);
}
setInterval(saveBans, 10000);

let lastBanCount = bans.length;
let lastBanSaveTs = Date.now();

function saveBans() {
    if (bans.length > lastBanCount) {
        if (Date.now() - lastBanSaveTs > 30 * 1000) {
            lastBanCount = bans.length;
            lastBanSaveTs = Date.now();
            saveDataJson(bans, "bans.json");
        }
    }
}

let tmiLatency = NaN;

client.on("pong", (latency) => {
    // latency given in seconds???
    tmiLatency = Math.round(latency * 1000);
});

let joinNotifs = false;
// join messages
client.on("join", (channel, username, self) => {
    if(self || !joinNotifs) return;
    // Do your stuff.
    if(channel === "#hackmagic") {
        sendMessageRetry(channel, `${username} joined the channel :)`);
    }
});

// leave
client.on("part", (channel, username, self) => {
    if(self || !joinNotifs) return;
    // Do your stuff.
    if(channel === "#hackmagic") {
        sendMessageRetry(channel, `${username} left the channel :(`);
    }
});

client.on("ban", (channel, username) => {
    // Log all bans
    let user = {channel: channel, username: username, ts: Date.now()};
    bans.push(user);
});

client.on("connected", () => {
    client.say("#" + username, "connected " + (new Date()).toISOString());
    client.raw("CAP REQ :twitch.tv/commands twitch.tv/tags twitch.tv/membership");
    sentMessagesTS.push(Date.now());
});
let lastSingleReply = Date.now();
let lastNewCommandReply = Date.now();
let lastDonkReply = Date.now();
let donkCoolDown = 5;
let spamReplyCoolDown = 30;
let lastAnnouceA = Date.now();

client.on('message', (channel, tags, message, self) => {
    if (self) return;
    // ignore whispers for now
    if (tags['message-type'] === 'whisper') {
        console.log("ignored whisper");
        return;
    }

    // remove chatterino char and extra spaces
    let cleanMessage = message.replace(blankchar, '').trim();

    phoneNotifications(channel, cleanMessage, tags);

    if (peopleToIgnore.includes(tags.username.toLowerCase())) {
        return;
    }

    // Anti weeb tech
    if (channel === "#pepto__bismol") {
        timeouts(channel, cleanMessage, tags.username);
    }

    if (channel === "#pajlada") {
        if (tags["user-id"] === "82008718" && tags["message-type"] === "action" && cleanMessage === "pajaS 🚨 ALERT") {
            sendMessageRetry(channel, "/me DANKNAD 🚨 ALERTE");
            console.log("pajaS 🚨 ALERT");
        } else if(tags["user-id"] === "82008718" && cleanMessage === "/announce a") {
            lastAnnouceA = Date.now();
        }
        // mldsbt (list)  https://gist.github.com/treuks/fead3312bf0d0284c0dd8dff4f51d30b  less then 60s since pajbot annouce
        if(tags["user-id"] === "743355647" && cleanMessage.startsWith("/announce") && Date.now() - lastAnnouceA < 60 * 1000) {
            console.log("y");
            let possibilities = ["z", "ⓩ", "𝔃", "𝕫", "🆉", "𝐳", "peepoZ", ":-z", ":Z", "FrankerZ", "ZULUL"];
            sendMessageRetry(channel, ` /announce ${possibilities[Math.floor(Math.random() * possibilities.length)]} 💤`);
            // reset timer to not reply twice
            lastAnnouceA = 0;
        }
    }

    checkIfRaid(tags, cleanMessage).then();
    moderation(channel, tags, cleanMessage);

    asd(channel, cleanMessage);

    if (isCommand(cleanMessage.toLowerCase(), 'ping')) {
        let timeSeconds = process.uptime();
        sendMessage(channel, `@${tags.username}, 👋 Okayeg running for ${prettySeconds(timeSeconds)}, latency to tmi: ${tmiLatency}ms`);
    }
    if (isCommand(cleanMessage.toLowerCase(), 'code')) {
        sendMessage(channel, `@${tags.username}, lidl code is here https://github.com/MagicHack/twitchbot`);
    }
    if (isCommand(cleanMessage.toLowerCase(), 'tmi')) {
        sendMessage(channel, `@${tags.username}, tmijs docs : https://github.com/tmijs/docs/tree/gh-pages/_posts/v1.4.2`);
    }
    const singleCharReply = ['!', prefix];
    if (singleCharReply.includes(cleanMessage)) {
        if(Date.now() - lastSingleReply > spamReplyCoolDown * 1000) {
            lastSingleReply = Date.now();
            if(channel === "#pajlada" && cleanMessage === "!") {
                client.raw(`@client-nonce=xd;reply-parent-msg-id=${tags["id"]} PRIVMSG ${channel} :!!`);
                sentMessagesTS.push(Date.now());
            } else {
                sendMessage(channel, cleanMessage);
            }
        }
    }

    if (tags.username !== client.getUsername()) {
        let channelsNoPriority = ['#pepto__bismol'];
        let donkUsername = '';
        if (!channelsNoPriority.includes(channel)) {
            for (let donk of donkRepliesPriority) {
                if (typeof channelsChatters[channel] !== 'undefined') {
                    if (channelsChatters[channel].includes(donk)) {
                        donkUsername = donk;
                        break;
                    }
                } else {
                    console.log("chatter list not present yet");
                }
            }
        }

        if(Date.now() - lastDonkReply > donkCoolDown * 1000) {
            const donkCombos = [["FeelsDonkMan", "TeaTimeU"], ["FeelsDonkMan", "TeaTime"], ["FeelsDonkMan", "bigTeaTime"],
                ["WIDEGIGADONK", "TeaTime"], ["WIDEGIGADONK", "bigTeaTime"], ["FeelsDonkMan", "MiniTeaTime"],
                ["Donki", "TeaTimeU"], ["Donki", "TeaTime"], ["Donki", "bigTeaTime"]];

            if (donkUsername === '' || tags.username === donkUsername) {
                for(let donk of donkCombos) {
                    const donk1 = `${donk[0]} ${donk[1]}`;
                    const donk2 = `${donk[1]} ${donk[0]}`;

                    if(cleanMessage === donk1) {
                        sendMessage(channel, donk2);
                        lastDonkReply = Date.now();
                    } else if(cleanMessage === donk2) {
                        sendMessage(channel, donk1);
                        lastDonkReply = Date.now();
                    }
                }
            }
        }

        const newCommand = 'I made a new command HeyGuys';
        if (cleanMessage.startsWith(newCommand)) {
            if(Date.now() - lastNewCommandReply > spamReplyCoolDown * 1000) {
                lastNewCommandReply = Date.now();
                sendMessage(channel, newCommand);
            }
        }
        let sameRepliesChannel = ['#hackmagic', '#pepto__bismol'];
        let sameReplies = ['DinkDonk', 'YEAHBUTBTTV', 'TrollDespair', 'MODS', 'monkaE', 'POGGERS', 'VeryPog',
            'MegaLUL FBBlock', 'hackerCD', ':)'];
        if (sameRepliesChannel.includes(channel)) {
            for (let reply of sameReplies) {
                if (cleanMessage.startsWith(reply)) {
                    sendMessage(channel, reply);
                    break;
                }
            }
        }

        if (trusted.includes(tags.username) && isCommand(cleanMessage.toLowerCase(), 'say')) {
            sendMessage(channel, cleanMessage.substring(5));
        }
        if (isCommand(cleanMessage.toLowerCase(), 'players')) {
            let params = cleanMessage.split(' ').filter(x => x.length !== 0);
            let game;
            if (params[0] === prefix) {
                console.log("splice");
                params.splice(0, 2);
            } else {
                params.shift();
            }
            game = params.join(" ");
            if (game.length > 0) {
                getPlayers(game, trusted.includes(tags.username)).then((response) => {
                    sendMessageRetry(channel, response);
                })
            }
        } else if(isCommand(cleanMessage.toLowerCase(), "logssize") || isCommand(cleanMessage.toLowerCase(), "logsize")) {
            let params = splitNoEmptyNoPrefix(cleanMessage);
            if(params.length >= 2) {
                logsSize(channel, params[1]).then();
            } else {
                logsSize(channel, "").then();
            }
        } else if (isCommand(cleanMessage.toLowerCase(), 'raidping')) {
            raidPing(channel, tags.username);
        } else if (isCommand(cleanMessage.toLowerCase(), 'raidunping')) {
            raidUnPing(channel, tags.username);
        } else if (isCommand(cleanMessage.toLowerCase(), "raidstats")) {
            sendMessageRetry(channel, raidStats());
        } else if (isCommand(cleanMessage.toLowerCase(), 'help') || isCommand(cleanMessage.toLowerCase(),
            'command') || isCommand(cleanMessage.toLowerCase(), 'commands')) {
            help(channel, tags.username);
        } else if (isCommand(cleanMessage.toLowerCase(), "lastraid")) {
            if (lastRaid !== null) {
                let timeSinceRaidSeconds = (Date.now() - new Date(lastRaid["ts"])) / 1000;
                let status = "in progress";
                if(lastRaid["won"] !== undefined) {
                    if(lastRaid["won"]) {
                        status = "won";
                    } else {
                        status = "lost";
                    }
                }
                sendMessage(channel, "Last raid " + prettySeconds(timeSinceRaidSeconds) + " ago. Status: " + status + ". (level " + lastRaid["level"] + ")");
            } else {
                sendMessage(channel, "No raids recorded yet");
            }
        }else if (isCommand(cleanMessage.toLowerCase(), "flashbang")) {
            let amount = 1;
            let params = cleanMessage.split(" ").filter(x => x.length !== 0);
            if (params.length >= 2) {
                try {
                    amount = parseInt(params[1]);
                } catch (e) {
                    console.log("Error while parsing flashbang");
                    console.log(e);
                }
                try {
                    let text = flashbangselector(params[0]);
                    flashbang(channel, tags, amount, text);
                } catch (e) {
                    sendMessage(channel, String(e));
                }

            } else {
                sendMessage(channel, "usage : " + prefix + "flashbang# amount");
            }
        } else if (isCommand(cleanMessage.toLowerCase(), "supaflashbang")) {
            let amount = 1;
            try {
                amount = parseInt(cleanMessage.split(" ")[1]);
            } catch (e) {
                console.log("Error while parsing flashbang");
                console.log(e);
            }
            flashbang(channel, tags, amount, "GotCaughtTrolling FreePoggersEmote bruhFAINT");
        } else if (isCommand(cleanMessage, "CallingTheImpostor")) {
            callingTheImpostor(channel);
        } else if (isCommand(cleanMessage.toLowerCase(), "banphraseping")) {
            let params = cleanMessage.split(" ");
            if (params.length === 2) {
                let url = params[1];
                pingPajbotApi(url).then((delay) => {
                    sendMessageRetry(channel, String(delay) + "ms to " + url);
                }).catch((e) => {
                    console.log(e);
                    sendMessageRetry(channel, "error pinging the pajbotapi provided");
                });
            }
        } else if(isCommand(cleanMessage.toLowerCase(), "rq") || isCommand(cleanMessage.toLowerCase(), "randomquote")) {
            let params = splitNoEmptyNoPrefix(cleanMessage);
            let target = tags.username;
            if(params.length >= 2) {
                target = params[1];
            }
            rq(channel, tags.username, target).then(message => {
                if(message.length > 0) {
                    sendMessageRetry(channel, message);
                }
            });
        } else if(isCommand(cleanMessage.toLowerCase(), "rl") || isCommand(cleanMessage.toLowerCase(), "randomline")) {
            let params = splitNoEmptyNoPrefix(cleanMessage);
            // TODO make it actually random and not just a person in chat
            let target = channelsChatters[channel][Math.floor(Math.random() * channelsChatters[channel].length)];
            if(params.length >= 2) {
                target = params[1];
            }
            rq(channel, tags.username, target).then(message => {
                if(message.length > 0) {
                    sendMessageRetry(channel, message);
                }
            });
        } else if(isCommand(cleanMessage.toLowerCase(), "fl")) {
            let params = splitNoEmptyNoPrefix(cleanMessage);
            let target = tags.username;
            if(params.length >= 2) {
                target = params[1];
            }
            fl(channel, tags.username, target).then(message => {
                if(message.length > 0) {
                    sendMessageRetry(channel, message);
                }
            });
        } else if(isCommand(cleanMessage.toLowerCase(), "ll") || isCommand(cleanMessage.toLowerCase(), "lastline")) {
            let params = splitNoEmptyNoPrefix(cleanMessage);
            let target = tags.username;
            if(params.length >= 2) {
                target = params[1];
            }
            lastLine(channel, tags.username, target).then(message => {
                if(message.length > 0) {
                    sendMessageRetry(channel, message);
                }
            });
        } else if(isCommand(cleanMessage.toLowerCase(), "random")) {
            random(channel, cleanMessage);
        } else if(isCommand(cleanMessage.toLowerCase(), "si") || isCommand(cleanMessage.toLowerCase(), "streaminfo")) {
            streamInfo(channel, cleanMessage).then();
        } else if(isCommand(cleanMessage.toLowerCase(), "uid") || isCommand(cleanMessage.toLowerCase(), "userid")) {
            userId(channel, cleanMessage, tags.username).then();
        } else if(isCommand(cleanMessage.toLowerCase(), "stalkhack") || isCommand(cleanMessage.toLowerCase(), "whereishack")) {
            whereIsHack(channel);
        }

        // Broadcaster and admin command
        if (trusted.includes(tags.username) || isBroadCaster(tags.username, channel)) {
            if (isCommand(cleanMessage.toLowerCase(), "massping")) {
                massPing(channel, message);
            }
        }

        // MODS broadcaster and admin commands
        if (trusted.includes(tags.username) || isMod(tags, channel)) {
            const maxSize = 50;
            if (isCommand(cleanMessage.toLowerCase(), 'supamodpyramid ')) {
                let args = cleanMessage.substring('&supamodpyramid '.length).split(' ');
                console.log('pyramid args : ' + String(args))
                try {
                    let size = parseInt(args[0]);
                    let emote = args[1];
                    if (size > maxSize) {
                        sendMessage(channel, "The maximum pyramid width is " + maxSize);
                    } else if (emote.trim() !== '' && size > 1) {
                        let emoteSpace = emote.trim() + " ";
                        for (let i = 1; i < size; i++) {
                            sendMessageRetry(channel, emoteSpace.repeat(i));
                        }
                        for (let i = size; i > 0; i--) {
                            sendMessageRetry(channel, emoteSpace.repeat(i));
                        }
                    }
                } catch (e) {
                    console.log("Error while parsing supamodpyramid");
                    console.error(typeof e + " : " + e.message);
                }
            } else if (isCommand(cleanMessage.toLowerCase(), "enableraid")) {
                let params = splitNoEmptyNoPrefix(cleanMessage);
                if (params.length >= 2) {
                    addChannelRaidPing(channel, params[1]);
                } else {
                    addChannelRaidPing(channel);
                }
            } else if (isCommand(cleanMessage.toLowerCase(), "disableraid")) {
                removeChannelRaidPing(channel);
            }
        }


        // Admin only commands
        if (trusted.includes(tags.username)) {
            if (isCommand(cleanMessage, "runlist")) {
                runList(channel, tags, cleanMessage);
            }
            if (isCommand(cleanMessage, "clear")) {
                const numberOfMessages = messageQueue.length;
                messageQueue = [];
                console.log("Cleared message queue : " + numberOfMessages + " messages");
                sendMessageRetry(channel, "@" + tags.username + " cleared queue of " + numberOfMessages + " messages");
            }
            if (isCommand(cleanMessage, 'queue')) {
                const numberOfMessages = messageQueue.length;
                let message = "Number of messages in queue : " + numberOfMessages;
                console.log(message);
                message = tags.username + " " + message;
                sendMessageRetryPriority(channel, message);
            }
            if (isCommand(cleanMessage.toLowerCase(), 'unping')) {
                let params = cleanMessage.split(' ');
                if (params.length >= 2) {
                    addUserIgnore(channel, params[1]);
                }
            } else if (isCommand(cleanMessage.toLowerCase(), 'reping')) {
                let params = cleanMessage.split(' ');
                if (params.length >= 2) {
                    removeUserIgnore(channel, params[1]);
                }
            }
            if (isCommand(cleanMessage, "setprefix")) {
                const args = cleanMessage.split(' ');
                if (args[1] !== '') {
                    prefix = args[1];
                    sendMessageRetry(channel, "Changed bot prefix to " + prefix);
                } else {
                    sendMessageRetry(channel, "Can't set empty prefix FeelsDankMan");
                }
            }
            // whisper, todo
            if (cleanMessage.startsWith('&w ')) {
                // = cleanMessage.substring(3).split(' ');
            }
            if (isCommand(cleanMessage.toLowerCase(), 'eval ')) {
                evalCommand(channel, cleanMessage).then();
            } else if (isCommand(cleanMessage.toLowerCase(), 'aeval ')) {
                asyncEvalCommand(channel, cleanMessage).then();
            } else if (isCommand(cleanMessage.toLowerCase(), "fetch")) {
                let params = splitNoEmptyNoPrefix(cleanMessage);
                if (params.length >= 2) {
                    let url = params[1].startsWith("http") ? params[1] : "https://" + params[1];
                    sendMessageRetry(channel, getUrl(url));
                } else {
                    sendMessage(channel, "No url provided FeelsDankMan");
                }
            } else if (isCommand(cleanMessage.toLowerCase(), 'quit')) {
                console.log("Received quit command, bye Sadge");
                sendMessageRetry(channel, 'Quitting PepeHands');
                setTimeout(process.exit, 1500);
            } else if (isCommand(cleanMessage.toLowerCase(), 'kill')) {
                console.log("Received kill command, quitting now.");
                process.exit();
            } else if (isCommand(cleanMessage.toLowerCase(), "update")) {
                update(channel).then();
            } else if(isCommand(cleanMessage.toLowerCase(), "join")) {
                let params = splitNoEmptyNoPrefix(cleanMessage);
                if(params.length >= 2) {
                    join(channel, params[1]);
                } else {
                    sendMessageRetry(channel, "Specify a channel to join FeelsDankMan");
                }
            }else if(isCommand(cleanMessage.toLowerCase(), "leave")) {
                let params = splitNoEmptyNoPrefix(cleanMessage);
                if(params.length >= 2) {
                    leave(channel, params[1]);
                } else {
                    sendMessageRetry(channel, "Specify a channel to leave FeelsDankMan");
                }
            }
        }
    }
});

let lastTS = Date.now();

function getPlayers(game, trusted) {
    const cooldown = 15;
    const apiUrl = "https://api.magichack.xyz/steam/players/";
    let elapsedTime = (Date.now() - lastTS) / 1000;

    if(game.toLowerCase().startsWith('id:') || game.toLowerCase().startsWith('appid:')) {
        return new Promise((resolve) => {
            let id = 0;
            try {
                id = parseInt(game.split(':')[1]);
            } catch (e) {
                return "Invalid format, use id:appid like id:105600";
            }
            const url = apiUrl + encodeURIComponent(id);

            let settings = {method: "Get"};
            if (elapsedTime > cooldown || trusted) {
                console.log("Game : " + game);
                console.log("Request : " + url);
                lastTS = Date.now();
                fetch(url, settings)
                    .then((res) => {
                        if (!res.ok) {
                            throw new Error("Not 2xx response");
                        }
                        return res.text();
                    })
                    .then((text) => {
                        return resolve(`The game with appid ${id} has ${text} players online.`);
                    }).catch((error) => {
                    console.error("Failed to get player info from steamapi");
                    console.error(typeof error + " " + error.message);
                    // Idk, maybe we should reject eShrug
                    return resolve("Error fetching steam players info")
                });
            } else {
                return resolve("Command on cooldown, wait " + (cooldown - elapsedTime).toFixed(2) + "s")
            }
        });

    } else {
        const url = apiUrl + 'pajbot/' + encodeURIComponent(game);

        return new Promise((resolve) => {
            if (game === "/") {
                return resolve("Invalid game name");
            }
            let settings = {method: "Get"};
            if (elapsedTime > cooldown || trusted) {
                console.log("Game : " + game);
                console.log("Request : " + url);
                lastTS = Date.now();
                fetch(url, settings)
                    .then((res) => {
                        if (!res.ok) {
                            throw new Error("Not 2xx response");
                        }
                        return res.text();
                    })
                    .then((text) => {
                        return resolve(text);
                    }).catch((error) => {
                    console.error("Failed to get player info from steamapi");
                    console.error(typeof error + " " + error.message);
                    // Idk, maybe we should reject eShrug
                    return resolve("Error fetching steam players info")
                });
            } else {
                return resolve("Command on cooldown, wait " + (cooldown - elapsedTime).toFixed(2) + "s")
            }
        });
    }
}

client.on("join", (channel) => {
    if (typeof channelsChatters[channel] === 'undefined') {
        getChatters(channel);
    }
});


async function checkIfRaid(tags, message) {

    // How many chars to split a message
    const MAX_CHARS = 500;
    const MIN_LEVEL = 1000;
    if (tags.username === 'huwobot') {
        let raidBeginRE = /A Raid Event at Level \[([0-9]+)] has appeared./;
        let raidLostRE = /\d+ users? failed to beat the raid level \[\d+] - No experience rewarded!/;
        let raidWonRE = /\d+ users beat the raid level \[\d+] - (\d+) experience rewarded!/;
        let matchBegin = raidBeginRE.exec(message);
        let matchLost = raidLostRE.exec(message);
        let matchWon = raidWonRE.exec(message);
        if (matchBegin !== null) {
            console.log("Raid detected");
            let raidLevel = matchBegin[1];
            try {
                raidLevel = parseInt(raidLevel);
            } catch (e) {
                console.error("Failed to parse raid level");
            }
            lastRaid = {level: raidLevel, ts: new Date().toJSON()}
            // Notify me of a raid if I have my chat open
            if (channelsChatters["#hackmagic"].includes('hackmagic')) {
                sendNotification("Join raid DinkDonk !!");
            }
            if (raidLevel >= MIN_LEVEL) {
                for (let notifyChannel of raidPingChannels) {
                    if (raidData[notifyChannel] === undefined) {
                        console.error("Raid channel has no data in json file");
                        continue;
                    }
                    if (notifyChannel === "#minusinsanity") {
                        try {
                            if (await isLive(notifyChannel)) {
                                console.log("didn't send raid in channel " + notifyChannel + " : live");
                                continue;
                            }
                        } catch (e) {
                            sendMessageRetryPriority("#magichackbot", "Failed to check if channel " + notifyChannel + " is live");
                            // don't send if live status can't be verified
                            continue;
                        }
                    }
                    let pingEmote = raidData[notifyChannel]["emote"];

                    let baseMessage = pingEmote + ' +join (raid lvl ' + raidLevel + ') ';
                    let notifMessage = baseMessage;
                    const separator = ' @';

                    let peopleToNotify = raidData[notifyChannel]["users"];

                    for (let p of peopleToNotify) {
                        // Send and create a new message when it's too long
                        if (notifMessage.length + p.length + separator.length >= MAX_CHARS) {
                            sendMessageRetryPriority(notifyChannel, notifMessage);
                            notifMessage = baseMessage;
                        }
                        notifMessage += separator + p;
                    }
                    if (notifMessage.length !== 0) {
                        sendMessageRetryPriority(notifyChannel, notifMessage);
                    } else {
                        console.log("No one to notify Sadge");
                    }
                }
            }
        } else if (matchLost !== null) {
            console.log("Raid lost");
            if (lastRaid["won"] === undefined) {
                lastRaid["won"] = false;
                lastRaid["xp"] = 0;
                raidHistory.push(lastRaid);
                saveDataJson(raidHistory, RAID_HISTORY_FILE);
            } else {
                console.log("Did not save raid result. Missed raid start");
            }
            if (lastRaid.level >= MIN_LEVEL) {
                for (let notifyChannel of raidPingChannels) {
                    if (notifyChannel === "#minusinsanity") {
                        if (await isLive(notifyChannel)) {
                            console.log("didn't send lost raid in channel " + notifyChannel + " : live");
                            continue;
                        }
                    }
                    sendMessageRetry(notifyChannel, "Raid L OMEGALULiguess ST");
                }
            }
        } else if (matchWon !== null) {
            console.log("Raid won");
            let xp = matchWon[1];
            try {
                xp = parseInt(xp);
            } catch (e) {
                console.error("Failed to convert xp to int");
            }
            if (lastRaid["won"] === undefined) {
                lastRaid["won"] = true;
                lastRaid["xp"] = xp;
                raidHistory.push(lastRaid);
            } else {
                console.log("Did not save raid result. Missed raid start");
            }
            saveDataJson(raidHistory, RAID_HISTORY_FILE);
            if (lastRaid.level >= MIN_LEVEL) {
                for (let notifyChannel of raidPingChannels) {
                    if (notifyChannel === "#minusinsanity") {
                        if (await isLive(notifyChannel)) {
                            console.log("didn't send won raid in channel " + notifyChannel + " : live");
                            continue;
                        }
                    }
                    sendMessageRetry(notifyChannel, "Raid W PagMan N (+" + xp + "xp)");
                }
            }
        }
    }
}

function raidStats() {
    let minLevel = Infinity;
    let maxLevel = -Infinity;
    let sumLevels = 0;
    let numWins = 0;
    let numLoss = 0;
    let numRaids = raidHistory.length;
    let minXp = Infinity;
    let maxXp = -Infinity;
    let sumXp = 0;
    for (let r of raidHistory) {
        let level = r["level"];
        minLevel = Math.min(minLevel, level);
        maxLevel = Math.max(maxLevel, level);
        sumLevels += level;
        if (r["won"]) {
            let xp = r["xp"];
            numWins++;
            sumXp += xp;
            minXp = Math.min(minXp, xp);
            maxXp = Math.max(maxXp, xp);
        } else {
            numLoss++;
        }
    }
    if (numRaids > 0) {
        let averageLevel = sumLevels / numRaids;
        let winRate = numWins / numRaids;
        let averageXp = 0;
        if (numWins > 0) {
            averageXp = sumXp / numWins;
        }
        return `Recorded ${numRaids} raids, Winrate: ${(winRate * 100).toFixed(2)}%. Min lvl: ${minLevel}, 
        Max lvl: ${maxLevel}, Average lvl: ${averageLevel.toFixed(2)}. Wins: ${numWins}, Losses: ${numLoss}. 
        Min xp: ${minXp}, Max xp: ${maxXp}, Average xp: ${averageXp.toFixed(2)}`;
    }
    return "No raids recorded yet";
}

// Puts messages at the start of the queue
function sendMessageRetryPriority(channel, message) {
    messagePriorityQueue.push({channel: channel, message: message});
    sendMessageRetry(channel, '');
}

let timerHandle = null;

// Retries to send messages if they fail
function sendMessageRetry(channel, message) {
    let currentQueue = messageQueue;
    if (message !== '') {
        currentQueue.push({channel: channel, message: message});
        // console.log("Queue length : " + messageQueue.length);
    }
    if (messagePriorityQueue.length > 0) {
        currentQueue = messagePriorityQueue;
    }
    if (currentQueue.length > 0) {
        let messageToSend = currentQueue[0];
        if (timerHandle === null) {
            // console.log("Starting interval for sending messages");
            timerHandle = setInterval(sendMessageRetry, 300, channel, '');
        }
        while (sendMessage(messageToSend.channel, messageToSend.message)) {
            currentQueue.shift();
            if (currentQueue.length > 0) {
                messageToSend = currentQueue[0];
            } else {
                break;
            }
        }
    } else {
        // console.log("Stopping retry message timer, no messages in queue");
        clearInterval(timerHandle);
        timerHandle = null;
    }
}

// We assume normal bucket is half full on start, 30 seconds before being able to send messages on startup
let sentMessagesTS = new Array(Math.round(rateLimitMessagesMod / 2)).fill(Date.now());
let logSendMessages = false;

function sendMessage(channel, message) {
    const charLimit = 500;
    // TODO implement banphrase api

    // We implement rate limit as a sliding window,
    // (last refill is now - 30seconds) to never go over the limit
    // We remove timestamps older then 30 second (+1 for safety margin)
    sentMessagesTS = sentMessagesTS.filter(ts => Date.now() - ts < (30 + 1) * 1000);
    let messageCounter = sentMessagesTS.length;

    let isMod = false;
    let isVip = false;

    try {
        if (typeof chattersRoles[channel]["chatters"]["moderators"] !== 'undefined') {
            isMod = chattersRoles[channel]["chatters"]["moderators"].includes(client.getUsername());
        } else {
            console.log("Couldn't check role");
        }

        if (typeof chattersRoles[channel]["chatters"]["vips"] !== 'undefined') {
            isVip = chattersRoles[channel]["chatters"]["vips"].includes(client.getUsername());
        } else {
            console.log("Couldn't check role");
        }
    } catch (e) {
        console.error("Failed to check chatter list");
        console.error(e);
    }


    let modSpam = false;

    let currentRate = rateLimitDelay;
    let currentLimit = rateLimitMessages;

    if (isMod || isVip) {
        if (logSendMessages) {
            console.log("using mod/vip rate limit");
        }
        currentRate = rateLimitDelayMod;
        currentLimit = rateLimitMessagesMod;

        if (modSpamChannels.includes(channel)) {
            modSpam = true;
            if (logSendMessages) {
                console.log("Mod spam enabled TriHard");
            }
        }
    }

    if (!modSpam && Date.now() - lastMessageTimeStampMs < currentRate * 1000) {
        // We send messages at most every 30s/ratelimit, another mesure to not go over the rate limit
        // except in channel where mod spam is enabled.
        if (logSendMessages) {
            console.log("Dropped message cause we are sending too fast");
        }
        return false;
    } else {
        if (logSendMessages) {
            console.log("Current message counter is : " + messageCounter);
        }

        if (messageCounter >= currentLimit - 1) {
            // 1 message buffer monkaGIGA...
            if (logSendMessages) {
                console.log("Dropped message cause we are approching max number of message every 30s");
            }
            return false;
        }
        // We add the current timestamp to the sliding window
        sentMessagesTS.push(Date.now());
        lastMessageTimeStampMs = Date.now();

        // Add random char after to not trigger same message rejection, mods do not have this restriction
        if (!isMod && !isVip && lastSentMessage === message) {
            message += ' ' + blankchar;
        }
        lastSentMessage = message;
        if (message.length > charLimit) {
            console.log("Message too long (" + message.length + " chars), truncating it");
            message = message.substring(0, charLimit - 5) + ' ...';
        }
        client.say(channel, message);
        return true;
    }
}

function getAllChatters() {
    let channels = client.getChannels();
    // delay each channel refresh to space them out in the delay
    let delay = delayChatterRefresh / channels.length;
    for (let i in channels) {
        let cDelay = i * delay;
        // console.log("Updating chatters for " + channels[i] + " in " + cDelay.toFixed(2) + "s");
        setTimeout(getChatters, cDelay * 1000, channels[i]);
    }
}

function getChatters(channelName) {
    // console.log("Updating chatter list for " + channelName);
    let url = `https://tmi.twitch.tv/group/user/${channelName.substring(1)}/chatters`

    let settings = {method: "Get"};
    let chatters = []
    fetch(url, settings)
        .then(res => res.json())
        .then((json) => {
            for (let c of json["chatters"]["broadcaster"]) {
                chatters.push(c);
            }
            for (let c of json["chatters"]["vips"]) {
                chatters.push(c);
            }
            for (let c of json["chatters"]["moderators"]) {
                chatters.push(c);
            }
            for (let c of json["chatters"]["staff"]) {
                chatters.push(c);
            }
            for (let c of json["chatters"]["global_mods"]) {
                chatters.push(c);
            }
            for (let c of json["chatters"]["admins"]) {
                chatters.push(c);
            }
            for (let c of json["chatters"]["viewers"]) {
                chatters.push(c);
            }
            channelsChatters[channelName] = chatters;
            chattersRoles[channelName] = json;

            // Update unique chatters
            addMultipleUniqueChatters(chatters);
        }).catch((error) => {
        console.error("Failed to get chatters list from tmi");
        console.error(typeof error + " " + error.message);
    });
}

function prettySeconds(seconds) {
    // return a formatted string days, hours, minutes, seconds
    return humanizeDuration(Math.round(seconds) * 1000);
}

function prettyMs(milliSeconds) {
    // return a formatted string days, hours, minutes, seconds
    return prettySeconds(milliSeconds / 1000);
}

function isCommand(message, command) {
    let params = message.split(" ").filter(x => x.length !== 0);
    if (params.length >= 2) {
        if (params[0] === prefix && params[1] === command) {
            return true;
        }
    }
    return message.startsWith(prefix + command);
}

function addChannelRaidPing(channel, emote) {
    if (raidPingChannels.includes(channel)) {
        sendMessageRetry(channel, "This channel already has raid pings enabled...");
        return;
    }
    raidPingChannels.push(channel);
    saveDataJson(raidPingChannels, PING_CHANNELS_FILE);
    if (raidData[channel] === undefined) {
        emote = emote === undefined ? "DinkDonk" : emote;
        raidData[channel] = {emote: emote, users: []};
        saveDataJson(raidData, RAID_FILE);
    }
    sendMessageRetry(channel, "Raid pings enabled FeelsGoodMan , do " + prefix + "raidping to get pinged");
}

function removeChannelRaidPing(channel) {
    let index = raidPingChannels.indexOf(channel);
    if (index !== -1) {
        raidPingChannels.splice(index, 1);
        sendMessageRetry(channel, "Raid pings disabled FeelsOkayMan");
        saveDataJson(raidPingChannels, PING_CHANNELS_FILE);
    } else {
        sendMessageRetry(channel, "This channel already has raid pings disabled...");
    }
}

function raidPing(channel, user) {
    if (!raidPingChannels.includes(channel)) {
        sendMessage(channel, "raid pings aren't enabled in this channel :(");
        return;
    }

    const index = raidData[channel]["users"].indexOf(user);
    if (index === -1) {
        raidData[channel]["users"].push(user);
        try {
            saveDataJson(raidData, RAID_FILE);
        } catch (error) {
            console.error(typeof error + " " + error.message);
            console.error("Failed to write the raid users file");
            sendMessageRetry(channel, `@${user}, an error occurred while saving the ping list monkaS, contact 
			@hackmagic`);
        }
        sendMessageRetry(channel, `@${user}, added you to the raid ping list FeelsOkayMan`);
    } else {
        sendMessageRetry(channel, `@${user}, you are already in the ping list FeelsDankMan , type 
		${prefix}raidunping if you no longer want to be pinged`);
    }
}

function raidUnPing(channel, user) {
    if (raidData[channel] === undefined) {
        sendMessage(channel, "You aren't in the ping list for this channel");
        return;
    }
    const index = raidData[channel]["users"].indexOf(user);
    if (index !== -1) {
        raidData[channel]["users"].splice(index, 1);
        try {
            saveDataJson(raidData, RAID_FILE);
        } catch (error) {
            console.error(typeof error + " " + error.message);
            console.error("Failed to write the raid users file");
            sendMessageRetry(channel, `@${user}, an error occurred while saving the ping list monkaS, contact 
			@hackmagic`);
            return;
        }
        sendMessageRetry(channel, `@${user}, removed you from the ping list FeelsOkayMan , type 
		${prefix}raidping if you want to get pinged again`);
    } else {
        sendMessageRetry(channel, `@${user}, you are not currently in the list of people to ping FeelsDankMan 
		type ${prefix}raidping if you want to get pinged`);
    }
}

function help(channel, user) {
    const helpText = "&raidping to get notified of raids, &players to check the current online player count of a steam game," +
        " &fl, &rq, &raidstats, &lastraid and &enable/disableraid (mod only)";
    sendMessageRetry(channel, `@${user}, ${helpText}`);
}

let lastMessage = Date.now();
let notifMessages = [];
let notifTimer = null;

function phoneNotifications(rawChannel, message, user) {
    // Time with no message before a it sends a ping
    const afkTime = 15;
    // Time we wait before sending a notification
    const notificationDelay = 15;

    let channel = rawChannel;
    let username = user.username;
    let displayName = user['display-name'];

    // Ignore a possible ping if not afk
    if (user.username === 'hackmagic') {
        lastMessage = Date.now();
        notifMessages = [];
        if (notifTimer !== null) {
            clearTimeout(notifTimer);
            notifTimer = null;
        }
    }
    if (Date.now() - lastMessage < afkTime * 1000) {
        return;
    }

    for (let u of ignoreUsersPing) {
        if (u.toLowerCase() === username.toLowerCase()) {
            return;
        }
    }

    if (channel.startsWith('#')) {
        channel = channel.substring(1);
    }
    const noPingChannels = ['forsen', 'huwobot', 'pajlada'];
    const pingRE = [/hackmagic/i, /(?<![a-z])hack(?![a-z])/i, /(?<![a-z])magic(?![a-z])/i];

    if (!noPingChannels.includes(channel)) {
        for (let exp of pingRE) {
            if (exp.test(message)) {
                console.log("Message matched ping regex");
                notifMessages.push(`[${rawChannel}] ${displayName}: ${message}`);
                // remove old timeout and start a new one
                if (notifTimer !== null) {
                    // console.log("Clear old timer");
                    clearTimeout(notifTimer);
                }
                // console.log("Set new notification timeout");
                notifTimer = setTimeout(sendQueueNotification, notificationDelay * 1000);
                break;
            }
        }
    }
}

function sendQueueNotification() {
    const MAX_LENGTH = 1024;
    notifTimer = null;

    console.log("Sending queued " + notifMessages.length + " notifications...");

    if (notifMessages.length === 1) {
        sendNotification(notifMessages[0]);
    } else {
        let notifMessage = `${notifMessages.length} notifications : `;
        const sepStr = ' / ';
        for (let m of notifMessages) {
            notifMessage += m + sepStr;
        }
        // remove last separator
        notifMessage = notifMessage.substring(0, notifMessage.length - sepStr.length);
        // remove excess chars
        if (notifMessage.length > MAX_LENGTH) {
            const endStr = ' ...';
            console.log("Full notification : " + notifMessage);
            notifMessage = notifMessage.substring(0, MAX_LENGTH - endStr.length) + endStr;
        }
        sendNotification(notifMessage);
    }

    // clear notification queue
    notifMessages = [];
}

function sendNotification(message) {
    console.log("Sending pushover notification");
    pushover.send({message: message, title: 'Twitch'}, function (err, result) {
        if (err) {
            console.error(typeof err + ' : ' + err);
            console.error("Error sending pushover notification");
        }
        console.log(result)
    });
}

function removeUserIgnore(channel, username) {
    let index = ignoreUsersPing.indexOf(username);
    if (index === -1) {
        sendMessageRetry(channel, 'hackmagic, user not in list');
    } else {
        ignoreUsersPing.splice(index, 1);
        sendMessageRetry(channel, `hackmagic, removed user ${username} from ignore ping list`);
        try {
            saveDataJson(ignoreUsersPing, IGNORE_PING_FILE);
            console.log('The ignore user ping file has been saved!');
        } catch (e) {
            console.error(e);
        }
    }
}

function addUserIgnore(channel, username) {
    if (!ignoreUsersPing.includes(username)) {
        ignoreUsersPing.push(username);
        sendMessageRetry(channel, `hackmagic, added user ${username} to ping ignore list`);
        try {
            saveDataJson(ignoreUsersPing, IGNORE_PING_FILE);
        } catch (e) {
            console.error(e);
            console.log('The ignore user ping file has been saved!');
        }

    } else {
        sendMessageRetry(channel, 'hackmagic, user already in list');
    }
}


function flashbangselector(command) {
    // TODO: load from json
    const flashbangs = ["FP", "bruhFAINT", "GotCaughtTrolling", "NothingHere", "KartComback", "TriFall", "lightning", "FLASHBANG", "4K"];
    let num = 1;
    try {
        num = parseInt(command.match(/\d+/)[0]);
    } catch (e) {
        console.log("error parsing number in flashbang");
    }
    if (num < 0 || num > flashbangs.length) {
        throw new Error("Valid flashbangs are from 1 to " + flashbangs.length);
    } else {
        return flashbangs[num - 1];
    }
}

function flashbang(channel, user, amount, text) {
    let enabledChannels = ["#pepto__bismol", "#ryuuiro", '#sunephef', '#cairoxo'];
    if (amount > 50) {
        amount = 50;
    }
    const emoteAndSpace = text + " ";
    const number = Math.floor(500 / emoteAndSpace.length);

    const fb = emoteAndSpace.repeat(number).slice(0, -1);
    if (enabledChannels.includes(channel) && (trusted.includes(user.username) || isMod(user, channel))) {
        for (let i = 0; i < amount; i++) {
            sendMessageRetry(channel, fb);
        }
    }
}

function isBroadCaster(username, channel) {
    let chan = channel;
    if (channel.startsWith("#")) {
        chan = channel.substring(1);
    }
    return chan === username;
}

function isMod(user, channel) {
    return user.mod || isBroadCaster(user.username, channel);
}

function callingTheImpostor(channel) {
    let tzNames = momentTZ.tz.names();
    let now = moment();
    let possibleZone = [];
    // TODO : find a better way then checking all possible time zones WAYTOODANK
    for (let tz of tzNames) {
        let hour = now.tz(tz).format("H");
        if (hour === "3") {
            possibleZone.push(tz);
        }
    }
    if (possibleZone.length > 0) {
        let index = getRandomInt(possibleZone.length);
        let tz = possibleZone[index];
        sendMessage(channel, "In " + tz + " it is currently " + now.tz(tz).format("HH:mm") + " CallingTheImpostor");
    } else {
        console.log("Didn't find any timezone where it's 3am, weird...");
    }
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

async function pingPajbotApi(url) {
    let testPhrase = "test";
    let start = Date.now();
    const https = "https://";
    if (!url.startsWith(https)) {
        url = https + url.trim();
    }
    let result = await fetch(url + "/api/v1/banphrases/test", {
        method: 'POST', body:
            JSON.stringify({message: testPhrase}), headers: {'Content-Type': 'application/json'}
    });
    if (result.status !== 200) {
        throw "Response code not 200 from api";
    }
    let decoded = await result.json();

    if(decoded["input_message"] === undefined || decoded["input_message"] !== testPhrase) {
        throw "input message doesn't match test phrase";
    }
    if(decoded["banned"] === undefined || !(decoded["banned"] === true || decoded["banned"] === false)) {
        throw "bad banned value from pajbot api";
    }

    let elapsed = Date.now() - start;
    console.log("pinged " + url + " in " + elapsed + "ms");
    return elapsed;
}

let massPingersElis = [];

function moderation(channel, tags, message) {

    bigfollows(channel, tags, message);

    let enableChannels = ['#hackmagic', '#pepto__bismol', "#minusinsanity"];
    if (!enableChannels.includes(channel)) {
        return;
    }

    if(channel === "#minusinsanity") {
        if(/(￼){3,}/.test(message)) {
            sendMessageRetry(channel, `/timeout ${tags.username} 1 too much obj`);
        }
    }

    if(channel === "#elis") {
        let maxNum = 6;
        let num = numPings(message);
        if (num > maxNum) {
            let numberOfMassPings = 1;
            for(let chatter of massPingersElis) {
                if(chatter === tags.username) {
                    numberOfMassPings++;
                }
            }
            let timeoutLength = 10 * 60 * numberOfMassPings; // 10 mins * time number of offenses
            sendMessageRetry(channel, `/timeout ${tags.username} ${timeoutLength} pinged too many chatters (${num})`);
            massPingersElis.push(tags.username);
        }
    }
}

function runList(channel, tags, message) {
    if (!trusted.includes(tags.username)) {
        console.log("ERROR untrusted user tried to run a list " + tags.username);
        return;
    }
    console.log("Start of runlist, invocation : " + message + " by " + tags.username);
    let params = message.split(" ");
    if (params.length >= 2 && params[1].length !== 0) {
        let path = params[1];
        let lines = [];
        try {
            let data = fs.readFileSync(path, 'utf8');
            lines = data.split('\n');
        } catch (e) {
            console.log(e);
            sendMessageRetry(channel, String(e));
        }
        if (params.length >= 3 && params[2].length !== 0) {
            let command = "";
            let reason = " automated ban";
            if (params[2] === 'name' || params[2] === 'names') {
                command = "/ban ";
                if (params >= 4 && params[3].length !== 0) {
                    reason = " " + params[3];
                }
            }
            lines = lines.map(l => command + l + reason);
        }
        console.log("Running " + lines.length + " lines in the list");
        if (lines.length > 0) {
            console.log("first line : " + lines[0]);
        }
        lines.forEach(l => sendMessageRetry(channel, l));
        sendMessageRetry(channel, "Ran the list of " + lines.length + " lines");
    } else {
        sendMessageRetry(channel, "put a file name to run");
    }
}

function saveDataJson(data, filePath) {
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
}

function readDataJson(filePath) {
    let data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
}

function timeouts(channel, message, username) {
    try {
        let timeout = timeoutList.find(user => user.username === username);
        if (timeout !== undefined) {
            if(message !== "!roll" && !message.startsWith("!roll ")) {
                if (Math.random() <= timeout["probability"]) {
                    sendMessageRetryPriority(channel, `/timeout ${timeout.username} ${timeout.duration} ${timeout.reason}`);
                }
            }
        }
    } catch (e) {
        console.log(e);
    }
}

async function update(channel) {
    // pull repo
    sendMessageRetry(channel, "Pulling repo...");
    let {stdout: gitOut} = await exec('git pull', {encoding: 'utf8'});
    console.log(gitOut);
    if (gitOut.includes("Already up to date.")) {
        sendMessageRetry(channel, "No new commits to pull FeelsDankMan");
    } else {
        if (gitOut.includes("package-lock.json") || gitOut.includes("package.json")) {
            sendMessageRetry(channel, "Updating npm packages...");
            // update npm packages
            let {stdout: npmOut} = await exec("npm ci", {encoding: 'utf8'});
            console.log(npmOut);
        }
        sendMessageRetry(channel, "restarting...");
        setTimeout(process.exit(), 3000);
    }
}

function getUrl(url) {
    try {
        return sfetch(url, {}).text();
    } catch (e) {
        console.log(e);
        return "Error fetching url : " + url;
    }
}

function splitNoEmptyNoPrefix(message) {
    return message.split(" ").filter(x => (x !== prefix && x.length !== 0));
}

function removeWhiteSpace(string) {
    return string.replace(/\s/g,'');
}

function bigfollows(channel, tags, message) {
    const enabledChannels = ["#minusinsanity", "#hackmagic", "#pepto__bismol", "#liptongod", "#prog0ldfish", "#chubbss_"];

    const bigfollowsRE = /(get now|Bu[yu]|Best)(\s+(and\s+)?(viewers,?|followers,?|primes,?)){2,}/ig;

    const brailleRE = /[\u2801-\u28FF\u2580-\u259F]/ig;
    const maxBrailleFirstMsg = 4; // idk

    const nonAsciiRE = /[^\x00-\x7F]/ig;
    const maxNonAsciiFirstMsg = 3;

    const veryBadAscii = ["⢰⣦⠀⢰⡆⢰⠀⣠⠴⠲⠄⢀⡴⠒⠆⠀⡶⠒⠀⣶⠲⣦⠀⠀ ⢸⡏⢧⣸⡇⢸⠀⣏⠀⠶⡆⣾⠀⠶⣶⠀⡷⠶⠀⣿⢶⡋⠀⠀ ⠸⠇⠀⠻⠇⠸⠀⠙⠦⠴⠃⠘⠳⠤⠟⠀⠷⠤⠄⠿⠀⠻"];

    if(channel === "#chubbss_") {
        if ((message.match(brailleRE) || []).length > 110) {
            sendMessageRetryPriority(channel, `/timeout ${tags.username} 120 too many braille chars`);
        }
    }

    let firstMessage = false;
    if(tags["first-msg"] !== undefined) {
        firstMessage = tags["first-msg"];
    }
    if(firstMessage && enabledChannels.includes(channel)) {
        // bigfollows and variations
        if(bigfollowsRE.test(transliterate(message))) {
            let notifMessage = "Banned user : " + tags.username + " in channel " + channel + " for bigfollows";
            console.log(notifMessage);
            sendMessageRetryPriority(channel, `/ban ${tags.username} bigfollows (automated)`);
            sendNotification(notifMessage);
            return;
        }
        const messageNoWhiteSpace = removeWhiteSpace(message);
        // very bad ascii check, maybe move out of first message and check on every message
        for(let bad of veryBadAscii) {
            // remove whitespace of both to compare
            if(messageNoWhiteSpace.includes(removeWhiteSpace(bad))) {
                console.log("Matched very bad ascii:" + message + "\n\"" + bad +"\"");
                sendMessageRetryPriority(channel, `/ban ${tags.username} bad ascii (automated)`);
                sendNotification(`Banned ${tags.username} for very bad ascii: ${message}`);
                return;
            }
        }

        // first message contains many braille chars = very snus
        if((message.match(brailleRE) || []).length > maxBrailleFirstMsg) {
            console.log(message);
            console.log("matched too many braille for first message");
            sendMessageRetryPriority(channel, `/timeout ${tags.username} 30 too many braille characters in first message`);
            sendNotification("First message with braille!!!: " + message);
            return;
        }

        // first message contains many non ascii chars = a bit snus
        if((message.match(nonAsciiRE) || []).length > maxNonAsciiFirstMsg) {
            console.log(message);
            console.log("matched too many non ascii for first message");
            sendMessageRetryPriority(channel, `/timeout ${tags.username} 10 too many non ascii characters in first message`);
            sendNotification("First message with with non ascii: " + message);
            return;
        }
    }
}


let rqCd = [];

// users that can't be rled/rq/fled
let invalidTargets = ["magichackbot", "cleobotra", "minusibot", "harrybottah"];

async function rq(channel, user, target){
    if(rqCd.includes(user)) {
        // cooldown
        return "";
    }
    //
    rqCd.push(user);
    setTimeout(removeRqCd, 15000, user);
    if(target === undefined) {
        target = user;
    }
    target = target.toLowerCase();
    while(target.startsWith("@")) {
        target = target.substring(1);
    }

    // don't rq/fl bot that pings a lot of people
    if(invalidTargets.includes(target)) {
        target = user;
    }

    if(channel.startsWith('#')) {
        channel = channel.substring(1);
    }
    const logsUrl = "https://logs.magichack.xyz";
    const callUrl = `${logsUrl}/channel/${channel}/user/${target}/random`;

    const response = await fetch(callUrl);

    if(!response.ok) {
        return "No logs found for this channel/user";
    }
    const message = await response.text();
    if(message.length === 0) {
        return "Error fetching logs";
    }
    const randomLine = formatJustlog(message);
    if(checkUserMessage(randomLine)) {
        return randomLine;
    } else {
        return "Banphrase detected monkaS";
    }
}

function removeRqCd(user) {
    let index = rqCd.indexOf(user);
    if(index !== -1) {
        rqCd.splice(index, 1);
    }
}

let cdFl = [];
async function fl(channel, user, target) {
    if(cdFl.includes(user)) {
        // cooldown
        return "";
    }
    cdFl.push(user);
    setTimeout(removeCdFl, 60000, user);
    if(target === undefined) {
        target = user;
    }
    target = target.toLowerCase();
    while(target.startsWith("@")) {
        target = target.substring(1);
    }

    // don't rq/fl bot that pings a lot of people
    if(invalidTargets.includes(target)) {
        target = user;
    }

    if(channel.startsWith('#')) {
        channel = channel.substring(1);
    }
    const url = `https://logs.magichack.xyz/list?channel=${channel}&user=${target}`;
    const response = await fetch(url);
    if(!response.ok) {
        return "No logs found for this channel/user";
    }
    const dates = await response.json();
    const earliestDate = dates["availableLogs"][dates["availableLogs"].length - 1];

    const firstMonthLogsUrl = `https://logs.magichack.xyz/channel/${channel}/user/${target}/${earliestDate["year"]}/${earliestDate["month"]}`;
    const responseLogs = await fetch(firstMonthLogsUrl);

    if(!responseLogs.ok) {
        return "Error fetching logs";
    }
    let firstLine = formatJustlog((await responseLogs.text()).split('\n', 1)[0]);

    if(checkUserMessage(firstLine)) {
        return firstLine;
    } else {
        return "Banphrase detected monkaS";
    }
}

function removeCdFl(user) {
    let index = cdFl.indexOf(user);
    if(index !== -1) {
        cdFl.splice(index, 1);
    }
}

let cdLl = [];
async function lastLine(channel, user, target) {
    if(cdLl.includes(user)) {
        // cooldown
        return "";
    }
    cdLl.push(user);
    setTimeout(removeCdLl, 15000, user);
    if(target === undefined) {
        target = user;
    }
    target = target.toLowerCase();
    while(target.startsWith("@")) {
        target = target.substring(1);
    }

    // don't rq/fl bot that pings a lot of people
    if(invalidTargets.includes(target)) {
        target = user;
    }

    if(channel.startsWith('#')) {
        channel = channel.substring(1);
    }
    const url = `https://logs.magichack.xyz/list?channel=${channel}&user=${target}`;
    const response = await fetch(url);
    if(!response.ok) {
        return "No logs found for this channel/user";
    }
    const dates = await response.json();
    const latestDate = dates["availableLogs"][0];

    const lastMonthLogsUrl = `https://logs.magichack.xyz/channel/${channel}/user/${target}/${latestDate["year"]}/${latestDate["month"]}?reverse`;
    const responseLogs = await fetch(lastMonthLogsUrl);

    if(!responseLogs.ok) {
        return "Error fetching logs";
    }
    let lastLine = formatJustlog((await responseLogs.text()).split('\n', 1)[0]);

    if(checkUserMessage(lastLine)) {
        return lastLine;
    } else {
        return "Banphrase detected monkaS";
    }
}

function removeCdLl(user) {
    let index = cdLl.indexOf(user);
    if(index !== -1) {
        cdLl.splice(index, 1);
    }
}


function formatJustlog(message) {
    let words = message.split(' ');

    // fix leading zero on day returned by justlog
    let date = words[0].split('-');
    if(date.length>= 3 && date[2].length === 1) {
        date[2] = "0" + date[2];
        words[0] = date.join('-');
    }

    for(let i in words) {
        // Remove channel from message
        if(words[i].startsWith("#")) {
            words.splice(i, 1);
            break;
        }
    }

    return replaceDateByTimeAgo(words.join(" "));
}

function replaceDateByTimeAgo (message) {
    // [2021-11-1 00:04:08] #minusinsanity hackmagic: BatChest
    try {
        let date = message.split("[")[1].split("]")[0];
        // Add utc indicator
        date += ".000Z";
        let messageDate = new Date(date);
        return "(" + shortEnglishHumanizer((Math.round((Date.now() - messageDate) / 1000) * 1000),
            { units: ["y", "d", "h", "m", "s"] }).split(" ").join("").split(",").join(" ") + " ago) "
            + message.slice(message.indexOf("]") + 1);
    } catch (e) {
        console.error(e);
        return "Error formatting date ...";
    }
}

function checkUserMessage(message) {
    // TODO : banphrase api
    const racismRegex = /(?:(?:\b(?<![-=\.])|monka)(?:[Nnñ]|[Ii7]V)|[\/|]\\[\/|])[\s\.]*?[liI1y!j\/|]+[\s\.]*?(?:[GgbB6934Q🅱qğĜƃ၅5\*][\s\.]*?){2,}(?!arcS|l|Ktlw|ylul|ie217|64|\d? ?times)/;
    return !racismRegex.test(message) && !isMassPing(message);
}

function join(channel, newChannel) {
    newChannel = newChannel.toLowerCase();
    if(!newChannel.startsWith("#")) {
        newChannel = "#" + newChannel;
    }
    const index = channels.indexOf(newChannel);
    if(index !== -1) {
        sendMessageRetry(channel, "I'm already in this channel FeelsDonkMan");
        return;
    }
    channels.push(newChannel);
    saveDataJson(channels, channelsFilePath);
    client.join(newChannel)
        .then(() => {
            sendMessageRetryPriority(newChannel, "Joined channel");
            sendMessageRetryPriority(channel, "Successfully joined new channel");
        }).catch((err) => {
        console.error("Failed to join channel");
        console.error(err);
        sendMessageRetryPriority(channel, "Error joining channel monkaS");
    });
}

function leave(channel, channelToRemove) {
    channelToRemove = channelToRemove.toLowerCase();
    if(!channelToRemove.startsWith("#")) {
        channelToRemove = "#" + channelToRemove;
    }
    const index = channels.indexOf(channelToRemove);
    if(index === -1) {
        sendMessageRetry(channel, "I'm not in this channel FeelsDonkMan");
        return;
    }
    channels.splice(index,1);
    saveDataJson(channels, channelsFilePath);
    client.part(channelToRemove)
        .then(() => {
            sendMessageRetryPriority(channel, "Successfully left channel FeelsBadMan");
        }).catch((err) => {
        console.error("Failed to part channel");
        console.error(err);
        sendMessageRetryPriority(channel, "Error leaving channel monkaS");
    });
}


const shortEnglishHumanizer = humanizeDuration.humanizer({
    language: "shortEn",
    languages: {
        shortEn: {
            y: () => "y",
            mo: () => "mo",
            w: () => "w",
            d: () => "d",
            h: () => "h",
            m: () => "m",
            s: () => "s",
            ms: () => "ms",
        },
    },
});

function numPings(message) {
    let pingCount = 0;
    // get each unique words of the message
    const words = message.toLowerCase().match(/\w+/g).filter((x, i, a) => a.indexOf(x) === i);
    words.forEach((w) => {
        if(uniqueChatters.includes(w)) {
            pingCount++;
        }
    });
    return pingCount;
}

function isMassPing(message) {
    return numPings(message) >= massPingNum;
}

function addMultipleUniqueChatters(chatters) {
    for(let c of chatters) {
        addUniqueChatter(c);
    }
}

function addUniqueChatter(username) {
    if(!uniqueChatters.includes(username)) {
        uniqueChatters.push(username);
    }
}

function getRndInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1) ) + min;
}

function random(channel, message) {
    let params = splitNoEmptyNoPrefix(message);
    let min = 1;
    let max = 0;
    try {
        if(params.length >= 3) {
            min = parseInt(params[1]);
            max = parseInt(params[2]);
        } else if (params.length >= 2) {
            max = parseInt(params[1]);
        } else {
            sendMessage(channel, "Enter a max number or a min and a max, ex: " + prefix + "random 1 6");
            return;
        }
        sendMessage(channel, String(getRndInteger(min, max)));
    } catch (e) {
        sendMessage(channel, "Enter a max number or a min and a max, ex: " + prefix + "random 1 6");
    }

}

async function evalCommand(channel, message) {
    console.log("Eval monkaGIGA");
    try {
        let result = String(eval('(' + message.substring('&eval '.length) + ')'));
        sendMessageRetry(channel, result);
    } catch (e) {
        console.error(e.message);
        sendMessageRetry(channel, "Eval failed, check console for details.");
    }
}

async function asyncEvalCommand(channel, message) {
    console.log("Eval monkaGIGA");
    try {
        let result = String(await eval(message.substring('&aeval '.length)));
        sendMessageRetry(channel, result);
    } catch (e) {
        console.error(e.message);
        sendMessageRetry(channel, "Eval failed, check console for details.");
    }
}

function removeHashtag(channel) {
    if(channel.startsWith('#')) {
        return channel.substring(1);
    }
    return channel;
}

async function streamInfo(channel, message) {
    let params = splitNoEmptyNoPrefix(message);
    let target = channel;
    if(params.length >= 2) {
        target = params[1].toLowerCase();
    }
    target = removeHashtag(target);
    let info = {data : ""};
    try {
        info = await getStream(target);
    } catch (e) {}
    let reply = "";
    if(info["data"].length === 0) {
        try {
            let response = await fetch("https://api.ivr.fi/v2/twitch/user/" + target);
            if(!response.ok) {
                reply = "could not find the specified user";
            } else {
                let streamInfo = await response.json();
                let name = streamInfo["displayName"];
                let lastDate = streamInfo["lastBroadcast"]["startedAt"];
                let formattedDate;
                if(lastDate !== null) {
                    let lastStreamDate = new Date(streamInfo["lastBroadcast"]["startedAt"]);
                    let title = streamInfo["lastBroadcast"]["title"];
                    formattedDate = prettySeconds(Math.round((Date.now() - lastStreamDate) / 1000)) + " ago";
                    reply = `${name} last streamed ${formattedDate}: ${title}`;
                } else {
                    reply = `${name} has never streamed.`;
                }
            }
        } catch (e) {
            reply= "Error fetching info, try again later";
        }
    } else {
        let streamInfo = info["data"][0];
        let title = streamInfo["title"];
        let game = streamInfo["game_name"];
        let streamer_name = streamInfo["user_name"];
        let start_date = new Date(streamInfo["started_at"]);
        let time_since_start = Date.now() - start_date;
        let viewCount = streamInfo["viewer_count"];
        let timeFormatted = prettySeconds(Math.round(time_since_start / 1000));
        reply = `${streamer_name} is playing ${game} for ${viewCount} viewers. Title: ${title}, stream started ${timeFormatted} ago.`;
    }
    sendMessageRetry(channel, reply);
}

function tosToString(str) {
    switch (str) {
        case "TOS_TEMPORARY":
            return "account temporarily suspended";
        case "TOS_INDEFINITE":
            return "account indefinitely suspended";
        case "DEACTIVATED":
            return "account deactivated by the user";
        default:
            console.log("unknown tos_status: " + str);
            return str;
    }
}

async function userId(channel, message, username) {
    let params = splitNoEmptyNoPrefix(message);
    let target = username;
    if(params.length >= 2) {
        target = params[1].toLowerCase();
    }
    target = removeHashtag(target);
    let reply;
    let login = "";
    if(/^\d+$/.test(target)) {
        try {
            login = await uidToUsername(target);
            reply = `${target} = ${login}`;
        } catch (e) {
            reply = e;
        }
    }
    if (login === "") {
        try {
            let response = await fetch("https://api.ivr.fi/v2/twitch/user/" + target);
            if(!response.ok) {
                reply = "could not find the specified user";
            } else {
                let userInfo = await response.json();
                let uid = userInfo["id"];
                let banned = userInfo["banned"];
                let verifiedBot = userInfo["verifiedBot"];
                let tosInfo = "";
                if(banned) {
                    tosInfo = tosToString(userInfo["banReason"]);
                }
                reply = `${uid} ${banned ? '⛔ ' + tosInfo : ''} ${verifiedBot ? 'verified bot: true' : ''}`;
            }
        } catch (e) {
            reply = "Error fetching information, try again later";
        }

    }

    sendMessageRetry(channel, `@${username}, ${reply}`);
}

function asd(channel, message) {
    const reply = "Wideg WideFBCatch WideEgg"
    if(channel === "#liptongod") {
        if(message.startsWith("asd")) {
            sendMessage(channel, reply);
        }
    }
}

function massPing(channel, message) {
    let params = splitNoEmptyNoPrefix(message);
    let pingMessage = '';

    if(params.length >= 2) {
        params.shift();
        pingMessage = params.join(' ');
    }

    try {
        for(let c of channelsChatters[channel]) {
            sendMessageRetry(channel, `@${c} ${pingMessage}`)
        }
    } catch (e) {
        console.error(e);
        sendMessageRetry(channel, "Error fetching the chatter list...");
    }
}

function whereIsHack(channel) {
    sendMessageRetry(channel, `HackMagic last typed in chat ${prettyMs(Date.now() - lastMessage)} ago.`);
}

async function logsSize(channel, channelName) {
    if(channelName === "channel") {
        channelName = channel;
    }
    let logsDir = '/home/pi/backups/logs';
    if(channelName !== "") {
        try {
            let id = await usernameToId(channelName);
            logsDir += "/" + id;
            if(!existsSync(logsDir)) {
                throw "xd"; // xdddd
            }
        } catch (e) {
            console.log(e);
            sendMessageRetry(channel, "Did not find provided channel.");
            return;
        }
    }
    try {
        let bytes = parseInt(childProcess.execSync("du -s --block-size=1 " + logsDir, {'encoding': 'UTF-8'}).split("\t")[0]);
        let formattedBytes = prettyBytes(bytes, {minimumFractionDigits: 3});
        sendMessageRetry(channel, `Current logs size (updated every hour) : ${formattedBytes}`);
    } catch (e) {
        console.log(e);
    }
}
