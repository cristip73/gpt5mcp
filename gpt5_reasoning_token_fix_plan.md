# GPT-5 Agent Reasoning Token Overflow - Root Cause Fix Plan

## Problem Statement

**Root Cause Identified**: GPT-5 has a **128k reasoning+output token combined limit**. When input tokens exceed ~350k with complex tasks, internal reasoning tokens exhaust this budget entirely, causing response capture failure.

**Evidence from Tests**:
- Input <50k: ✅ Success (minimal reasoning load)
- Input 350k+ + high effort: ❌ Failed (reasoning tokens consume entire 128k budget)
- Input 350k+ + low effort: ✅ Success (controlled reasoning usage)

**Current Status**: 67% success rate with memory management bandaids, but underlying issue remains unresolved.

## Phase 1: Root Cause Solution (Reasoning Token Management)

### 1.1 Adaptive Reasoning Effort Control

**Current Issue**: Static reasoning effort settings cause token budget exhaustion

**Solution**: Dynamic effort scaling based on input complexity and available token budget

```typescript
interface ReasoningController {
  calculateOptimalEffort(inputTokens: number, taskComplexity: 'simple' | 'medium' | 'complex'): 'minimal' | 'low' | 'medium' | 'high';
  estimateReasoningTokens(inputTokens: number, effort: string): number;
  validateTokenBudget(inputTokens: number, reasoningEstimate: number, outputTarget: number): boolean;
}
```

**Implementation Strategy**:
- Input <100k: Use requested effort level
- Input 100k-200k: Cap at 'medium' effort  
- Input 200k-300k: Force 'low' effort
- Input >300k: Force 'minimal' effort
- Always reserve 4k tokens for output

### 1.2 Input Token Optimization  

**Current Issue**: Massive input contexts from web search results and tool outputs

**Solution**: Intelligent context summarization and windowing

```typescript
interface ContextManager {
  summarizeWebSearchResults(results: any[], maxTokens: number): any[];
  compressToolOutputs(outputs: any[], maxTokens: number): any[];
  createContextWindow(fullInput: any[], targetTokens: number): any[];
}
```

**Strategies**:
- **Web Search Compression**: Summarize search results to key findings (max 50k tokens)
- **Tool Output Summarization**: Extract key results, discard verbose logs (max 30k tokens)
- **Context Windowing**: Keep only last N relevant interactions
- **Progressive Summarization**: Summarize older context as conversation grows

### 1.3 Token Budget Management

**Current Issue**: No visibility or control over reasoning token consumption

**Solution**: Proactive budget allocation and monitoring

```typescript
interface TokenBudgetManager {
  calculateBudget(inputTokens: number): TokenBudget;
  validateRequest(request: any, budget: TokenBudget): ValidationResult;
  adjustParameters(request: any, budget: TokenBudget): any;
}

interface TokenBudget {
  available: number;           // 128k - reserved margins
  reasoningTarget: number;     // Dynamic based on complexity
  outputTarget: number;        // Always reserve minimum
  safetyMargin: number;        // Buffer for unexpected usage
}
```

**Budget Allocation Rules**:
- Always reserve 4k for output
- Reserve 8k safety margin  
- Allocate remaining to reasoning based on input complexity
- If budget insufficient, force context compression

### 1.4 Fallback Strategies

**Current Issue**: Hard failures when token limits hit

**Solution**: Graceful degradation with multiple fallback levels

**Fallback Cascade**:
1. **Primary**: Full context + requested reasoning effort
2. **Level 1**: Compressed context + lower reasoning effort  
3. **Level 2**: Summary context + minimal reasoning
4. **Level 3**: Task decomposition into smaller sub-tasks
5. **Emergency**: Simple response with "task too complex" message

## Phase 2: File Storage Enhancement (Future Branch)

**Prerequisites**: Phase 1 must achieve >90% success rate before Phase 2 implementation

**Scope**: External file storage for complete responses, summaries in context

**Benefits**: Remove all size limitations, maintain conversation flow, full transparency

## Implementation Plan - Phase 1

### Task 1: Reasoning Controller (2-3 hours)
- [ ] Implement adaptive effort calculation based on input token analysis
- [ ] Add reasoning token estimation functions  
- [ ] Create token budget validation logic
- [ ] Add fallback effort level selection

### Task 2: Context Management (2-4 hours)
- [ ] Implement web search result summarization
- [ ] Add tool output compression utilities
- [ ] Create context windowing for large inputs
- [ ] Build progressive summarization for long conversations

### Task 3: Token Budget System (1-2 hours)  
- [ ] Implement proactive budget calculation
- [ ] Add request validation before API calls
- [ ] Create parameter auto-adjustment logic
- [ ] Add detailed token usage reporting

### Task 4: Fallback Architecture (2-3 hours)
- [ ] Implement cascade fallback system
- [ ] Add task decomposition for oversized requests
- [ ] Create graceful error handling
- [ ] Add user feedback for degraded responses

### Task 5: Testing & Validation (1-2 hours)
- [ ] Test with known failing cases (350k+ input tokens)
- [ ] Validate >90% success rate target
- [ ] Performance testing for latency impact
- [ ] Edge case handling verification

## Success Criteria - Phase 1

### Primary Goals
- **Success Rate**: >90% for all task complexities (vs current 67%)
- **Token Predictability**: Zero reasoning token budget overflows
- **Response Quality**: Maintain answer quality with optimized reasoning

### Secondary Goals  
- **Latency Impact**: <20% increase in response time
- **Context Efficiency**: Reduce average input tokens by 40%
- **User Experience**: Clear feedback when degradation applied

### Validation Tests
- **Test Case 1**: Complex Flask/Dokploy deployment (347k tokens) - Should succeed
- **Test Case 2**: Docker vs Podman analysis (489k tokens) - Should succeed  
- **Test Case 3**: Multi-part research task (500k+ tokens) - Should succeed with decomposition
- **Test Case 4**: Simple tasks - Should maintain current performance

## Technical Implementation Details

### Reasoning Effort Algorithm
```typescript
function calculateOptimalEffort(
  inputTokens: number, 
  taskComplexity: TaskComplexity,
  userRequestedEffort: ReasoningEffort
): ReasoningEffort {
  const availableBudget = 128000 - 4000 - 8000; // Reserve output + safety
  const estimatedReasoning = estimateReasoningTokens(inputTokens, userRequestedEffort);
  
  if (estimatedReasoning <= availableBudget * 0.7) {
    return userRequestedEffort; // Safe to use requested level
  }
  
  // Progressive degradation
  if (inputTokens < 100000) return 'medium';
  if (inputTokens < 200000) return 'low';  
  return 'minimal';
}
```

### Context Compression Strategy
```typescript
function compressContext(input: any[], targetTokens: number): any[] {
  // Priority: System prompt > Task > Recent tool results > Web results > Old context
  const segments = prioritizeSegments(input);
  let compressed = [];
  let usedTokens = 0;
  
  for (const segment of segments) {
    if (usedTokens + segment.tokens <= targetTokens) {
      compressed.push(segment.content);
      usedTokens += segment.tokens;
    } else {
      // Summarize if space allows
      const summary = summarizeSegment(segment, targetTokens - usedTokens);
      if (summary) compressed.push(summary);
      break;
    }
  }
  
  return compressed;
}
```

## Risk Assessment

### Low Risk
- Reasoning effort adjustment (OpenAI documented feature)
- Context summarization (standard practice)
- Token counting (reliable APIs available)

### Medium Risk  
- Performance impact from additional processing
- Quality degradation from aggressive compression
- User experience changes from fallback behaviors

### High Risk
- Complex edge cases in token estimation
- Interaction between reasoning tokens and tool calls
- Backward compatibility with existing workflows

## Expected Outcomes

### Before (Current State)
- Success Rate: ~67% for complex tasks
- Failures: Hard failures with no output
- User Experience: Unpredictable, frustrating failures
- Token Usage: Uncontrolled, frequently hits limits

### After (Phase 1 Completion)  
- Success Rate: >90% for all task types
- Failures: Rare, graceful degradation when they occur
- User Experience: Predictable, reliable responses with clear feedback
- Token Usage: Controlled, optimized, transparent

**Phase 1 is the foundation** - once this achieves >90% reliability, Phase 2 can add file storage enhancements for unlimited response sizes and improved user experience.