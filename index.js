const request = require('request-promise');
const redis = require('redis');
require('dotenv').config();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL
const MEDAL_API_KEY = process.env.MEDAL_API_KEY
const REDIS_URL = process.env.REDIS_URL
const REDIS_PASSWORD = process.env.REDIS_PASSWORD
const DISCORD_USER_LIST = JSON.parse(process.env.DISCORD_USER_LIST)

function checkEnvVars(){
    /* Check The Env Vars Are Correct*/
    if (!DISCORD_WEBHOOK_URL){
        console.log('DISCORD_WEBHOOK_URL not set')
        return false
    }
    if (!MEDAL_API_KEY){
        console.log('MEDAL_API_KEY not set')
        return false
    }
    if (!REDIS_URL){
        console.log('REDIS_URL not set')
        return false
    }
    if (!REDIS_PASSWORD){
        console.log('REDIS_PASSWORD not set')
        return false
    }
    if (!DISCORD_USER_LIST){
        console.log('DISCORD_USER_LIST not set')
        return false
    }
    return true
}

async function sendDiscordMessage(user_id, medal_tv_link){
    /* Sends a Request to a Discord Webhook */
    console.log('[Medal2Discord Bot]    Sending Discord Message...')
    // Set the request options (including message)...
    let requestOptions = {
        uri: DISCORD_WEBHOOK_URL,
        method: 'POST',
        json: {
            "username": "Medal2Discord",
            "content": `Hey! <@${user_id}> has just uploaded this [sick clip](${medal_tv_link})!`
        }
    };
    // Post to the Discord webhook
    let response = await request.post(requestOptions)    
    console.log("[Medal2Discord Bot]    Discord Meessage Sent!")
}

async function getLatestMedalClip(user){
    /* Function to call the MedalTv Api to get the latest clip for a user */
    console.log('[Medal2Discord Bot]    Calling Medal API')
    // Request options...
    let requestOptions = {
        uri: `https://developers.medal.tv/v1/latest?userId=${user['medal_id']}&limit=1`,
        method: 'GET',
        headers: {
            "Authorization": MEDAL_API_KEY
        }
    };
    // Do the Get request...
    var response = await request.get(requestOptions)
    if (response) {
        // Check We have a clip to analyize...
        body = JSON.parse(response)
        if (body['contentObjects'].length > 0){
            // We need to check if the clip is actually new, check createdTimestamp
            let clip = body['contentObjects'][0];
            return clip;
        } else {
            return {'contentId': None}
        }
    }
}

async function getLastPostedClip(redisClient, user){
    /* Function To get the last posted Id from redis */
    // Make the key from the name / discord id...
    let key = `${user['name']}${user['discord_Id']}`
    // Get the key value from redis...
    let lastPostedId = await redisClient.get(key)
    // Return this to be compared with the latest clip from medal...
    return lastPostedId
}

async function updateLastPostedClipId(redisClient, user, clipId){
    /* Function to update the last posted clip in redis */
    // Make the key from the name / discord id...
    let key = `${user['name']}${user['discord_Id']}`
    // Get the key value from redis...
    await redisClient.set(key, clipId)
}


async function connectToRedis(){
    /* Function to connect to redis */
    // Redis Connection Config..
    const client = redis.createClient({
        url: REDIS_URL,
        password: REDIS_PASSWORD
      })
    // Set the error callback to log the error...
    client.on('error', (err) => console.log('[Medal2Discord Bot]    Redis Client Error', err));
    client.on('connect', () => console.log('[Medal2Discord Bot]    Redis Connected'));
    // Connect to redis...
    await client.connect();
    // Return the client to be used elsewhere...
    return client
}

async function loop_users(){
    /* Function To Loop the Users and Check for Any New Clips*/
    // Check Env Vars Are good..
    if (!checkEnvVars()){
        return
    }
    // Connect to Redis...
    const redisClient = await connectToRedis()
    // Loop The Users...
    for (index in DISCORD_USER_LIST){
        // Get the user from the list...
        let user = DISCORD_USER_LIST[index]
        console.log(`[Medal2Discord Bot]    Fetching Latest clips for ${user['name']}...`)
        // This is the ID for the last clip the bot posted to discord (as pulled from redis)...
        let lastPostedClipId = await getLastPostedClip(redisClient, user);
        // This is the latest clip from the user as per redis...
        latestClip = await getLatestMedalClip(user)
        // If the LastPosted clip does not match the latest clip then we need to post it...
        console.log(`[Medal2Discord Bot]    Results for ${user['name']} redisClipId:${lastPostedClipId} medalClipId:${latestClip['contentId']}`)
        if (lastPostedClipId != latestClip['contentId']){
            // Before Posting it update redis to mark this ID as posted...
            await updateLastPostedClipId(redisClient, user, latestClip['contentId'])
            // Send the Message to discord to post the Image...
            await sendDiscordMessage(user['discord_Id'], latestClip['directClipUrl'])
        } else {
            console.log(`[Medal2Discord Bot]    Clip for ${user['name']} is the same as the last posted one`)
        }
    }
    return
}

async function onPubSub(event, conext){
    console.log('[Medal2Discord Bot]    Triggered..')
    await loop_users();
    return
}

exports.onPubSub = onPubSub
  