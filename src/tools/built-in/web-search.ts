import { Tool, ToolExecutionContext, ToolResult } from '../base.js';
import fetch from 'node-fetch';

interface WebSearchArgs {
  query: string;
  max_results?: number;
  time_range?: 'day' | 'week' | 'month' | 'year';
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class WebSearchTool extends Tool {
  name = 'web_search';
  description = 'Search the web for current information using DuckDuckGo';
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
      
      console.error(`Web search: "${query}" (${max_results} results, ${time_range})`);

      // Use DuckDuckGo Instant Answer API (free)
      const searchUrl = 'https://api.duckduckgo.com/';
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        pretty: '1',
        no_redirect: '1',
        no_html: '1',
        skip_disambig: '1'
      });

      const response = await fetch(`${searchUrl}?${params}`, {
        headers: {
          'User-Agent': 'GPT5-MCP-Server/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`DuckDuckGo API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      
      // Try to get results from different sources in the response
      const results: SearchResult[] = [];
      
      // Check for instant answer
      if (data.Answer) {
        results.push({
          title: 'Instant Answer',
          url: data.AnswerURL || 'https://duckduckgo.com',
          snippet: data.Answer
        });
      }

      // Check for abstract
      if (data.Abstract && data.Abstract.length > 0) {
        results.push({
          title: data.AbstractSource || 'Abstract',
          url: data.AbstractURL || 'https://duckduckgo.com',
          snippet: data.Abstract
        });
      }

      // Check for related topics
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, max_results - results.length)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || 'Related Topic',
              url: topic.FirstURL,
              snippet: topic.Text
            });
          }
        }
      }

      // Check for definition
      if (data.Definition && data.Definition.length > 0) {
        results.push({
          title: 'Definition',
          url: data.DefinitionURL || 'https://duckduckgo.com',
          snippet: data.Definition
        });
      }

      // If we don't have enough results, add a fallback search suggestion
      if (results.length === 0) {
        // Try a more comprehensive search using a different approach
        const fallbackSearchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        results.push({
          title: 'DuckDuckGo Search Results',
          url: fallbackSearchUrl,
          snippet: `Search results for "${query}" - Click to view full results on DuckDuckGo`
        });
      }

      // Format the output
      const formattedResults = results.slice(0, max_results).map((result, index) => 
        `${index + 1}. **${result.title}**\n   ${result.snippet}\n   URL: ${result.url}`
      ).join('\n\n');

      const output = `Web search results for "${query}":\n\n${formattedResults}`;

      return {
        tool_call_id: `web_search_${Date.now()}`,
        output,
        status: 'success',
        metadata: {
          query,
          results_count: results.length,
          time_range,
          search_engine: 'DuckDuckGo'
        }
      };

    } catch (error) {
      console.error('Web search error:', error);
      return {
        tool_call_id: `web_search_error_${Date.now()}`,
        output: '',
        error: `Web search failed: ${error instanceof Error ? error.message : String(error)}`,
        status: 'error'
      };
    }
  }
}