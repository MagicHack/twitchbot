const fetch = require('node-fetch');
const sfetch = require('sync-fetch');
const tmi = require('tmi.js');
const fs = require('fs');
const humanizeDuration = require('humanize-duration');
const Push = require('pushover-notifications');
const momentTZ = require('moment-timezone');
const moment = require("moment");

const seventv = require('./7tv.js');

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
readRaidPingFile();

// Weird char in twitch messages
const blankchar = '󠀀';
let sunTimeoutChance = 0.5;
let fishTimeoutChance = 0.5;

const configFilePath = 'config.json';

let username = '';
let password = '';
let weatherApiKey = '';


let pushoverToken = '';
let pushoverUser = '';
let ignoreUsersPing = [];
const IGNORE_PING_FILE = 'ignorePings.json';
readIgnorePingFile();


try {
    const data = fs.readFileSync(configFilePath, 'utf8')
    configData = JSON.parse(data);
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
    channels: ['swushwoi', 'ron__bot', 'ron__johnson_', 'hackmagic', 'minusinsanity', 'katelynerika', 'pepto__bismol',
        'huwobot', 'dontkermitsueside', 'prog0ldfish', 'ryuuiro', 'yung_randd', 'sunephef']
});

let channelsChatters = {};
let chattersRoles = {};

let lastMessageTimeStampMs = 0;
let lastSentMessage = '';

// refresh all chatters peridically
setInterval(getAllChatters, delayChatterRefresh * 1000);

client.connect().catch(console.error);
client.on('message', (channel, tags, message, self) => {
    if (self) return;
    // ignore whispers for now
    if (tags['message-type'] === 'whisper') {
        console.log("ignored whisper");
        return;
    }

    // Anti weeb tech
    if (channel === "#pepto__bismol") {
        if (tags.username === "sunephef") {
            if (Math.random() < sunTimeoutChance) {
                sendMessageRetry(channel, "/timeout " + tags.username + " 1 silence weeb simp furry NaM");
            }
        } else if (tags.username === "sunwithnofaceclap") {
            sendMessageRetry(channel, "/timeout " + tags.username + " 1 silence weeb simp furry NaM , alt detected MODS");
        } else if(tags.username === "prog0ldfish") {
            if(Math.random() < fishTimeoutChance) {
                sendMessageRetry(channel, "/timeout " + tags.username + " 1 silence pinger WeirdChamp");
            }
        } else if(tags.username === "prog0idfish") {
            sendMessageRetry(channel, "/timeout " + tags.username + " 1 MODS alt detected");
        }
    }

    let cleanMessage = message.replace(blankchar, '').trim();

    checkIfRaid(tags, cleanMessage);
    phoneNotifications(channel, cleanMessage, tags);

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
                    if (channel === "#swushwoi") {
                        response = response.replace(/https:\/\/.*/, '');
                    }
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
        } else if (isCommand(cleanMessage.toLowerCase(), "flashbang3")) {
            let amount = 1;
            try {
                amount = parseInt(cleanMessage.split(" ")[1]);
            } catch (e) {
                console.log("Error while parsing flashbang");
                console.log(e);
            }
            flashbang(channel, tags, amount, "GotCaughtTrolling");
        } else if (isCommand(cleanMessage.toLowerCase(), "flashbang4")) {
            let amount = 1;
            try {
                amount = parseInt(cleanMessage.split(" ")[1]);
            } catch (e) {
                console.log("Error while parsing flashbang");
                console.log(e);
            }
            flashbang(channel, tags, amount, "NothingHere");
        } else if (isCommand(cleanMessage.toLowerCase(), "flashbang2")) {
            let amount = 1;
            try {
                amount = parseInt(cleanMessage.split(" ")[1]);
            } catch (e) {
                console.log("Error while parsing flashbang");
                console.log(e);
            }
            flashbang(channel, tags, amount, "bruhFAINT");
        } else if (isCommand(cleanMessage.toLowerCase(), "supaflashbang")) {
            let amount = 1;
            try {
                amount = parseInt(cleanMessage.split(" ")[1]);
            } catch (e) {
                console.log("Error while parsing flashbang");
                console.log(e);
            }
            flashbang(channel, tags, amount, "GotCaughtTrolling FreePoggersEmote bruhFAINT");
        } else if (isCommand(cleanMessage.toLowerCase(), "flashbang")) {
            let amount = 1;
            try {
                amount = parseInt(cleanMessage.split(" ")[1]);
            } catch (e) {
                console.log("Error while parsing flashbang");
                console.log(e);
            }
            flashbang(channel, tags, amount, "FreePoggersEmote");
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
            if (isCommand(cleanMessage.toLowerCase(), 'supamodpyramid ')) {
                let args = cleanMessage.substring('&supamodpyramid '.length).split(' ');
                console.log('pyramid args : ' + String(args))
                try {
                    let size = parseInt(args[0]);
                    let emote = args[1];
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
    const MAX_CHARS = 400;
    let notifyChannels = ['#minusinsanity', '#hackmagic'];
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
                        sendMessageRetry(notifyChannel, notifMessage);
                        notifMessage = baseMessage;
                    }
                    notifMessage += ' @' + p;
                }
                if (notifMessage.length !== 0) {
                    sendMessageRetry(notifyChannel, notifMessage);
                } else {
                    console.log("No one to notify Sadge");
                }
            }
        } else if (matchLost !== null) {
            console.log("Raid lost");
            for (notifyChannel of notifyChannels) {
                sendMessageRetry(notifyChannel, "Raid L OMEGALULiguess ST");
            }
        } else if (matchWon !== null) {
            console.log("Raid won");
            for (notifyChannel of notifyChannels) {
                sendMessageRetry(notifyChannel, "Raid W PagMan N (+" + matchWon[1] + "xp)");
            }
        }
    }
}

// Retries to send messages if they fail
function sendMessageRetry(channel, message) {
    if (!sendMessage(channel, message)) {
        // retry after 300ms
        setTimeout(sendMessageRetry, 300, channel, message);
    }
}

// We assume normal bucket is full on start, 30 seconds before being able to send messages on startup
let sentMessagesTS = new Array(Math.round(rateLimitMessagesMod)).fill(Date.now());

function sendMessage(channel, message) {
    const charLimit = 500;
    // TODO implement banphrase api

    // We implement rate limit as a sliding window,
    // (last refill is now - 30seconds) to never go over the limit
    // We remove timestamps older then 30 second (+1 for safety margin)
    sentMessagesTS = sentMessagesTS.filter(ts => Date.now() - ts < (30 + 1) * 1000);
    let messageCounter = sentMessagesTS.length;

    let modSpamChannels = ['#pepto__bismol']

    let isMod = false;
    if (typeof chattersRoles[channel].chatters.moderators !== 'undefined') {
        isMod = chattersRoles[channel].chatters.moderators.includes(client.getUsername());
    } else {
        console.log("Couldn't check role");
    }

    let modSpam = false;

    let currentRate = rateLimitDelay;
    let currentLimit = rateLimitMessages;

    if (isMod) {
        console.log("using mod rate limit");
        currentRate = rateLimitDelayMod;
        currentLimit = rateLimitMessagesMod;

        if (modSpamChannels.includes(channel)) {
            modSpam = true;
            console.log("Mod spam enabled TriHard");
        }
    }

    if (!modSpam && Date.now() - lastMessageTimeStampMs < currentRate * 1000) {
        // We send messages at most every 30s/ratelimit, another mesure to not go over the rate limit
        // except in channel where mod spam is enabled.
        console.log("Dropped message cause we are sending too fast");
        return false;
    } else {
        console.log("Current message counter is : " + messageCounter);

        if (messageCounter >= currentLimit - 1) {
            // 1 message buffer monkaGIGA...
            console.log("Dropped message cause we are approching max number of message every 30s");
            return false;
        }
        // We add the current timestamp to the sliding window
        sentMessagesTS.push(Date.now());
        lastMessageTimeStampMs = Date.now();

        // Add random char after to not trigger same message rejection, mods do not have this restriction
        if (!isMod && lastSentMessage === message) {
            message += ' ' + blankchar;
        }
        lastSentMessage = message;
        if (message.length > charLimit) {
            // TODO : implement sending in multiple messages, maybe with a message queue?
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
            createRaidPingFile();
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
            createRaidPingFile();
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

function createRaidPingFile() {
    let users = {users: peopleToNotify};
    fs.writeFile(RAID_FILE, JSON.stringify(users), 'utf8', (err) => {
        if (err) throw err;
        console.log('The raid ping file has been saved!');
    });
}

function readRaidPingFile() {
    if (fs.existsSync(RAID_FILE)) {
        try {
            const data = fs.readFileSync(RAID_FILE, 'utf8');
            let userData = JSON.parse(data);
            userData['users'].forEach(user => peopleToNotify.push(user));
            console.log("Successfully read ping file");
        } catch (err) {
            console.error(typeof err + " " + err.message);
            console.error("Error, could not read raid file.");
        }
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
    const noPingChannels = ['forsen'];
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

function readIgnorePingFile() {
    if (fs.existsSync(IGNORE_PING_FILE)) {
        try {
            const data = fs.readFileSync(IGNORE_PING_FILE, 'utf8');
            let userData = JSON.parse(data);
            userData['users'].forEach(user => ignoreUsersPing.push(user));
            console.log("Successfully read ignore file");
        } catch (err) {
            console.error(typeof err + " " + err.message);
            console.error("Error, could not read ignore file.");
        }
    }
}

function removeUserIgnore(channel, username) {
    let index = ignoreUsersPing.indexOf(username);
    if (index === -1) {
        sendMessageRetry(channel, 'hackmagic, user not in list');
    } else {
        ignoreUsersPing.splice(index, 1);
        sendMessageRetry(channel, `hackmagic, removed user ${username} from ignore ping list`);
        try {
            createIgnorePingFile();
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
            createIgnorePingFile();
        } catch (e) {
            console.error(e);
        }

    } else {
        sendMessageRetry(channel, 'hackmagic, user already in list');
    }
}

function createIgnorePingFile() {
    let users = {users: ignoreUsersPing};
    fs.writeFile(IGNORE_PING_FILE, JSON.stringify(users), 'utf8', (err) => {
        if (err) throw err;
        console.log('The ignore user ping file has been saved!');
    });
}

function flashbang(channel, user, amount, text) {
    let enabledChannels = ["#pepto__bismol", "#ryuuiro"];
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
    var now = moment();
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

function getTimeZone(targetHour, currentHour) {
    let offset = -(currentHour - targetHour);
    if (Math.abs(offset) > 12) {
        let shift = 24;
        if (offset > 0) {
            offset -= shift;
        } else {
            offset += shift;
        }
    }
    return offset;
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

async function pingPajbotApi(url) {
    let testPhrase = "test";
    let start = Date.now();
    const https = "https://";
    if(!url.startsWith(https)) {
        url = https + url.trim();
    }
    let result = await fetch(url + "/api/v1/banphrases/test", {
        method: 'POST', body:
            JSON.stringify({message: testPhrase}), headers: {'Content-Type': 'application/json'}
    });
    if(!result.ok) {
        throw new Error("Response code not 2xx api");
    }
    let elapsed = Date.now() - start;
    console.log("pinged " + url + "in " + elapsed + "ms");
    return elapsed;
}

async function progress(channel) {
    let response = await fetch("https://forsenjk-default-rtdb.firebaseio.com/forsen/last.json", {});
    let data = await response.json();
    let percent = data["percent"];
    let message = "";
    if (percent > 90) {
        message = "PagMan finishing the game today";
    } else if (percent > 80) {
        message = "Don't doubt the god gamer";
    } else if (percent > 70) {
        message = "HandsUp I believe";
    } else if (percent > 60) {
        message = "Clueless lot of progress today";
    } else if (percent > 50) {
        message = "Clueless must be a max jump";
    } else if (percent > 40) {
        message = "TrollDespair progress soon";
    } else if (percent > 30) {
        message = "ZULOL never ending cycle ♻";
    } else if (percent > 20) {
        message = "TrollDespair who is forsen";
    } else if (percent > 10) {
        message = "peptobProgress";
    } else if (percent > 5) {
        message = "Almost at the bottom Mr. Fors FeelsOkayMan 👍";
    } else {
        message = "TrollDespair can't go any lower right peptobProgress";
    }
    message += " " + percent + "%";
    sendMessageRetry(channel, message);
}