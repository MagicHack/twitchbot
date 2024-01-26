# LIDL twitch bot
Little fun project that evolved in mostly unmaintainable code, a better made v2 is coming soon(tm).

## Config
copy config.exemple.json to config.json and add your bot data.  
.env also needs a few config values  
* TWITCH_CLIENT_ID=yourId
* TWITCH_CLIENT_SECRET=yourSecret
* REDIRECT_URI=http://localhost:3000/auth-callback

## Generating initial token
run `node oauth.js` and go to [http://localhost:3000]() to generate token.

## Required config files
You will need to create a few json files for the bot to run (ex channels.json : `["#channel"]`), v2 should generate them automatically.

## Running the bot
Once all the config is done you can run the bot with `node test.js`

## Running with Docker
**Important** mount a volume to /config to not lose any config/data when recreating container  
Instead of using a .env file you can set them as environment variables in the container

To generate oauth token run the container with oauth.js as the last param ex:
```bash 
docker run imgID \
       -v config:/config \
       -p 3000:3000 \
       -e TWITCH_CLIENT_ID='YourClientID' \
       -e TWITCH_CLIENT_SECRET='YourSecret' \
       -e REDIRECT_URI='http://localhost:3000/auth-callback' \
        oauth.js
```
To run the bot after that use the same command but remove oauth.js from the end.

A sample compose file is also provided for running the bot.

# Warning
As explained in the beginning this code is badly written and lot of values are hardcoded, so you probably shouldn't use this code :)

