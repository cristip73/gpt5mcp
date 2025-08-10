# GPT-5 MCP Server - Prompt Caching Implementation Plan

## Executive Summary
Implement prompt caching support in the GPT-5 MCP server to reduce latency by up to 80% and costs by up to 75% for requests with repetitive content.

## Background

### How Prompt Caching Works
- **Automatic**: Enabled for all prompts ≥1024 tokens
- **Prefix Matching**: Caches exact prefix matches
- **Increments**: Cache hits occur in 128-token increments (1024, 1152, 1280...)
- **Duration**: Cached 5-10 minutes (up to 1 hour off-peak)
- **Cost**: 50-75% discount on cached tokens
- **Privacy**: Caches are organization-specific, not shared

### Key API Features
1. **prompt_cache_key** parameter: Influences routing for better hit rates
2. **cached_tokens** in response: Shows how many tokens were cached
3. **No extra fees**: Caching is automatic and free

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

#### 1.1 Schema Updates
```typescript
// Add to GPT5MessagesSchema in index.ts
prompt_cache_key: z.string().optional()
  .describe("Cache key to improve hit rates for requests with shared prefixes. Use same key for similar conversations"),

cache_strategy: z.enum(['auto', 'optimize', 'disabled']).optional().default('auto')
  .describe("Cache strategy: 'auto' (default), 'optimize' (reorder for caching), 'disabled'"),
```

#### 1.2 Request Structure Updates
```typescript
// In utils.ts - Update GPT5ResponseRequest interface
interface GPT5ResponseRequest {
  // ... existing fields ...
  prompt_cache_key?: string;
}

// Update callGPT5WithMessages to include prompt_cache_key
...(options.prompt_cache_key && { prompt_cache_key: options.prompt_cache_key }),
```

#### 1.3 Response Tracking
```typescript
// Update response to include cache metrics
interface GPT5Response {
  // ... existing fields ...
  usage?: {
    // ... existing fields ...
    prompt_tokens_details?: {
      cached_tokens: number;
      audio_tokens?: number;
    };
  };
}
```

### Phase 2: Prompt Optimization (Week 1-2)

#### 2.1 Automatic Prompt Reordering
Create utility function to optimize prompt structure for caching:

```typescript
// utils/promptOptimizer.ts
export function optimizePromptForCaching(messages: Message[], options: {
  instructions?: string;
  cache_strategy?: string;
}): Message[] {
  if (options.cache_strategy === 'disabled') return messages;
  
  // Structure: [system/developer messages] → [examples] → [conversation] → [user query]
  const systemMessages = messages.filter(m => m.role === 'developer');
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  const userMessages = messages.filter(m => m.role === 'user');
  
  // Put static content first for better caching
  return [
    ...systemMessages,  // Instructions (most static)
    ...assistantMessages.slice(0, -1),  // Previous responses (semi-static)
    ...userMessages  // User inputs (most dynamic)
  ];
}
```

#### 2.2 Smart Cache Key Generation
```typescript
// utils/cacheKeyGenerator.ts
export function generateCacheKey(options: {
  userId?: string;
  sessionId?: string;
  templateId?: string;
  model?: string;
}): string {
  // Generate hierarchical cache key for optimal routing
  const parts = [
    options.model || 'gpt-5',
    options.templateId || 'default',
    options.userId || 'anonymous',
    options.sessionId || Date.now().toString(36)
  ];
  
  return parts.join(':');
}
```

### Phase 3: Cache Management Features (Week 2)

#### 3.1 Cache Statistics Tracking
```typescript
// Add cache metrics to response
export interface CacheMetrics {
  hit_rate: number;  // Percentage of tokens cached
  tokens_saved: number;  // Number of cached tokens
  cost_savings: number;  // Estimated $ saved
  latency_reduction: number;  // ms saved
}

function calculateCacheMetrics(usage: any): CacheMetrics {
  const cached = usage.prompt_tokens_details?.cached_tokens || 0;
  const total = usage.prompt_tokens || 0;
  
  return {
    hit_rate: total > 0 ? (cached / total) * 100 : 0,
    tokens_saved: cached,
    cost_savings: cached * 0.0000025,  // 50% discount on $0.000005/token
    latency_reduction: cached * 0.5  // ~0.5ms per cached token
  };
}
```

#### 3.2 Session Management
```typescript
// Maintain session state for better caching
interface SessionState {
  session_id: string;
  prompt_cache_key: string;
  message_count: number;
  total_cached_tokens: number;
  created_at: Date;
  last_accessed: Date;
}

class SessionManager {
  private sessions: Map<string, SessionState> = new Map();
  
  createSession(userId?: string): SessionState {
    const session: SessionState = {
      session_id: crypto.randomUUID(),
      prompt_cache_key: generateCacheKey({ userId }),
      message_count: 0,
      total_cached_tokens: 0,
      created_at: new Date(),
      last_accessed: new Date()
    };
    
    this.sessions.set(session.session_id, session);
    return session;
  }
  
  getOrCreateSession(sessionId?: string): SessionState {
    if (sessionId && this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      session.last_accessed = new Date();
      return session;
    }
    return this.createSession();
  }
}
```

### Phase 4: User Features (Week 2-3)

#### 4.1 New Tool Parameters
```typescript
// Enhanced gpt5_messages parameters
{
  // Existing parameters...
  
  // Caching parameters
  prompt_cache_key: "optional-cache-key",
  session_id: "optional-session-id",
  cache_strategy: "auto" | "optimize" | "disabled",
  return_cache_metrics: boolean,  // Include cache stats in response
  
  // Template support for common patterns
  template_id: "chat" | "code_review" | "translation" | "custom",
  template_variables: { [key: string]: any }
}
```

#### 4.2 Response Format with Cache Info
```typescript
// When return_cache_metrics is true
{
  "text": "Response content...",
  "response_id": "resp_123...",
  "cache_metrics": {
    "cached_tokens": 1920,
    "total_tokens": 2006,
    "cache_hit_rate": "95.7%",
    "cost_savings": "$0.0048",
    "latency_reduction": "960ms"
  },
  "session": {
    "session_id": "sess_456...",
    "prompt_cache_key": "gpt-5:chat:user123:xyz",
    "message_count": 5
  }
}
```

### Phase 5: Templates System (Week 3)

#### 5.1 Pre-built Templates for Common Use Cases
```typescript
// templates/index.ts
export const TEMPLATES = {
  code_review: {
    prefix: [
      { role: "developer", content: "You are an expert code reviewer..." },
      { role: "developer", content: "Focus on: security, performance, readability..." }
    ],
    min_tokens: 1024,  // Ensure caching kicks in
    cache_key_prefix: "code_review_v1"
  },
  
  chat_assistant: {
    prefix: [
      { role: "developer", content: "You are a helpful AI assistant..." }
    ],
    min_tokens: 1024,
    cache_key_prefix: "chat_v1"
  },
  
  translation: {
    prefix: [
      { role: "developer", content: "You are a professional translator..." }
    ],
    min_tokens: 1024,
    cache_key_prefix: "translate_v1"
  }
};
```

#### 5.2 Template Usage
```typescript
// Apply template automatically
function applyTemplate(
  messages: Message[], 
  templateId: string,
  variables?: any
): Message[] {
  const template = TEMPLATES[templateId];
  if (!template) return messages;
  
  // Add template prefix (static content first for caching)
  const templatedMessages = [
    ...template.prefix,
    ...messages
  ];
  
  // Pad to minimum tokens if needed
  return ensureMinimumTokens(templatedMessages, template.min_tokens);
}
```

### Phase 6: Monitoring & Analytics (Week 3-4)

#### 6.1 Cache Performance Logging
```typescript
// Log cache performance for optimization
interface CacheLog {
  timestamp: Date;
  request_id: string;
  prompt_cache_key?: string;
  total_tokens: number;
  cached_tokens: number;
  cache_hit_rate: number;
  response_time_ms: number;
  model: string;
}

class CacheMonitor {
  private logs: CacheLog[] = [];
  
  logRequest(data: CacheLog) {
    this.logs.push(data);
    
    // Emit metrics for monitoring
    if (data.cache_hit_rate < 50 && data.total_tokens >= 1024) {
      console.warn(`Low cache hit rate: ${data.cache_hit_rate}% for ${data.prompt_cache_key}`);
    }
  }
  
  getStats(timeWindow?: number): CacheStats {
    // Calculate aggregate statistics
    const relevantLogs = this.filterByTime(this.logs, timeWindow);
    return {
      avg_hit_rate: this.calculateAverage(relevantLogs, 'cache_hit_rate'),
      total_saved: this.sumTokensSaved(relevantLogs),
      total_requests: relevantLogs.length,
      cache_keys_used: new Set(relevantLogs.map(l => l.prompt_cache_key)).size
    };
  }
}
```

#### 6.2 Optimization Recommendations
```typescript
// Suggest optimizations based on usage patterns
function analyzeAndRecommend(logs: CacheLog[]): Recommendation[] {
  const recommendations: Recommendation[] = [];
  
  // Check for fragmented cache keys
  const keyGroups = groupBy(logs, 'prompt_cache_key');
  for (const [key, group] of Object.entries(keyGroups)) {
    if (group.length < 5) {
      recommendations.push({
        type: 'consolidate_keys',
        message: `Consider consolidating cache key '${key}' with similar keys`,
        impact: 'medium'
      });
    }
  }
  
  // Check for prompts just under 1024 tokens
  const nearThreshold = logs.filter(l => 
    l.total_tokens > 900 && l.total_tokens < 1024
  );
  if (nearThreshold.length > 0) {
    recommendations.push({
      type: 'pad_prompts',
      message: `${nearThreshold.length} requests are just under 1024 tokens. Consider padding.`,
      impact: 'high'
    });
  }
  
  return recommendations;
}
```

## Migration Strategy

### Step 1: Backward Compatible Release
- Add new parameters as optional
- Default behavior unchanged
- Existing code continues to work

### Step 2: Gradual Adoption
```typescript
// Old way (still works)
gpt5_messages({ messages: [...] })

// New way with caching optimization
gpt5_messages({ 
  messages: [...],
  prompt_cache_key: "user_123:chat",
  cache_strategy: "optimize",
  return_cache_metrics: true
})
```

### Step 3: Documentation & Examples
- Update README with caching guide
- Provide examples for common use cases
- Show cost/latency savings metrics

## Success Metrics

### Primary KPIs
- **Cache Hit Rate**: Target >80% for repeat requests
- **Cost Reduction**: Target 50-75% on cached tokens
- **Latency Reduction**: Target 50-80% for cached prompts
- **Adoption Rate**: >60% of requests using cache keys within 30 days

### Secondary Metrics
- Average tokens cached per request
- Cache key fragmentation rate
- Session continuity rate
- Template usage statistics

## Testing Strategy

### Unit Tests
```typescript
describe('Prompt Caching', () => {
  test('should add prompt_cache_key to request', () => {
    const result = callGPT5WithMessages(messages, {
      prompt_cache_key: 'test_key'
    });
    expect(result.request).toHaveProperty('prompt_cache_key', 'test_key');
  });
  
  test('should optimize prompt order when strategy is optimize', () => {
    const optimized = optimizePromptForCaching(messages, {
      cache_strategy: 'optimize'
    });
    expect(optimized[0].role).toBe('developer');  // Static content first
  });
  
  test('should track cache metrics correctly', () => {
    const metrics = calculateCacheMetrics({
      prompt_tokens: 2000,
      prompt_tokens_details: { cached_tokens: 1920 }
    });
    expect(metrics.hit_rate).toBe(96);
  });
});
```

### Integration Tests
- Test with actual API calls
- Verify cache hits on repeated requests
- Measure actual latency improvements
- Validate cost calculations

### Load Testing
- Test cache overflow (>15 req/min same key)
- Test cache eviction after 5-10 minutes
- Test different cache key strategies

## Risk Mitigation

### Potential Issues & Solutions

1. **Cache Key Collision**
   - Risk: Different users sharing cache
   - Solution: Include user ID in cache key generation

2. **Cache Overflow**
   - Risk: >15 req/min causes cache misses
   - Solution: Implement rate limiting per cache key

3. **Prompt Reordering Breaking Logic**
   - Risk: Optimization changes conversation flow
   - Solution: Make optimization opt-in, test thoroughly

4. **Memory Usage**
   - Risk: Storing session state uses memory
   - Solution: Implement TTL and cleanup for old sessions

## Timeline

### Week 1: Core Implementation
- Schema updates
- Basic prompt_cache_key support
- Response tracking

### Week 2: Optimization Features
- Prompt reordering
- Cache key generation
- Session management

### Week 3: User Features
- Templates system
- Cache metrics in responses
- Documentation

### Week 4: Monitoring & Polish
- Analytics dashboard
- Performance tuning
- Load testing
- Release preparation

## Documentation Requirements

### User Guide Topics
1. "Getting Started with Prompt Caching"
2. "Optimizing Prompts for Maximum Cache Hits"
3. "Using Templates for Common Patterns"
4. "Understanding Cache Metrics"
5. "Best Practices for Cache Keys"

### API Documentation
- Update all parameter descriptions
- Add examples with caching
- Show response format with metrics
- Include migration guide

## Success Criteria

The implementation is successful when:
1. ✅ Cache hit rate >80% for templated requests
2. ✅ 50%+ cost reduction on cached tokens
3. ✅ <1s response time for fully cached prompts
4. ✅ Zero breaking changes to existing API
5. ✅ Clear documentation and examples
6. ✅ Monitoring shows stable performance

## Next Steps

1. Review and approve plan
2. Create feature branch: `feature/prompt-caching`
3. Implement Phase 1 (Core Infrastructure)
4. Test with real workloads
5. Iterate based on metrics
6. Progressive rollout to users

## Appendix: Example Usage

### Basic Caching
```javascript
// Simple usage with automatic caching
const response = await gpt5_messages({
  messages: [
    { role: "developer", content: "You are a code reviewer..." }, // Static
    { role: "user", content: "Review this code: ..." }  // Dynamic
  ],
  prompt_cache_key: "code_review:project_x"
});
```

### Advanced with Metrics
```javascript
// Advanced usage with optimization and metrics
const response = await gpt5_messages({
  messages: [...],
  prompt_cache_key: generateCacheKey({ 
    userId: "user_123",
    templateId: "chat"
  }),
  cache_strategy: "optimize",
  return_cache_metrics: true,
  session_id: "sess_abc123"
});

console.log(`Cache hit: ${response.cache_metrics.cache_hit_rate}%`);
console.log(`Saved: ${response.cache_metrics.cost_savings}`);
```

### Template Usage
```javascript
// Using pre-built templates
const response = await gpt5_messages({
  template_id: "code_review",
  template_variables: {
    language: "TypeScript",
    focus: ["security", "performance"]
  },
  messages: [
    { role: "user", content: codeToReview }
  ],
  return_cache_metrics: true
});
```

---

*This plan provides a comprehensive approach to implementing prompt caching in the GPT-5 MCP server, focusing on performance, cost savings, and user experience while maintaining backward compatibility.*