const redisClient = require('./redisClient');

// User Service
class UserService {
  // Key prefixes
  static USER_PREFIX = 'user:';
  static USER_FEATURES = 'features:';

  /**
   * Create or update a user with subscription plan and automatically set available features
   */
  async saveUser(userId, userData) {
    try {
      const keys = [
        UserService.USER_PREFIX,       // KEYS[1]
        UserService.USER_FEATURES      // KEYS[2]
      ];

      const args = [
        userId,                              // ARGV[1]
        JSON.stringify(userData),            // ARGV[2]
        new Date().toISOString()             // ARGV[3]
      ];

      // Execute Lua script with EVALSHA
      const result = await redisClient.runScript('saveUser', keys.length, ...keys, ...args);

      // Parse the features result (Redis returns array for HGETALL in Lua)
      if (result && result.length > 0) {
        const features = {};
        for (let i = 0; i < result.length; i += 2) {
          features[result[i]] = result[i + 1];
        }
        return { success: true, userId, features };
      }

      return { success: false, error: 'Unknown error' };
    } catch (error) {
      console.error('Error saving user and setting features:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user details and features
   */
  async getUser(userId) {
    try {
      const userKey = `${UserService.USER_PREFIX}${userId}`;
      const featuresKey = `${UserService.USER_FEATURES}${userId}`;

      // Get user data
      const user = await redisClient.hgetallAsync(userKey);

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Get features
      const features = await redisClient.hgetallAsync(featuresKey);

      return {
        success: true,
        user,
        features: features || {}
      };
    } catch (error) {
      console.error('Error getting user:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if user has access to a specific feature
   */
  async checkFeatureAccess(userId, featureName) {
    try {
      const keys = [UserService.USER_FEATURES];
      const args = [userId, featureName];

      // Execute Lua script with EVALSHA
      const result = await redisClient.runScript('checkFeature', keys.length, ...keys, ...args);

      if (result && result.err) {
        return { success: false, error: result.err };
      }

      return { success: true, feature: featureName, value: result };
    } catch (error) {
      console.error('Error checking feature access:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new UserService();
