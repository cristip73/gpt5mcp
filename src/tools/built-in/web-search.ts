import { Tool, ToolExecutionContext, ToolResult } from '../base.js';
import fetch from 'node-fetch';

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

      // Prepare request for OpenAI Responses API with web search
      const requestBody: OpenAIWebSearchRequest = {
        model: 'gpt-5', // Use GPT-5 for web search capability
        input: searchPrompt,
        tools: [
          {
            type: 'web_search'
          }
        ],
        max_output_tokens: 4000,
        stream: false
      };

      console.error('Making OpenAI Responses API request for web search:', {
        model: requestBody.model,
        query,
        max_results,
        time_range
      });

      // Make API request to OpenAI's web search
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
      console.error('Full response structure:', JSON.stringify(data, null, 2));

      // Extract web search results
      let searchResults = '';
      let hasWebSearchResults = false;
      let searchActions = [];
      let citations = [];

      // Parse the response for web search results
      if (data.output && Array.isArray(data.output)) {
        for (const item of data.output) {
          console.error('Found output item:', { type: item.type, id: item.id, status: item.status });
          
          // First check if this is the tool call confirmation
          if (item.type === 'web_search_call') {
            console.error('Found web_search_call in response:', item);
            hasWebSearchResults = true;
          }
          
          // The actual results are in message objects with role "assistant"
          if (item.type === 'message' && item.role === 'assistant' && item.content && Array.isArray(item.content)) {
            console.error('Found assistant message with content');
            
            for (const contentItem of item.content) {
              if (contentItem.type === 'output_text' && contentItem.text) {
                console.error('Found output_text with actual content');
                searchResults += contentItem.text + '\n';
                hasWebSearchResults = true;
                
                // Extract citations/annotations
                if (contentItem.annotations && Array.isArray(contentItem.annotations)) {
                  for (const annotation of contentItem.annotations) {
                    if (annotation.type === 'url_citation' && annotation.url && annotation.title) {
                      citations.push({
                        url: annotation.url,
                        title: annotation.title,
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

      // Also check the main output text for search results
      let finalOutput = '';
      if (data.output_text) {
        finalOutput = data.output_text;
      }

      // Format the result
      let result = '';
      
      if (hasWebSearchResults || finalOutput) {
        result = `🔍 **Web Search Results** (OpenAI Built-in Search)\n\n`;
        result += `**Query**: ${query}\n`;
        result += `**Max Results**: ${max_results}\n`;
        result += `**Time Range**: ${time_range}\n\n`;
        
        if (searchResults) {
          result += `**Search Results**:\n${searchResults.trim()}\n\n`;
        }
        
        if (finalOutput && finalOutput !== searchResults) {
          result += `**Summary**:\n${finalOutput}\n`;
        }
        
        // Add citations if available
        if (citations.length > 0) {
          result += `**Sources**:\n`;
          citations.forEach((citation, index) => {
            result += `${index + 1}. [${citation.title}](${citation.url})\n`;
          });
          result += '\n';
        }
        
        result += `✅ **Searched using OpenAI's built-in web search**`;
      } else {
        result = `❌ **No Web Search Results**\n\nThe web search tool did not return any results. This may indicate:\n- No relevant results found for the query\n- API limitations\n- Query too specific or too broad\n\nPlease try rephrasing your query or make it more specific.`;
      }

      return {
        tool_call_id: `web_search_${Date.now()}`,
        output: result,
        status: (hasWebSearchResults || finalOutput) ? 'success' : 'error',
        metadata: {
          query,
          max_results,
          time_range,
          search_engine: 'OpenAI Built-in',
          has_results: hasWebSearchResults,
          model_used: 'gpt-5'
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