const express = require('express');
const userService = require('./userService');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'OK', message: 'API is running' });
});

// Create or update a user (automatically sets features with Lua script)
app.post('/api/v1/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const userData = req.body;

    if (!userData.subscription_plan) {
      return res.status(400).json({ error: 'subscription_plan is required (free or premium)' });
    }

    const result = await userService.saveUser(userId, userData);

    if (result.success) {
      res.status(201).json({
        message: 'User created/updated with plan features',
        features: result.features,
        note: 'Features were automatically set based on the subscription plan using a Lua script'
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user with features
app.get('/api/v1/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const result = await userService.getUser(userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check if user has access to a specific feature
app.get('/api/v1/users/:id/features/:feature', async (req, res) => {
  try {
    const userId = req.params.id;
    const featureName = req.params.feature;

    const result = await userService.checkFeatureAccess(userId, featureName);

    if (result.success) {
      res.json({
        user_id: userId,
        feature: featureName,
        value: result.value,
        note: 'Feature access checked using Lua script'
      });
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
