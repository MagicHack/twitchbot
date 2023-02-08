# LIDL twitch bot
Little fun project that evolved in mostly unmaintainable code, a better made v2 is coming soon(tm).

## Config
copy config.exemple.json to config.json and add your bot data.  
.env also needs a few config values  
* TWITCH_CLIENT_ID=yourId
* TWITCH_CLIENT_SECRET=yourSecret
* REDIRECT_URI=http://localhost:3000/auth-callback

## Generating initial token
run `node oauth.js` and go to [https://localhost:3000]() to generate token.

## Required config files
You will need to create a few json files for the bot to run (ex channels.json : `["#channel"]`), v2 should generate them automatically.

## Running the bot
Once all the config is done you can run the bot with `node test.js`

# Warning
As explained in the beginning this code is badly written and lot of values are hardcoded, so you probably shouldn't use this code :)
