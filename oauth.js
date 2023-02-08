import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";
import { promises as fs } from 'fs';
import 'dotenv/config';

const app = express();

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
    const req_data = new URLSearchParams(req.url.split('?')[1]);

    if(req_data.has("error")) {
        res.send(req_data.get("error") + "<br>" + req_data["error_description"]);
        return;
    }

    const code = req_data.get('code');

    if(state !== req_data.get('state')) {
        console.log("received state doesn't correspond, aborting");
        res.send("received state doesn't correspond, aborting");
        return;
    }

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
    await fs.writeFile('tokens.json', JSON.stringify(data, null, 4), 'UTF-8');
    if(result.status !== 200) {
        res.send("Error code : " +  result.statusCode);
    } else {
        res.send("Wrote tokens.json");
    }
});

app.get('/', async (req, res) => {
    const link = `<a href="https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&redirect_uri=${process.env.REDIRECT_URI}&response_type=code&scope=${scopes.join(" ")}&state=${state}">Connect with Twitch</a>`;
    res.send(link);
});
app.listen(3000, () => {console.log("Running at: https://localhost:3000")});

