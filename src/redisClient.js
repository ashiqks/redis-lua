const redis = require('redis');
const { promisify } = require('util');
require('dotenv').config();

const scripts = {
  saveUser: {
    script: `
      -- Keys and arguments
      -- Example: userKey = "user:101" (KEYS[1]="user:", ARGV[1]="101")
      local userKey = KEYS[1] .. ARGV[1]

      -- Example: featuresKey = "user:features:101" (KEYS[2]="user:features:", ARGV[1]="101")
      local featuresKey = KEYS[2] .. ARGV[1]

      -- Example: userData = {name="John Doe", email="john@example.com", subscription_plan="free"}
      local userData = cjson.decode(ARGV[2])

      -- Example: timestamp = "2023-10-25T10:30:00.000Z"
      local timestamp = ARGV[3]

      -- Store user data as hash
      for k, v in pairs(userData) do
        redis.call('HSET', userKey, k, v)
      end

      -- Get user's subscription plan
      local plan = userData.subscription_plan

      -- Set available features based on plan
      if plan == 'free' then
        -- Free plan features
        redis.call('HMSET', featuresKey,
          'storage_limit_mb', '100',
          'projects_limit', '3',
          'api_requests_per_day', '50',
          'team_members', '1',
          'has_export_feature', '0'
        )
      elseif plan == 'premium' then
        -- Premium plan features
        redis.call('HMSET', featuresKey,
          'storage_limit_mb', '10000',
          'projects_limit', 'unlimited',
          'api_requests_per_day', '1000',
          'team_members', '10',
          'has_export_feature', '1'
        )
      end

      -- Set the last_updated timestamp
      redis.call('HSET', featuresKey, 'last_updated', timestamp)

      -- Return the available features
      return redis.call('HGETALL', featuresKey)
    `,
    sha: null
  },
  checkFeature: {
    script: `
      -- Example: featuresKey = "user:features:101" (KEYS[1]="user:features:", ARGV[1]="101")
      local featuresKey = KEYS[1] .. ARGV[1]

      -- Example: featureName = "storage_limit_mb" (ARGV[2]="storage_limit_mb")
      local featureName = ARGV[2]

      -- Get feature value
      -- Example: HGET "user:features:101" "storage_limit_mb" returns "100"
      local value = redis.call('HGET', featuresKey, featureName)
      if not value then
        return {err="Feature not defined"}
      end

      -- For numeric limits, return the value as-is (e.g. "100", "1000", "unlimited")
      -- For boolean features (0/1), return true/false
      -- Example: if featureName="has_export_feature" and value="1", returns true
      if featureName == 'has_export_feature' then
        return value == '1'
      else
        return value
      end
    `,
    sha: null
  }
};

// Initialize Redis client - simpler configuration
const client = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379
});

client.on('connect', () => {
  console.log('Connected to Redis server');
  // Load scripts after connection
  loadScripts().catch(err => console.error('Error loading scripts:', err));
});

client.on('error', (err) => {
  console.error('Redis Error:', err);
});

// Promisify Redis commands
const hgetallAsync = client.hgetall ? promisify(client.hgetall).bind(client) : null;
const evalAsync = client.eval ? promisify(client.eval).bind(client) : null;
const evalshaAsync = client.evalsha ? promisify(client.evalsha).bind(client) : null;
const scriptLoadAsync = client.script ? promisify(client.script).bind(client) : null;

// Function to load scripts into Redis and store their SHAs
async function loadScripts() {
  if (!scriptLoadAsync) {
    console.warn('script command not available, skipping script loading');
    return;
  }

  for (const [name, scriptObj] of Object.entries(scripts)) {
    try {
      const sha = await scriptLoadAsync('LOAD', scriptObj.script);
      scriptObj.sha = sha;
      console.log(`Loaded script ${name} with SHA: ${sha}`);
    } catch (err) {
      console.error(`Failed to load script ${name}:`, err);
    }
  }
}

// Wrapper for evalsha with fallback to eval
async function runScript(scriptName, keysCount, ...args) {
  const scriptObj = scripts[scriptName];
  if (!scriptObj) {
    throw new Error(`Script ${scriptName} not found`);
  }

  // If SHA is available, try using EVALSHA
  if (scriptObj.sha && evalshaAsync) {
    try {
      return await evalshaAsync(scriptObj.sha, keysCount, ...args);
    } catch (err) {
      // If NOSCRIPT error, reload the script and try again
      if (err.message && err.message.includes('NOSCRIPT')) {
        console.log(`Script ${scriptName} not cached, reloading...`);
        if (scriptLoadAsync) {
          scriptObj.sha = await scriptLoadAsync('LOAD', scriptObj.script);
          return await evalshaAsync(scriptObj.sha, keysCount, ...args);
        }
      }
      throw err;
    }
  }

  // Fallback to regular EVAL if EVALSHA is not available or failed
  if (!evalAsync) {
    throw new Error('eval command not available');
  }
  return await evalAsync(scriptObj.script, keysCount, ...args);
}

module.exports = {
  client,
  hgetallAsync,
  evalAsync,
  evalshaAsync,
  scriptLoadAsync,
  runScript,
  scripts
};
