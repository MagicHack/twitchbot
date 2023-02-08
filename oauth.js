import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";
export const app = express();

// dank oauth code to get inital token

const buffer = crypto.randomBytes(16);
const state = buffer.toString('hex');
let scopes = [
    'moderation:read',
    'channel:read:polls',
    'channel:read:predictions',
    'channel:read:vips',
    'moderator:manage:announcements',
    'moderator:manage:automod',
    'moderator:manage:banned_users',
    'moderator:read:chat_settings',
    'moderator:manage:chat_settings',
    'moderator:read:chat_settings',
    'moderator:read:chatters',
    'channel:moderate',
    'chat:edit',
    'chat:read',
];


// redirect_uri ends up here
app.get('/auth-callback', async (req, res) => {
    console.log(req.url);
    const req_data = new URLSearchParams(req.url.split('?')[1]);
    console.log(req_data);
    if(req_data.has("error")) {
        res.send(req_data.get("error") + "<br>" + req_data["error_description"]);
        return;
    }

    const code = req_data.get('code');
    console.log(code);
    const state = req_data.get('state');
    console.log(state);

    let body = {
        client_id : process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: process.env.REDIRECT_URI,
    };

    const formBody = Object.keys(body).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(body[key])).join('&');
    let result = await fetch("https://id.twitch.tv/oauth2/token?"+formBody,
        {
            method: 'post'
        });
    let data = await result.json();
    console.log(data);
    console.log(data["access_token"]);
    res.send("Code :" + res.statusCode);
});

app.get('/', async (req, res) => {
    const link = `<a href="https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&redirect_uri=${process.env.REDIRECT_URI}&response_type=code&scope=${scopes.join(" ")}&state=${state}">Connect with Twitch</a>`;
    res.send(link);
});