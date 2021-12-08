import fetch from 'node-fetch';
import 'dotenv/config'
import fs from "fs";

let url = "https://api.twitch.tv/helix/streams";
const tokenFile = "token.txt";

let token = "";

try {
    token = loadTokenFromFile();
} catch (e) {
    console.log("Could not get token from file, getting one from twitch");
    token = await getAuthToken();
}

function loadTokenFromFile() {
    let data = fs.readFileSync(tokenFile, 'utf8');
    return JSON.parse(data);
}

function saveTokenToFile() {
    fs.writeFileSync(tokenFile, JSON.stringify(token), 'utf8');
}

export async function getStream(streamer_login) {
    let retryCounter = 0;
    let response;
    do {
        response = await fetch(url + "?user_login=" + streamer_login, {method : 'GET', headers : {
                'Authorization' : "Bearer " + token,
                'Client-Id' : process.env.TWITCH_CLIENT_ID
            }});
        retryCounter++;
        if(!response.ok) {
            // refresh token
            await getAuthToken();
        }
    } while(!response.ok && response <= 3);

    let data = await response.json();
    console.log(data);
    return data;
}

async function getAuthToken() {
    console.log("Getting new token from twitch");
    const apiUrl = "https://id.twitch.tv/oauth2/token";
    const params = new URLSearchParams();
    params.append('client_id', process.env.TWITCH_CLIENT_ID);
    params.append('client_secret', process.env.TWITCH_CLIENT_SECRET);
    params.append("grant_type","client_credentials");

    let response = await fetch(apiUrl, {method: 'POST', body : params});
    let data = await response.json();
    console.log(data);
    token = data["access_token"];
    saveTokenToFile();
    return token;
}

export async function isLive(stream) {
    if(stream.startsWith('#')) {
        stream = stream.substring(1);
    }
    let streamData = await getStream(stream);
    if(streamData["data"].length === 0) {
        return false;
    } else if(streamData["data"][0]["type"] === 'live') {
        return true;
    }
    console.error("Error checking if channel is live");
}