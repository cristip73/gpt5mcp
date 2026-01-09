#!/usr/bin/env node
/**
 * Direct API test for background mode - bypassing MCP
 */

import 'dotenv/config';

const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
  console.error('❌ OPENAI_API_KEY not found in .env');
  process.exit(1);
}

const requestBody = {
  model: "gpt-5.2",
  input: [
    {
      role: "system",
      content: "You are an autonomous agent. Continue working on the task until it is complete."
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: "Research the latest developments in quantum computing in 2025. Provide a brief summary."
        }
      ]
    }
  ],
  tools: [
    { type: "web_search_preview" }
  ],
  reasoning: {
    effort: "high",
    summary: "auto"
  },
  text: {
    verbosity: "medium"
  },
  max_output_tokens: 32000,
  background: true,
  stream: false,
  store: true
};

console.log('🚀 Testing direct API call with background mode...\n');
console.log('Request body:');
console.log(JSON.stringify(requestBody, null, 2));
console.log('\n---\n');

async function testBackgroundMode() {
  const startTime = Date.now();

  console.log('📤 Sending POST to /v1/responses...');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`⏱️  Response received in ${elapsed}s`);
    console.log(`📊 Status: ${response.status} ${response.statusText}`);

    const data = await response.json();
    console.log('\n📥 Response:');
    console.log(JSON.stringify(data, null, 2));

    if (data.id && data.status) {
      console.log(`\n✅ Background mode works! ID: ${data.id}, Status: ${data.status}`);

      // Start polling
      if (data.status === 'queued' || data.status === 'in_progress') {
        console.log('\n🔄 Starting polling...\n');
        await pollForCompletion(data.id);
      }
    } else {
      console.log('\n⚠️  Unexpected response format');
    }

  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`\n❌ Error after ${elapsed}s:`, error.message);

    if (error.name === 'AbortError') {
      console.error('⏱️  Request timed out (30s)');
    }
  }
}

async function pollForCompletion(responseId) {
  const startTime = Date.now();
  const maxWait = 5 * 60 * 1000; // 5 minutes
  let interval = 1000; // Start with 1s

  while (Date.now() - startTime < maxWait) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    try {
      const response = await fetch(`https://api.openai.com/v1/responses/${responseId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        }
      });

      const data = await response.json();
      console.log(`[${elapsed}s] Status: ${data.status}`);

      if (data.status === 'completed') {
        console.log('\n✅ COMPLETED!\n');
        console.log('Output:', data.output_text?.substring(0, 500) || 'No output_text');
        console.log('\nUsage:', JSON.stringify(data.usage, null, 2));
        return;
      }

      if (data.status === 'failed') {
        console.log('\n❌ FAILED:', data.error?.message || 'Unknown error');
        return;
      }

      // Wait before next poll
      await new Promise(r => setTimeout(r, interval));
      interval = Math.min(3000, interval * 1.5); // Backoff to max 3s

    } catch (error) {
      console.error(`[${elapsed}s] Poll error:`, error.message);
      await new Promise(r => setTimeout(r, interval));
    }
  }

  console.log('\n⏱️  Polling timeout (5 min)');
}

testBackgroundMode();
