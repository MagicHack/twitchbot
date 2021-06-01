const fetch = require('node-fetch');
const tmi = require('tmi.js');
const fs = require('fs');

// Number of message that can be sent every 30 seconds
const rateLimitMessages = 20; 
const rateLimitMessagesMod = 100;

// Minimum time in between messages to no go over rate limit
const rateLimitDelay = 30 / rateLimitMessages;
const rateLimitDelayMod = 30 / rateLimitMessagesMod;

// Time between chatter fetch
const delayChatterRefresh = 120;

// Weird char in twitch messages
const blankchar = '󠀀';

const configFilePath = 'config.json';

const startTimeStamp = Date.now();

let username = '';
let password = '';

try {
	const data = fs.readFileSync(configFilePath, 'utf8')
	configData = JSON.parse(data);
	username = configData["username"];
	password = configData["token"];
} catch (err) {
	console.error(err);
	console.log("Error, could not read config file. Quitting");
	return 1;
}

const donkRepliesPriority = ['ron__bot', 'g0ldfishbot', 'doo_dul']
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
	channels: [ 'swushwoi', 'ron__bot', 'ron__johnson_', 'hackmagic', 'minusinsanity', 'katelynerika', 'pepto__bismol', 'huwobot' ]
});

let channelsChatters = {};
let chattersRoles= {};

let lastMessageTimeStampMs = 0;
let lastSentMessage = '';

let lastChatterRefreshTimeStampMs = 0;

client.connect().catch(console.error);
client.on('message', (channel, tags, message, self) => {
	if(self) return;
	// refresh chatter list if needed
	getAllChatters();

	// ignore whispers for now
	if(tags['message-type'] === 'whisper') {
		console.log("ignored whisper");
		return;
	}
	let cleanMessage = message.replace(blankchar, '').trim();

	checkIfRaid(tags, cleanMessage);

	// console.log(tags);
	console.log(tags.emotes);
	
	
	if(cleanMessage.toLowerCase() === '&ping') {
		let timeSeconds = (Date.now() - startTimeStamp) / 1000;

		sendMessage(channel, `@${tags.username}, 👋 Okayeg running for ${prettySeconds(timeSeconds)}s`);
	}
	if(cleanMessage.toLowerCase() === '&code') {
		let timeSeconds = (Date.now() - startTimeStamp) / 1000;
		sendMessage(channel, `@${tags.username}, lidl code is here https://github.com/MagicHack/twitchbot`);
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
		
		if(trusted.includes(tags.username) && cleanMessage.startsWith('&say ')) {
			sendMessage(channel, cleanMessage.substring(5));
		}

		if(trusted.includes(tags.username)) {
			// whisper, todo
			if(cleanMessage.startsWith('&w ')) {
				// = cleanMessage.substring(3).split(' ');
			}
		}

		if(tags.emotes !== null) {
			channelEmotes(Object.keys(tags.emotes)).then((res) => {
				let cemotes = res;
				console.log(cemotes);
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

client.on("join", (channel, username, self) => {
	if(typeof channelsChatters[channel] === 'undefined') {
		getChatters(channel);
	}
});

function checkIfRaid(tags, message) {
	let notifyChannel = '#minusinsanity';
	let peopleToNotify = [ 'hackmagic' ];
	if(tags.username === 'huwobot') {
		if(/A Raid Event at Level \[[0-9]+\] has appeared./.test(message)) {
			console.log("Raid detected");
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

let modSpamMessageCounter = 0;
let modSpamCounterTimeStampMs = 0;

// Retries to send messages if they fail
function sendMessageRetry(channel, message) {
	if(!sendMessage(channel, message)) {
		// retry after 300ms
		setTimeout(sendMessageRetry, 300, channel, message);
	}
}

function sendMessage(channel, message) {
	// TODO implement banphrase api
	// Currently we treat the rate limit as global...
	// TODO, implement per channel and mod/vip rate limit
	let modSpamChannels = [ '#pepto__bismol' ]

	let isMod = false;
	if(typeof chattersRoles[channel].chatters.moderators !== 'undefined') {
		isMod = chattersRoles[channel].chatters.moderators.includes(client.getUsername());
	} else {
		console.log("Couldn't check role");
	}
	let modSpam = false;
	let currentRate = rateLimitDelay;

	if(isMod) {
		console.log("using mod rate limit");
		currentRate = rateLimitDelayMod;
		if(modSpamChannels.includes(channel)) {
			modSpam = true;
			console.log("Mod spam enabled TriHard");
		}
	}

	if(!modSpam && Date.now() - lastMessageTimeStampMs < currentRate * 1000) {
		console.log("Dropped message cause of rate limit Sadge");
		return false;
	} else {
		if(modSpam) {
			if(Date.now() - modSpamCounterTimeStampMs > 30 * 1000) {
				modSpamMessageCounter = 0;
				modSpamCounterTimeStampMs = Date.now();
			}
			if(modSpamMessageCounter >= rateLimitMessagesMod - 5) {
				// We keep a margin of a few messages to try to not get shadowbanned
				console.log("Dropped cause of mod rate limit Sadeg");
				return false;
			} else {
				modSpamMessageCounter++;
			}
		}
		lastMessageTimeStampMs = Date.now();
		// Add random char after to not trigger same message protection
		if(lastSentMessage === message) {
			message += ' ' + blankchar;
		}
		lastSentMessage = message;
		client.say(channel, message);
		return true;
	}
}

function getAllChatters() {
	if(Date.now() - lastChatterRefreshTimeStampMs < delayChatterRefresh * 1000) {
		return;
	}
	lastChatterRefreshTimeStampMs = Date.now();
	console.log("Updating all channel chatters");

	let channels = client.getChannels();
	console.log(channels);
	channels.forEach(getChatters);

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
	});
}

function prettySeconds(seconds) {
	// return a formatted string days, hours, minutes, seconds
	return new Date(1000 * seconds).toISOString().substr(11, 8).replace(/^[0:]+/, "");
}

function channelEmotes(emotes) {
	// check which channels emotes come from and return them
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
				channels.push(e['channel_name']);
			}
			return resolve(channels);
		})
	});
}