#!/usr/bin/env node
/**
 * Direct OpenAI Responses API test WITH STREAMING
 * Streaming keeps connection alive during long reasoning
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY not set');
  process.exit(1);
}

async function testStreamingAPI() {
  const task = 'What are the top 3 AI news headlines from today?';

  // Build request WITH STREAMING
  const request = {
    model: 'gpt-5.1',
    input: task,
    instructions: 'You are a helpful AI assistant.',
    reasoning: {
      effort: 'high',
      summary: 'auto'
    },
    tools: [
      { type: 'web_search_preview' }
    ],
    text: {
      verbosity: 'medium'
    },
    max_output_tokens: 32000,
    stream: true,  // <<< STREAMING ENABLED
    store: true
  };

  console.log('='.repeat(60));
  console.log('DIRECT API TEST - WITH STREAMING');
  console.log('='.repeat(60));
  console.log('Model:', request.model);
  console.log('Reasoning effort:', request.reasoning.effort);
  console.log('Web search:', 'ENABLED');
  console.log('Streaming:', 'ENABLED');
  console.log('Task:', task);
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    console.log(`\n[${new Date().toISOString()}] Starting streaming fetch...`);

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(1200000)  // 20 minutes
    });

    console.log(`[${new Date().toISOString()}] Got response headers`);
    console.log('Status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ERROR Response:', errorText);
      return;
    }

    // Read streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let eventCount = 0;
    let lastEventTime = Date.now();

    console.log('\n[Streaming events...]');

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        console.log('\n[Stream complete]');
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            eventCount++;

            // Log progress every 10 events or every 5 seconds
            const now = Date.now();
            if (eventCount % 10 === 0 || now - lastEventTime > 5000) {
              const elapsed = ((now - startTime) / 1000).toFixed(1);
              console.log(`  [${elapsed}s] Event #${eventCount}: ${event.type || 'unknown'}`);
              lastEventTime = now;
            }

            // Collect output text
            if (event.type === 'response.output_text.delta') {
              fullText += event.delta || '';
            }

            // Check for completion
            if (event.type === 'response.completed') {
              console.log('\n=== RESPONSE COMPLETED ===');
              if (event.response?.usage) {
                console.log('Usage:', JSON.stringify(event.response.usage, null, 2));
              }
            }

          } catch (e) {
            // Skip non-JSON lines
          }
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== SUCCESS after ${elapsed}s ===`);
    console.log(`Total events: ${eventCount}`);
    console.log(`Output length: ${fullText.length} chars`);
    console.log('\n=== OUTPUT (first 2000 chars) ===');
    console.log(fullText.substring(0, 2000));

  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n[${new Date().toISOString()}] ERROR after ${elapsed}s`);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error cause:', error.cause);
  }
}

// Run test
testStreamingAPI();
