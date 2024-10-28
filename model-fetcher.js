const fetch = require("node-fetch");
const { getState } = require("@saltcorn/data/db/state");

async function fetchOpenRouterModels(apiKey) {
  try {
    const state = getState();
    const siteURL = state.getConfig('site_url', 'http://localhost');
    
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': siteURL
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data.map(model => model.id);
  } catch (error) {
    console.error('Error fetching OpenRouter models:', error);
    return [];
  }
}

async function fetchMistralModels(apiKey) {
  try {
    const response = await fetch('https://api.mistral.ai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data.map(model => model.id);
  } catch (error) {
    console.error('Error fetching Mistral models:', error);
    return [];
  }
}

// Cache for storing models with expiration
const modelCache = {
  openrouter: { models: null, timestamp: 0 },
  mistral: { models: null, timestamp: 0 }
};

const CACHE_DURATION = 3600000; // 1 hour in milliseconds

async function getModels(backend, apiKey) {
  const now = Date.now();
  
  if (backend === 'OpenRouter') {
    if (modelCache.openrouter.models && 
        (now - modelCache.openrouter.timestamp) < CACHE_DURATION) {
      return modelCache.openrouter.models;
    }
    
    const models = await fetchOpenRouterModels(apiKey);
    modelCache.openrouter = { models, timestamp: now };
    return models;
  }
  
  if (backend === 'Mistral') {
    if (modelCache.mistral.models && 
        (now - modelCache.mistral.timestamp) < CACHE_DURATION) {
      return modelCache.mistral.models;
    }
    
    const models = await fetchMistralModels(apiKey);
    modelCache.mistral = { models, timestamp: now };
    return models;
  }
  
  return [];
}

module.exports = { getModels };
