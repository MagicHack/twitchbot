const fetch = require('node-fetch');
const sfetch = require('sync-fetch');
const tmi = require('tmi.js');
const fs = require('fs');
const humanizeDuration = require('humanize-duration');
const Push = require('pushover-notifications');
const momentTZ = require('moment-timezone');
const moment = require("moment");

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
let peopleToNotify = [];
try {
    peopleToNotify = readDataJson(RAID_FILE);
    console.log("Successfully read ping file");
} catch (e) {
    console.log(e);
}

const IGNORE_FILE = 'ignore.json';
let peopleToIgnore = [];
try {
    peopleToIgnore = readDataJson(IGNORE_FILE);
    console.log("Successfully read ignore file");
} catch (e) {
    console.log(e);
}



// channel where we can mod/vip spam
let modSpamChannels = ['#pepto__bismol', "#sunephef", "#hackmagic"];

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
    username = configData["username"];
    password = configData["token"];
    weatherApiKey = configData["weatherKey"];
    pushoverToken = configData["ptoken"];
    pushoverUser = configData["puser"];
} catch (err) {
    console.error(typeof err + " " + err.message);
    console.log("Error, could not read config file. Quitting");
    return 1;
}


const donkRepliesPriority = ['g0ldfishbot', 'doo_dul', 'ron__bot']
const trusted = ['hackmagic']

const pushover = new Push({user: pushoverUser, token: pushoverToken});

const client = new tmi.Client({
    options: {debug: true, messagesLogLevel: "info"},
    connection: {
        reconnect: true,
        secure: true
    },
    identity: {
        username: username,
        password: password
    },
    channels: ['ron__bot', 'pepto__bismol', 'hackmagic', 'swushwoi', 'minusinsanity', 'ron__johnson_', 'katelynerika',
        'huwobot', 'dontkermitsueside', 'prog0ldfish', 'ryuuiro', 'yung_randd', 'sunephef', 'schooleo', 'illyaow',
        'qu0te_if_forsen_threw', 'benjxxm']
});

let channelsChatters = {};
let chattersRoles = {};

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
    if(bans.length > lastBanCount) {
        if(Date.now() - lastBanSaveTs > 30 * 1000) {
            lastBanCount = bans.length;
            lastBanSaveTs = Date.now();
            saveDataJson(bans, "bans.json");
        }
    }
}

client.on("ban", (channel, username, reason, userstate) => {
    // Log all bans
    let user = {channel : channel, username : username, ts : Date.now()};
    bans.push(user);
});

client.on('message', (channel, tags, message, self) => {
    if (self) return;
    // ignore whispers for now
    if (tags['message-type'] === 'whisper') {
        console.log("ignored whisper");
        return;
    }

    if(peopleToIgnore.includes(tags.username.toLowerCase())) {
        return;
    }

    // Anti weeb tech
    if (channel === "#pepto__bismol") {
        timeouts(channel, tags.username);
    }

    let cleanMessage = message.replace(blankchar, '').trim();

    checkIfRaid(tags, cleanMessage);
    phoneNotifications(channel, cleanMessage, tags);
    moderation(channel, tags, cleanMessage);

    if (isCommand(cleanMessage.toLowerCase(), 'ping')) {
        let timeSeconds = process.uptime();
        sendMessage(channel, `@${tags.username}, 👋 Okayeg running for ${prettySeconds(timeSeconds)}`);
    }
    if (isCommand(cleanMessage.toLowerCase(), 'code')) {
        sendMessage(channel, `@${tags.username}, lidl code is here https://github.com/MagicHack/twitchbot`);
    }
    if (isCommand(cleanMessage.toLowerCase(), 'tmi')) {
        sendMessage(channel, `@${tags.username}, tmijs docs : https://github.com/tmijs/docs/tree/gh-pages/_posts/v1.4.2`);
    }
    const singleCharReply = ['!', prefix];
    if (singleCharReply.includes(cleanMessage)) {
        sendMessage(channel, cleanMessage);
    }

    if (tags.username !== client.getUsername()) {
        let channelsNoPriority = ['#pepto__bismol'];
        donkUsername = '';
        if (!channelsNoPriority.includes(channel)) {
            for (donk of donkRepliesPriority) {
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

        if (donkUsername === '' || tags.username === donkUsername) {
            if (cleanMessage.startsWith('TeaTime FeelsDonkMan')) {
                sendMessage(channel, `FeelsDonkMan TeaTime`);
            }
            if (cleanMessage.startsWith('FeelsDonkMan TeaTime')) {
                sendMessage(channel, `TeaTime FeelsDonkMan`);
            }
        }
        const newCommand = 'I made a new command HeyGuys';
        if (cleanMessage.startsWith(newCommand)) {
            sendMessage(channel, newCommand);
        }
        let sameRepliesChannel = ['#hackmagic', '#pepto__bismol'];
        let sameReplies = ['DinkDonk', 'YEAHBUTBTTV', 'TrollDespair', 'MODS', 'monkaE', 'POGGERS', 'VeryPog',
            'MegaLUL FBBlock', 'hackerCD', ':)'];
        if (sameRepliesChannel.includes(channel)) {
            for (reply of sameReplies) {
                if (cleanMessage.startsWith(reply)) {
                    sendMessage(channel, reply);
                    break;
                }
            }
        }

        if (trusted.includes(tags.username) && isCommand(cleanMessage.toLowerCase(), 'say ')) {
            sendMessage(channel, cleanMessage.substring(5));
        }
        if (isCommand(cleanMessage.toLowerCase(), 'players ')) {

            let game = cleanMessage.substring('&players '.length).trim();
            if (game.length > 0) {
                getPlayers(game, trusted.includes(tags.username)).then((response) => {
                    sendMessageRetry(channel, response);
                })
            }
        }
        if (isCommand(cleanMessage.toLowerCase(), 'raidping')) {
            raidPing(channel, tags.username);
        } else if (isCommand(cleanMessage.toLowerCase(), 'raidunping')) {
            raidUnPing(channel, tags.username);
        } else if (isCommand(cleanMessage.toLowerCase(), 'help') || isCommand(cleanMessage.toLowerCase(),
            'command') || isCommand(cleanMessage.toLowerCase(), 'commands')) {
            help(channel, tags.username);
        } else if (isCommand(cleanMessage.toLowerCase(), "flashbang5")) {
            let amount = 1;
            try {
                amount = parseInt(cleanMessage.split(" ")[1]);
            } catch (e) {
                console.log("Error while parsing flashbang");
                console.log(e);
            }
            flashbang(channel, tags, amount, "KartComback");
        } else if (isCommand(cleanMessage.toLowerCase(), "flashbang4")) {
            let amount = 1;
            try {
                amount = parseInt(cleanMessage.split(" ")[1]);
            } catch (e) {
                console.log("Error while parsing flashbang");
                console.log(e);
            }
            flashbang(channel, tags, amount, "NothingHere");
        } else if (isCommand(cleanMessage.toLowerCase(), "flashbang3")) {
            let amount = 1;
            try {
                amount = parseInt(cleanMessage.split(" ")[1]);
            } catch (e) {
                console.log("Error while parsing flashbang");
                console.log(e);
            }
            flashbang(channel, tags, amount, "GotCaughtTrolling");
        } else if (isCommand(cleanMessage.toLowerCase(), "flashbang2")) {
            let amount = 1;
            try {
                amount = parseInt(cleanMessage.split(" ")[1]);
            } catch (e) {
                console.log("Error while parsing flashbang");
                console.log(e);
            }
            flashbang(channel, tags, amount, "bruhFAINT");
        } else if (isCommand(cleanMessage.toLowerCase(), "flashbang")) {
            let amount = 1;
            try {
                amount = parseInt(cleanMessage.split(" ")[1]);
            } catch (e) {
                console.log("Error while parsing flashbang");
                console.log(e);
            }
            flashbang(channel, tags, amount, "FreePoggersEmote");
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
        } else if (isCommand(cleanMessage.toLowerCase(), "progress") ||
            isCommand(cleanMessage.toLowerCase(), "forsendespair") ||
            isCommand(cleanMessage.toLowerCase(), "peptobprogress") ||
            isCommand(cleanMessage.toLowerCase(), "fallking")) {
            progress(channel).then();
        }
        if (trusted.includes(tags.username) || isMod(tags, channel)) {
            const maxSize = 50;
            if (isCommand(cleanMessage.toLowerCase(), 'supamodpyramid ')) {
                let args = cleanMessage.substring('&supamodpyramid '.length).split(' ');
                console.log('pyramid args : ' + String(args))
                try {
                    let size = parseInt(args[0]);
                    let emote = args[1];
                    if(size > maxSize) {
                        size = maxSize;
                    }
                    if (emote.trim() !== '' && size > 1) {
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
            }
        }


        if (trusted.includes(tags.username)) {
            if(isCommand(cleanMessage, "runlist")) {
                runList(channel, tags, cleanMessage);
            }
            if(isCommand(cleanMessage, "clear")) {
                const numberOfMessages = messageQueue.length;
                messageQueue = [];
                console.log("Cleared message queue : " + numberOfMessages + " messages");
                sendMessageRetry(channel, "@" + tags.username + " cleared queue of " + numberOfMessages + " messages");
            }
            if(isCommand(cleanMessage, 'queue')) {
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
                console.log("Eval monkaGIGA");
                try {
                    let result = String(eval('(' + cleanMessage.substring('&eval '.length) + ')'));
                    sendMessageRetry(channel, result);
                } catch (e) {
                    console.error(e.message);
                    sendMessageRetry(channel, "Eval failed, check console for details.");
                }
            }
            if (isCommand(cleanMessage.toLowerCase(), 'quit')) {
                console.log("Received quit command, bye Sadge");
                sendMessageRetry(channel, 'Quitting PepeHands');
                setTimeout(process.exit, 1500);
            }
            if (isCommand(cleanMessage.toLowerCase(), 'kill')) {
                console.log("Received kill command, quitting now.");
                process.exit();
            }
        }

        if (tags.emotes !== null) {
            channelEmotes(Object.keys(tags.emotes)).then((res) => {
                let cemotes = res;
                if (cemotes.length > 0) {
                    console.log(cemotes);
                }
                /*
                if(channel === '#ron__bot') {
                    sendMessageRetry(channel, String(cemotes));
                }
                if(channel === '#swushwoi' && cemotes.includes('xqcow')) {
                    sendMessageRetry(channel, "MODS xqc emote detected MrDestructoid");
                }
                */
            })
        }
    }
});

let lastTS = Date.now();

function getPlayers(game, trusted) {
    const cooldown = 15;
    const apiUrl = "https://api.magichack.xyz/steam/players/pajbot/";
    const url = apiUrl + encodeURIComponent(game);
    let elapsedTime = (Date.now() - lastTS) / 1000;

    return new Promise((resolve, reject) => {
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

client.on("join", (channel, username, self) => {
    if (typeof channelsChatters[channel] === 'undefined') {
        getChatters(channel);
    }
});

function checkIfRaid(tags, message) {

    // How many chars to split a message
    const MAX_CHARS = 500;
    let notifyChannels = ['#minusinsanity', '#hackmagic', '#benjxxm'];
    if (tags.username === 'huwobot') {
        let raidBeginRE = /A Raid Event at Level \[([0-9]+)] has appeared./;
        let raidLostRE = /\d+ users? failed to beat the raid level \[\d+] - No experience rewarded!/;
        let raidWonRE = /\d+ users beat the raid level \[\d+] - (\d+) experience rewarded!/;
        let matchBegin = raidBeginRE.exec(message);
        let matchLost = raidLostRE.exec(message);
        let matchWon = raidWonRE.exec(message);
        if (matchBegin !== null) {
            console.log("Raid detected");
            // Notify me of a raid if I have my chat open
            if (channelsChatters["#hackmagic"].includes('hackmagic')) {
                sendNotification("Join raid DinkDonk !!");
            }
            for (let notifyChannel of notifyChannels) {
                let baseMessage = 'DinkDonk +join (raid lvl ' + matchBegin[1] + ') ';
                let notifMessage = baseMessage;
                for (let p of peopleToNotify) {
                    // Send and create a new message when it's too long
                    if (notifMessage.length + p.length >= MAX_CHARS) {
                        sendMessageRetryPriority(notifyChannel, notifMessage);
                        notifMessage = baseMessage;
                    }
                    notifMessage += ' @' + p;
                }
                if (notifMessage.length !== 0) {
                    sendMessageRetryPriority(notifyChannel, notifMessage);
                } else {
                    console.log("No one to notify Sadge");
                }
            }
        } else if (matchLost !== null) {
            console.log("Raid lost");
            for (let notifyChannel of notifyChannels) {
                sendMessageRetry(notifyChannel, "Raid L OMEGALULiguess ST");
            }
        } else if (matchWon !== null) {
            console.log("Raid won");
            for (let notifyChannel of notifyChannels) {
                sendMessageRetry(notifyChannel, "Raid W PagMan N (+" + matchWon[1] + "xp)");
            }
        }
    }
}

// Puts messages at the start of the queue
function sendMessageRetryPriority(channel, message) {
    messagePriorityQueue.push({channel : channel, message : message});
    sendMessageRetry(channel, '');
}

let timerHandle = null;
// Retries to send messages if they fail
function sendMessageRetry(channel, message) {
    let currentQueue = messageQueue;
    if(message !== '') {
        currentQueue.push({channel : channel, message : message});
        // console.log("Queue length : " + messageQueue.length);
    }
    if(messagePriorityQueue.length > 0) {
        currentQueue = messagePriorityQueue;
    }
    if(currentQueue.length > 0) {
        let messageToSend = currentQueue[0];
        if(timerHandle === null) {
            console.log("Starting interval for sending messages");
            timerHandle = setInterval(sendMessageRetry, 300, channel, '');
        }
        while(sendMessage(messageToSend.channel, messageToSend.message)) {
            currentQueue.shift();
            if(currentQueue.length > 0) {
                messageToSend = currentQueue[0];
            } else {
                break;
            }
        }
    } else {
        console.log("Stopping retry message timer, no messages in queue");
        clearInterval(timerHandle);
        timerHandle = null;
    }
}

// We assume normal bucket is full on start, 30 seconds before being able to send messages on startup
let sentMessagesTS = new Array(Math.round(rateLimitMessagesMod)).fill(Date.now());
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
    if (typeof chattersRoles[channel].chatters.moderators !== 'undefined') {
        isMod = chattersRoles[channel].chatters.moderators.includes(client.getUsername());
    } else {
        console.log("Couldn't check role");
    }

    if (typeof chattersRoles[channel].chatters.vips !== 'undefined') {
        isVip = chattersRoles[channel].chatters.vips.includes(client.getUsername());
    } else {
        console.log("Couldn't check role");
    }

    let modSpam = false;

    let currentRate = rateLimitDelay;
    let currentLimit = rateLimitMessages;

    if (isMod || isVip) {
        if(logSendMessages) {
            console.log("using mod/vip rate limit");
        }
        currentRate = rateLimitDelayMod;
        currentLimit = rateLimitMessagesMod;

        if (modSpamChannels.includes(channel)) {
            modSpam = true;
            if(logSendMessages) {
                console.log("Mod spam enabled TriHard");
            }
        }
    }

    if (!modSpam && Date.now() - lastMessageTimeStampMs < currentRate * 1000) {
        // We send messages at most every 30s/ratelimit, another mesure to not go over the rate limit
        // except in channel where mod spam is enabled.
        if(logSendMessages) {
            console.log("Dropped message cause we are sending too fast");
        }
        return false;
    } else {
        if(logSendMessages) {
            console.log("Current message counter is : " + messageCounter);
        }

        if (messageCounter >= currentLimit - 1) {
            // 1 message buffer monkaGIGA...
            if(logSendMessages) {
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
    console.log("Dispatching chatters updates");

    let channels = client.getChannels();
    // channels.forEach(getChatters);
    // delay each channel refresh to space them out in the delay
    let delay = delayChatterRefresh / channels.length;
    for (i in channels) {
        cDelay = i * delay;
        console.log("Updating chatters for " + channels[i] + " in " + cDelay.toFixed(2) + "s");
        setTimeout(getChatters, cDelay * 1000, channels[i]);
    }
}

function getChatters(channelName) {
    console.log("Updating chatter list for " + channelName);
    let url = `https://tmi.twitch.tv/group/user/${channelName.substring(1)}/chatters`

    let settings = {method: "Get"};
    let chatters = []
    fetch(url, settings)
        .then(res => res.json())
        .then((json) => {
            // console.log(json);
            // do something with JSON
            for (c of json.chatters.broadcaster) {
                chatters.push(c);
            }
            for (c of json.chatters.vips) {
                chatters.push(c);
            }
            for (c of json.chatters.moderators) {
                chatters.push(c);
            }
            for (c of json.chatters.staff) {
                chatters.push(c);
            }
            for (c of json.chatters.global_mods) {
                chatters.push(c);
            }
            for (c of json.chatters.admins) {
                chatters.push(c);
            }
            for (c of json.chatters.viewers) {
                chatters.push(c);
            }
            channelsChatters[channelName] = chatters;
            chattersRoles[channelName] = json;
        }).catch((error) => {
        console.error("Failed to get chatters list from tmi");
        console.error(typeof error + " " + error.message);
    });
}

function prettySeconds(seconds) {
    // return a formatted string days, hours, minutes, seconds
    return humanizeDuration(Math.round(seconds) * 1000);
}

function channelEmotes(emotes) {
    // check which channels emotes come from and return them

    // TODO : scrap this code or replace it since api dead
    let apiUrl = 'https://api.twitchemotes.com/api/v4/emotes?id='
    for (let e of emotes) {
        apiUrl += e + ','
    }
    return new Promise((resolve, reject) => {
        let channels = [];
        let settings = {method: "Get"};
        fetch(apiUrl, settings)
            .then(res => res.json())
            .then((json) => {
                for (e of json) {
                    if (e['channel_name'] !== null) {
                        channels.push(e['channel_name']);
                    }
                }
                return resolve(channels);
            }).catch((error) => {
            console.error("Failed to get emote info from twitchemotes api");
            console.error(typeof error + " " + error.message);
            // Idk, maybe we should reject eShrug
            return resolve(channels);
        });
    });
}

function isCommand(message, command) {
    return message.startsWith(prefix + command) || message.startsWith(prefix + ' ' + command);
}

function raidPing(channel, user) {
    const index = peopleToNotify.indexOf(user);
    if (index === -1) {
        peopleToNotify.push(user);
        try {
            saveDataJson(peopleToNotify, RAID_FILE);
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
    const index = peopleToNotify.indexOf(user);
    if (index !== -1) {
        peopleToNotify.splice(index, 1);
        try {
            saveDataJson(peopleToNotify, RAID_FILE);
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
    const helpText = "&raidping to get notified of raids, &players to check the current online player count of a steam game."
    sendMessageRetry(channel, `@${user}, ${helpText}`);
}

let lastMessage = Date.now();

function phoneNotifications(rawChannel, message, user) {
    // Time with no message before a it sends a ping
    const afkTime = 15;

    let channel = rawChannel;
    let username = user.username;
    let displayName = user['display-name'];

    // Ignore a possible ping if not afk
    if (user.username === 'hackmagic') {
        lastMessage = Date.now();
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
    const noPingChannels = ['forsen', 'huwobot'];
    const pingRE = [/hackmagic/i, /(?<![a-z])hack(?![a-z])/i, /(?<![a-z])magic(?![a-z])/i]

    if (!noPingChannels.includes(channel)) {
        for (let exp of pingRE) {
            if (exp.test(message)) {
                sendNotification(`[${rawChannel}] ${displayName}: ${message}`)
                break;
            }
        }
    }
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

function flashbang(channel, user, amount, text) {
    let enabledChannels = ["#pepto__bismol", "#ryuuiro", '#sunephef'];
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

function isMod(user, channel) {
    let chan = channel;
    if (channel.startsWith("#")) {
        chan = channel.substring(1);
    }
    return user.mod || user.username === chan;
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
    if (!result.ok) {
        throw new Error("Response code not 2xx api");
    }
    let elapsed = Date.now() - start;
    console.log("pinged " + url + "in " + elapsed + "ms");
    return elapsed;
}

async function progress(channel) {
    sendMessageRetry(channel, "@forsen the god gamer 100%");
}

function moderation(channel, tags, message) {
    const hossRe = /\b@?([h]+[0o]+[s]+[t_]*[o0-9]+\S*)\b/gi;
    let enableChannels = ['#hackmagic', '#pepto__bismol'];
    if(!enableChannels.includes(channel)) {
        return;
    }
    // hoss bots follows annouced by streamelements
    if(tags.username === "streamelements") {
        let match = hossRe.exec(message);
        if(match !== null) {
            let user = match[1];
            sendMessageRetry(channel, "/ban " + user + " automated bot ban");
        }
    } else if (tags.username === "doo_dul") {
        if(/has followed/gi.test(message)) {
            let match = hossRe.exec(message);
            if(match !== null) {
                let user = match[1];
                sendMessageRetry(channel, "/ban " + user + " automated bot ban");
            }
        }
    }
}

function runList(channel, tags, message) {
    if(!trusted.includes(tags.username)) {
        console.log("ERROR untrusted user tried to run a list " + tags.username);
        return;
    }
    console.log("Start of runlist, invocation : " + message + " by " + tags.username);
    let params = message.split(" ");
    if(params.length >= 2 && params[1].length !== 0) {
        let path = params[1];
        let lines = [];
        try {
            let data = fs.readFileSync(path, 'utf8');
            lines = data.split('\n');
        } catch (e) {
            console.log(e);
            sendMessageRetry(channel, String(e));
        }
        if(params.length >= 3 && params[2].length !== 0) {
            let command = "";
            let reason = " automated ban";
            if(params[2] === 'name' || params[2] === 'names') {
                command = "/ban ";
                if(params >= 4 && params[3].length !== 0) {
                    reason = " " + params[3];
                }
            }
            lines = lines.map(l => command + l + reason);
        }
        console.log("Running " + lines.length + " lines in the list");
        if(lines.length > 0) {
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

function timeouts(channel, username) {
    try {
        let timeout = timeoutList.find(user => user.username === username);
        if(timeout !== undefined) {
            if(Math.random() <= timeout.probability) {
                sendMessageRetryPriority(channel, `/timeout ${timeout.username} ${timeout.duration} ${timeout.reason}`);
            }
        }
    } catch (e) {
        console.log(e);
    }
}
