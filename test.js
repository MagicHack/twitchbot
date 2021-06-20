const fetch = require('node-fetch');
const sfetch = require('sync-fetch');
const tmi = require('tmi.js');
const fs = require('fs');
const humanizeDuration = require('humanize-duration');

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

// Weird char in twitch messages
const blankchar = '󠀀';

const configFilePath = 'config.json';

let username = '';
let password = '';
let weatherApiKey = '';

try {
	const data = fs.readFileSync(configFilePath, 'utf8')
	configData = JSON.parse(data);
	username = configData["username"];
	password = configData["token"];
	weatherApiKey = configData["weatherKey"];
} catch (err) {
	console.error(typeof err + " " + err.message);
	console.log("Error, could not read config file. Quitting");
	return 1;
}

const donkRepliesPriority = ['g0ldfishbot', 'doo_dul', 'ron__bot']
const trusted = [ 'hackmagic' ]

const client = new tmi.Client({
	options: { debug: true, messagesLogLevel: "info" },
	connection: {
		reconnect: true,
		secure: true
	},
	identity: {
		username: username,
		password: password
	},
	channels: [ 'swushwoi', 'ron__bot', 'ron__johnson_', 'hackmagic', 'minusinsanity', 'katelynerika', 'pepto__bismol', 
	'huwobot', 'dontkermitsueside']
});

let channelsChatters = {};
let chattersRoles= {};

let lastMessageTimeStampMs = 0;
let lastSentMessage = '';

// refresh all chatters peridically
setInterval(getAllChatters, delayChatterRefresh * 1000);

client.connect().catch(console.error);
client.on('message', (channel, tags, message, self) => {
	if(self) return;
	// ignore whispers for now
	if(tags['message-type'] === 'whisper') {
		console.log("ignored whisper");
		return;
	}
	let cleanMessage = message.replace(blankchar, '').trim();

	checkIfRaid(tags, cleanMessage);
	
	if(isCommand(cleanMessage.toLowerCase(), 'ping')) {
		let timeSeconds = process.uptime();
		sendMessage(channel, `@${tags.username}, 👋 Okayeg running for ${prettySeconds(timeSeconds)}`);
	}
	if(isCommand(cleanMessage.toLowerCase(), 'code')) {
		sendMessage(channel, `@${tags.username}, lidl code is here https://github.com/MagicHack/twitchbot`);
	}
	if(isCommand(cleanMessage.toLowerCase(), 'tmi')) {
		sendMessage(channel, `@${tags.username}, tmijs docs : https://github.com/tmijs/docs/tree/gh-pages/_posts/v1.4.2`);
	}
	const singleCharReply = ['!', prefix];
	if(singleCharReply.includes(cleanMessage)) {
		sendMessage(channel, cleanMessage);
	}
	
	if(tags.username !== client.getUsername()) {
		let channelsNoPriority = [ '#pepto__bismol'];
		donkUsername = '';
		if(!channelsNoPriority.includes(channel)) {
			for(donk of donkRepliesPriority) {
				if(typeof channelsChatters[channel] !== 'undefined') {
					if(channelsChatters[channel].includes(donk)) {
						donkUsername = donk;
						break;
					}
				} else {
					console.log("chatter list not present yet");
				}
			}
		}

		if(donkUsername === '' || tags.username === donkUsername){
			if(cleanMessage.startsWith('TeaTime FeelsDonkMan')) {
				sendMessage(channel, `FeelsDonkMan TeaTime`);
			}
			if(cleanMessage.startsWith('FeelsDonkMan TeaTime')) {
				sendMessage(channel, `TeaTime FeelsDonkMan`);
			}
		}
		const newCommand = 'I made a new command HeyGuys';
		if(cleanMessage.startsWith(newCommand)) {
			sendMessage(channel, newCommand);
		}
		let sameRepliesChannel = [ '#hackmagic', '#pepto__bismol' ];
		let sameReplies = ['DinkDonk', 'YEAHBUTBTTV', 'TrollDespair', 'MODS', 'monkaE', 'POGGERS', 'VeryPog', 
		'MegaLUL FBBlock', 'hackerCD', ':)'];
		if(sameRepliesChannel.includes(channel)) {
			for(reply of sameReplies) {
				if(cleanMessage.startsWith(reply)) {
					sendMessage(channel, reply);
					break;
				}
			}
		}
		
		if(trusted.includes(tags.username) && isCommand(cleanMessage.toLowerCase(), 'say ')) {
			sendMessage(channel, cleanMessage.substring(5));
		}
		if(isCommand(cleanMessage.toLowerCase(), 'players ')) {

			let game = cleanMessage.substring('&players '.length).trim();
			if(game.length > 0) {
				getPlayers(game, trusted.includes(tags.username)).then((response) => {
					if(channel === "#swushwoi") {
						response = response.replace(/https:\/\/.*/, '');
					}
					sendMessageRetry(channel, response);
				})
			}
		}

		if(trusted.includes(tags.username)) {
			if(isCommand(cleanMessage, "setprefix")) {
				const args = cleanMessage.split(' ');
				if(args[1] !== '') {
					prefix = args[1];
					sendMessageRetry(channel, "Changed bot prefix to " + prefix);
				} else {
					sendMessageRetry(channel, "Can't set empty prefix FeelsDankMan");
				}
			}
			// whisper, todo
			if(cleanMessage.startsWith('&w ')) {
				// = cleanMessage.substring(3).split(' ');
			}
			if(isCommand(cleanMessage.toLowerCase(), 'eval ')) {
				console.log("Eval monkaGIGA");
				try {
					let result = String(eval('(' + cleanMessage.substring('&eval '.length) + ')'));
					sendMessageRetry(channel, result);
				  } catch (e) {
					console.error(e.message);
					sendMessageRetry(channel, "Eval failed, check console for details.");
				  }
			}
			if(isCommand(cleanMessage.toLowerCase(), 'quit')) {
				console.log("Received quit command, bye Sadge");
				sendMessageRetry(channel, 'Quitting PepeHands');
				setTimeout(process.exit, 1500);
			}
			if(isCommand(cleanMessage.toLowerCase(), 'kill')) {
				console.log("Received kill command, quitting now.");
				process.exit();
			}
			if(isCommand(cleanMessage.toLowerCase(), 'supamodpyramid ')) {
				let args = cleanMessage.substring('&supamodpyramid '.length).split(' ');
				console.log('pyramid args : ' + String(args))
				try {
					let size = parseInt(args[0]);
					let emote = args[1];
					if(emote.trim() !== '' && size > 1) {
						let emoteSpace = emote.trim() + " ";
						for(let i = 1; i < size; i++) {
							sendMessageRetry(channel, emoteSpace.repeat(i));
						}
						for(let i = size; i > 0; i--) {
							sendMessageRetry(channel, emoteSpace.repeat(i));
						}
					}
				} catch(e) {
					console.log("Error while parsing supamodpyramid");
				    console.error(typeof e + " : " + e.message);
				}
			}
		}

		if(tags.emotes !== null) {
			channelEmotes(Object.keys(tags.emotes)).then((res) => {
				let cemotes = res;
				if(cemotes.length > 0) {
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
	
	let elapsedTime = (Date.now() - lastTS) / 1000;

	return new Promise((resolve, reject) => {
		let settings = { method: "Get" };
		if(elapsedTime > cooldown || trusted) {
			lastTS = Date.now();
			fetch(apiUrl + game, settings)
			.then(res => res.text())
			.then((text) => {
				return resolve(text);
			}).catch((error) => {
				console.error("Failed to get player info from steamapi");
				console.error(typeof error + " " + error.message);
				// Idk, maybe we should reject eShrug
				return resolve("Error fetching steam players info")
			});
		}
		else {
			return resolve("Command on cooldown, wait " + (cooldown - elapsedTime).toFixed(2) + "s")
		}
	});
}

client.on("join", (channel, username, self) => {
	if(typeof channelsChatters[channel] === 'undefined') {
		getChatters(channel);
	}
});

function checkIfRaid(tags, message) {
	let notifyChannels = ['#minusinsanity', '#hackmagic'];
	let peopleToNotify = [ 'hackmagic', 'prog0ldfish', 'yung_randd'];
	if(tags.username === 'huwobot') {
		if(/A Raid Event at Level \[[0-9]+\] has appeared./.test(message)) {
			console.log("Raid detected");
			for(notifyChannel of notifyChannels) {
				let notifMessage = '';
				for(p of peopleToNotify) {
					if(channelsChatters[notifyChannel].includes(p)) {
						notifMessage += ' @' + p ;
					}
				}
				if(notifMessage.length !== 0) {
					sendMessageRetry(notifyChannel, 'DinkDonk +join' + notifMessage);
				} else {
					console.log("No one to notify Sadge");
				}
			}
		}
	}
}

// Retries to send messages if they fail
function sendMessageRetry(channel, message) {
	if(!sendMessage(channel, message)) {
		// retry after 300ms
		setTimeout(sendMessageRetry, 300, channel, message);
	}
}

// We assume normal bucket is full on start, maybe we it should be mod bucket?
let sentMessagesTS = new Array(Math.round(rateLimitMessages/2)).fill(Date.now());

function sendMessage(channel, message) {
	const charLimit = 500;
	// TODO implement banphrase api

	// We implement rate limit as a sliding window, 
	// (last refill is now - 30seconds) to never go over the limit
	// We remove timestamps older then 30 second (+1 for safety margin)
	sentMessagesTS = sentMessagesTS.filter(ts => Date.now() - ts < (30 + 1) * 1000);
	let messageCounter = sentMessagesTS.length;

	let modSpamChannels = [ '#pepto__bismol' ]

	let isMod = false;
	if(typeof chattersRoles[channel].chatters.moderators !== 'undefined') {
		isMod = chattersRoles[channel].chatters.moderators.includes(client.getUsername());
	} else {
		console.log("Couldn't check role");
	}

	let modSpam = false;

	let currentRate = rateLimitDelay;
	let currentLimit = rateLimitMessages;

	if(isMod) {
		console.log("using mod rate limit");
		currentRate = rateLimitDelayMod;
		currentLimit = rateLimitMessagesMod;

		if(modSpamChannels.includes(channel)) {
			modSpam = true;
			console.log("Mod spam enabled TriHard");
		}
	}

	if(!modSpam && Date.now() - lastMessageTimeStampMs < currentRate * 1000) {
		// We send messages at most every 30s/ratelimit, another mesure to not go over the rate limit
		// except in channel where mod spam is enabled.
		console.log("Dropped message cause we are sending too fast");
		return false;
	} else {
		console.log("Current message counter is : " + messageCounter);

		if(messageCounter >= currentLimit - 1) {
			// 1 message buffer monkaGIGA...
			console.log("Dropped message cause we are approching max number of message every 30s");
			return false;
		}
		// We add the current timestamp to the sliding window
		sentMessagesTS.push(Date.now());
		lastMessageTimeStampMs = Date.now();

		// Add random char after to not trigger same message rejection
		if(lastSentMessage === message) {
			message += ' ' + blankchar;
		}
		lastSentMessage = message;
		if(message.length > charLimit) {
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
	for(i in channels) {
		cDelay = i * delay;
		console.log("Updating chatters for " + channels[i] + " in " + cDelay.toFixed(2) + "s");
		setTimeout(getChatters, cDelay * 1000, channels[i]);
	}
}

function getChatters(channelName) {
	console.log("Updating chatter list for " + channelName);
	let url = `https://tmi.twitch.tv/group/user/${channelName.substring(1)}/chatters`

	let settings = { method: "Get" };
	let chatters = []
	fetch(url, settings)
	.then(res => res.json())
	.then((json) => {
		// console.log(json);
		// do something with JSON
		for(c of json.chatters.broadcaster) {
			chatters.push(c);
		}
		for(c of json.chatters.vips) {
			chatters.push(c);
		}
		for(c of json.chatters.moderators) {
			chatters.push(c);
		}
		for(c of json.chatters.staff) {
			chatters.push(c);
		}
		for(c of json.chatters.global_mods) {
			chatters.push(c);
		}
		for(c of json.chatters.admins) {
			chatters.push(c);
		}
		for(c of json.chatters.viewers) {
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

	// TODO : cache emote results for at least 30 minutes (api refresh rate) to not abuse the api
	let apiUrl = 'https://api.twitchemotes.com/api/v4/emotes?id='
	for(e of emotes) {
		apiUrl += e + ','
	}
	return new Promise((resolve, reject) => {
		let channels = [];
		let settings = { method: "Get" };
		fetch(apiUrl, settings)
		.then(res => res.json())
		.then((json) => {
			for(e of json) {
				if(e['channel_name'] !== null) {
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
	return message.startsWith(prefix + command);
}
