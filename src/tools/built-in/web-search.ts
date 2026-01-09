import { Tool, ToolExecutionContext, ToolResult } from '../base.js';

interface WebSearchArgs {
  query: string;
  max_results?: number;
  time_range?: 'day' | 'week' | 'month' | 'year';
}

interface OpenAIWebSearchRequest {
  model: string;
  input: string;
  tools: Array<{
    type: 'web_search' | 'web_search_preview';
  }>;
  max_output_tokens?: number;
  stream?: boolean;
}

export class WebSearchTool extends Tool {
  name = 'web_search';
  description = 'Search the web for current information using OpenAI built-in web search';
  type = 'web_search' as const;
  
  parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query'
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 10)',
        minimum: 1,
        maximum: 10,
        default: 5
      },
      time_range: {
        type: 'string',
        enum: ['day', 'week', 'month', 'year'],
        description: 'Time range for search results',
        default: 'month'
      }
    },
    required: ['query'],
    additionalProperties: false
  };

  async execute(args: WebSearchArgs, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const { query, max_results = 5, time_range = 'month' } = args;
      
      console.error(`Web search: "${query}" using OpenAI built-in web search (${max_results} results, ${time_range})`);

      // Construct search prompt with parameters
      let searchPrompt = `Search for: ${query}`;
      if (time_range) {
        searchPrompt += ` (prioritize results from the last ${time_range})`;
      }
      if (max_results) {
        searchPrompt += ` (provide up to ${max_results} relevant results)`;
      }

      // Prepare request for OpenAI Responses API with web search tool
      const requestBody: OpenAIWebSearchRequest = {
        model: 'gpt-4o', // Using GPT-4o with Responses API
        input: searchPrompt,
        tools: [
          {
            type: 'web_search_preview' // Use web_search_preview tool for actual web searches
          }
        ],
        max_output_tokens: 4000,
        stream: false
      };

      console.error('Making OpenAI Responses API request for web search:', {
        model: requestBody.model,
        query,
        max_results,
        time_range,
        tool: 'web_search_preview'
      });

      // Make API request to OpenAI's Responses API with web search tool
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${context.apiKey}`,
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `OpenAI Responses API error: ${response.status} ${response.statusText}`;
        
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          }
        } catch {
          errorMessage += ` - ${errorText}`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json() as any;
      console.error('OpenAI Web Search API response received');

      // Extract web search results
      let searchResults = '';
      let hasWebSearchResults = false;
      let searchActions: any[] = [];
      let citations: Array<{url: string, title: string, start_index?: number, end_index?: number}> = [];

      // Parse Responses API response with web search results
      // The response structure includes output array with web_search_call and message objects
      if (data.output && Array.isArray(data.output)) {
        console.error('Found output array with', data.output.length, 'items');
        
        for (const item of data.output) {
          console.error('Processing output item:', { type: item.type, id: item.id, status: item.status });
          
          // Check for web_search_call confirmation
          if (item.type === 'web_search_call') {
            console.error('Web search was performed:', item);
            hasWebSearchResults = true;
          }
          
          // Extract actual search results from message objects
          if (item.type === 'message' && item.role === 'assistant') {
            // Check for content array with actual results
            if (item.content && Array.isArray(item.content)) {
              for (const contentItem of item.content) {
                // Look for output_text with search results
                if (contentItem.type === 'output_text' && contentItem.text) {
                  console.error('Found search results text');
                  searchResults += contentItem.text + '\n';
                  hasWebSearchResults = true;
                  
                  // Extract URL citations from annotations
                  if (contentItem.annotations && Array.isArray(contentItem.annotations)) {
                    for (const annotation of contentItem.annotations) {
                      if (annotation.type === 'url_citation') {
                        console.error('Found URL citation:', annotation.title, annotation.url);
                        citations.push({
                          url: annotation.url || '',
                          title: annotation.title || '',
                          start_index: annotation.start_index,
                          end_index: annotation.end_index
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      // Also check output_text field for synthesized results
      let finalOutput = data.output_text || searchResults;

      // Format the result
      let result = '';
      
      if (hasWebSearchResults || finalOutput) {
        result = `🔍 **Web Search Results** (Real-time Internet Search)\n\n`;
        result += `**Query**: "${query}"\n`;
        if (citations.length > 0) {
          result += `**Sources Found**: ${citations.length} web sources\n`;
        }
        result += `**Time Range**: ${time_range}\n\n`;
        
        // Show the synthesized results
        if (finalOutput) {
          result += `**Results**:\n${finalOutput.trim()}\n\n`;
        } else if (searchResults) {
          result += `**Results**:\n${searchResults.trim()}\n\n`;
        }
        
        // Add source citations with proper URLs
        if (citations.length > 0) {
          result += `**📌 Sources**:\n`;
          citations.forEach((citation, index) => {
            if (citation.url && citation.url.startsWith('http')) {
              result += `${index + 1}. [${citation.title || 'Source'}](${citation.url})\n`;
            } else if (citation.title) {
              result += `${index + 1}. ${citation.title}\n`;
            }
          });
          result += '\n';
        }
        
        result += `✅ **Live web search performed with up-to-date results**`;
      } else {
        result = `❌ **No Web Search Results**\n\nThe web search tool did not return any results. This may indicate:\n- No relevant results found for the query\n- API limitations\n- Query too specific or too broad\n\nPlease try rephrasing your query or make it more specific.`;
      }

      // Check if web search was successful
      if (!hasWebSearchResults && (!data.output || data.output.length === 0)) {
        console.error('No web search results found in response');
        return {
          tool_call_id: `web_search_${Date.now()}`,
          output: `❌ **Web Search Error**: No search results returned from API. The web search tool may not be available or the query didn't return results.`,
          status: 'error',
          metadata: {
            query,
            max_results,
            time_range,
            search_engine: 'OpenAI Web Search',
            has_results: false,
            model_used: requestBody.model,
            error: 'no_results'
          }
        };
      }

      return {
        tool_call_id: `web_search_${Date.now()}`,
        output: result,
        status: (hasWebSearchResults || finalOutput) ? 'success' : 'error',
        metadata: {
          query,
          max_results,
          time_range,
          search_engine: 'OpenAI Web Search (Responses API)',
          has_results: hasWebSearchResults,
          model_used: requestBody.model,
          tool_used: 'web_search_preview'
        }
      };

    } catch (error) {
      console.error('Web search error:', error);
      
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      // Handle common error types
      if (errorMessage.includes('rate_limit_exceeded')) {
        errorMessage = 'Rate limit exceeded for web search. Please wait a moment before trying again.';
      } else if (errorMessage.includes('insufficient_quota')) {
        errorMessage = 'Insufficient quota for web search. Please check your OpenAI account usage.';
      } else if (errorMessage.includes('model_not_found')) {
        errorMessage = 'Web search model not available. Please try again later.';
      } else if (errorMessage.includes('content_policy_violation')) {
        errorMessage = 'Web search blocked by content policy. Please ensure your query follows OpenAI\'s usage guidelines.';
      }
      
      return {
        tool_call_id: `web_search_error_${Date.now()}`,
        output: '',
        error: `Web search failed: ${errorMessage}`,
        status: 'error',
        metadata: {
          query: args.query || '',
          search_engine: 'OpenAI Built-in',
          error_type: 'api_error'
        }
      };
    }
  }
}