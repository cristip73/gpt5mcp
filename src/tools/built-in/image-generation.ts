import { Tool, ToolExecutionContext, ToolResult } from '../base.js';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';

interface ImageGenerationArgs {
  prompt: string;
  model?: 'dall-e-3' | 'gpt-image-1';
  size?: string;
  quality?: 'standard' | 'hd' | 'low' | 'medium' | 'high';
  style?: 'vivid' | 'natural';
  n?: number;
}

interface DallE3Response {
  created: number;
  data: Array<{
    url: string;
    revised_prompt?: string;
  }>;
}

interface GPTImage1Response {
  id: string;
  object: string;
  created: number;
  model: string;
  status: string;
  output: Array<{
    type: string;
    role: string;
    content: Array<{
      type: string;
      image_url?: {
        url: string;
      };
    }>;
  }>;
  usage?: {
    input_image_pixels?: number;
    output_image_pixels?: number;
  };
}

export class ImageGenerationTool extends Tool {
  name = 'image_generation';
  description = 'Generate images using OpenAI DALL-E 3 or GPT-4o image generation models. Images are automatically saved to _IMAGES folder for permanent storage.';
  type = 'function' as const;

  parameters = {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'A text description of the desired image(s). The maximum length is 4000 characters.',
        maxLength: 4000
      },
      model: {
        type: 'string',
        enum: ['dall-e-3', 'gpt-image-1'],
        description: 'The model to use for image generation. gpt-image-1 offers high quality, higher cost. dall-e-3 offers medium quality, lower cost.',
        default: 'gpt-image-1'
      },
      size: {
        type: 'string',
        description: 'The size of the generated images. For dall-e-3: 1024x1024, 1024x1792, or 1792x1024. For gpt-image-1: 512x512, 1024x1024, 1024x1536, or 1536x1024.',
        enum: ['512x512', '1024x1024', '1024x1792', '1792x1024', '1024x1536', '1536x1024'],
        default: '1024x1024'
      },
      quality: {
        type: 'string',
        description: 'The quality of the image. For dall-e-3: "standard" or "hd". For gpt-image-1: "low", "medium", or "high".',
        enum: ['standard', 'hd', 'low', 'medium', 'high'],
        default: 'standard'
      },
      style: {
        type: 'string',
        enum: ['vivid', 'natural'],
        description: 'The style of the generated images. Only supported by dall-e-3. "vivid" creates hyper-real and dramatic images. "natural" creates more natural, less hyper-real looking images.',
        default: 'vivid'
      },
      n: {
        type: 'integer',
        minimum: 1,
        maximum: 1,
        description: 'The number of images to generate. Currently only n=1 is supported by both models.',
        default: 1
      }
    },
    required: ['prompt'],
    additionalProperties: false
  };

  private validateParameters(args: ImageGenerationArgs): { isValid: boolean; error?: string } {
    const { model = 'gpt-image-1', size = '1024x1024', quality = 'standard', style } = args;

    // Validate model-specific parameters
    if (model === 'dall-e-3') {
      // DALL-E 3 validations
      const validSizes = ['1024x1024', '1024x1792', '1792x1024'];
      if (!validSizes.includes(size)) {
        return { isValid: false, error: `Invalid size for dall-e-3: ${size}. Valid sizes: ${validSizes.join(', ')}` };
      }

      const validQualities = ['standard', 'hd'];
      if (!validQualities.includes(quality)) {
        return { isValid: false, error: `Invalid quality for dall-e-3: ${quality}. Valid qualities: ${validQualities.join(', ')}` };
      }

      if (style && !['vivid', 'natural'].includes(style)) {
        return { isValid: false, error: `Invalid style for dall-e-3: ${style}. Valid styles: vivid, natural` };
      }
    } else if (model === 'gpt-image-1') {
      // GPT-Image-1 validations
      const validSizes = ['512x512', '1024x1024', '1024x1536', '1536x1024'];
      if (!validSizes.includes(size)) {
        return { isValid: false, error: `Invalid size for gpt-image-1: ${size}. Valid sizes: ${validSizes.join(', ')}` };
      }

      const validQualities = ['low', 'medium', 'high'];
      if (!validQualities.includes(quality)) {
        return { isValid: false, error: `Invalid quality for gpt-image-1: ${quality}. Valid qualities: ${validQualities.join(', ')}` };
      }

      if (style) {
        return { isValid: false, error: 'Style parameter is not supported by gpt-image-1 model' };
      }
    }

    return { isValid: true };
  }

  private async downloadAndSaveImage(imageUrl: string, prompt: string): Promise<string> {
    try {
      // Create _IMAGES directory if it doesn't exist
      const imagesDir = path.join(process.cwd(), '_IMAGES');
      await fs.mkdir(imagesDir, { recursive: true });

      // Generate filename from prompt (sanitized) and timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const sanitizedPrompt = prompt.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').slice(0, 50);
      const filename = `${sanitizedPrompt}_${timestamp}.png`;
      const filepath = path.join(imagesDir, filename);

      // Download image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }

      // Save to file
      const buffer = await response.buffer();
      await fs.writeFile(filepath, buffer);

      console.error(`Image saved locally: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error('Failed to save image locally:', error);
      throw error;
    }
  }

  private async generateWithDallE3(prompt: string, size: string, quality: string, style: string | undefined, apiKey: string): Promise<{ url: string; revisedPrompt?: string }> {
    const requestBody: any = {
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      quality,
      response_format: 'url'
    };

    if (style) {
      requestBody.style = style;
    }

    console.error('Making DALL-E 3 API request:', JSON.stringify(requestBody, null, 2));

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `DALL-E 3 API error: ${response.status} ${response.statusText}`;
      
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

    const data = await response.json() as DallE3Response;
    console.error('DALL-E 3 API response:', JSON.stringify(data, null, 2));

    if (!data.data || data.data.length === 0) {
      throw new Error('No images were generated');
    }

    return {
      url: data.data[0].url,
      revisedPrompt: data.data[0].revised_prompt
    };
  }

  private async generateWithGPTImage1(prompt: string, size: string, quality: string, apiKey: string): Promise<{ url: string; revisedPrompt?: string }> {
    // Map quality to pixel counts for gpt-image-1
    const qualityToPixels: Record<string, number> = {
      'low': 512 * 512,
      'medium': 1024 * 1024,
      'high': 1536 * 1024
    };

    // Note: gpt-image-1 doesn't accept size parameter directly in the API
    // The size is determined by the quality level or specific request configuration

    const requestBody = {
      model: 'gpt-image-1',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompt
            }
          ]
        }
      ]
    };

    console.error('Making GPT-Image-1 API request:', JSON.stringify(requestBody, null, 2));

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `GPT-Image-1 API error: ${response.status} ${response.statusText}`;
      
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

    const data = await response.json() as GPTImage1Response;
    console.error('GPT-Image-1 API response:', JSON.stringify(data, null, 2));

    // Extract image URL from the response structure
    const output = data.output?.[0];
    const content = output?.content?.[0];
    const imageUrl = content?.image_url?.url;

    if (!imageUrl) {
      throw new Error('No image URL found in GPT-Image-1 response');
    }

    return {
      url: imageUrl,
      revisedPrompt: undefined // GPT-Image-1 doesn't return revised prompts
    };
  }

  async execute(args: ImageGenerationArgs, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const { prompt, model = 'gpt-image-1', size = '1024x1024', quality = 'standard', style, n = 1 } = args;
      
      console.error(`Image generation: "${prompt}" using ${model} (${size}, ${quality}${style ? `, ${style}` : ''})`);

      // Validate parameters
      const validation = this.validateParameters(args);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      // Validate prompt length  
      const maxLength = 4000; // Both dall-e-3 and gpt-image-1 support 4000 characters
      if (prompt.length > maxLength) {
        throw new Error(`Prompt too long: ${prompt.length} characters. Maximum: ${maxLength} characters.`);
      }

      // Generate image based on model
      let imageResult: { url: string; revisedPrompt?: string };
      
      if (model === 'dall-e-3') {
        imageResult = await this.generateWithDallE3(prompt, size, quality, style, context.apiKey);
      } else {
        imageResult = await this.generateWithGPTImage1(prompt, size, quality, context.apiKey);
      }

      // Download and save image locally
      let localPath: string | null = null;
      try {
        localPath = await this.downloadAndSaveImage(imageResult.url, prompt);
      } catch (error) {
        console.error('Failed to save image locally, continuing with URL only:', error);
      }

      let output = `✅ Image generated successfully!\n\n`;
      output += `🎨 **Model**: ${model}\n`;
      output += `📐 **Size**: ${size}\n`;
      output += `⭐ **Quality**: ${quality}\n`;
      if (style && model === 'dall-e-3') {
        output += `🎭 **Style**: ${style}\n`;
      }
      
      if (localPath) {
        output += `\n💾 **Saved locally**: ${localPath}\n`;
        output += `🔗 **Original URL**: ${imageResult.url}\n`;
      } else {
        output += `\n🔗 **Image URL**: ${imageResult.url}\n`;
      }
      
      if (imageResult.revisedPrompt) {
        output += `\n📝 **Revised Prompt**: ${imageResult.revisedPrompt}\n`;
      }

      if (localPath) {
        output += `\n📁 **Note**: Image saved in _IMAGES folder for permanent storage. URL expires after 1 hour.`;
      } else {
        output += `\n⚠️  **Note**: Image URLs are temporary and typically expire after 1 hour.`;
      }

      return {
        tool_call_id: `image_gen_${Date.now()}`,
        output,
        status: 'success',
        metadata: {
          model,
          size,
          quality,
          style: style || null,
          image_url: imageResult.url,
          local_path: localPath,
          revised_prompt: imageResult.revisedPrompt || null,
          created_at: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Image generation error:', error);
      
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      // Handle common error types
      if (errorMessage.includes('content_policy_violation')) {
        errorMessage = 'The image request was rejected as it violates OpenAI content policy. Please revise your prompt to avoid potentially harmful, illegal, or inappropriate content.';
      } else if (errorMessage.includes('rate_limit_exceeded')) {
        errorMessage = 'Rate limit exceeded. Please wait a moment before making another image generation request.';
      } else if (errorMessage.includes('insufficient_quota')) {
        errorMessage = 'Insufficient quota for image generation. Please check your OpenAI account usage and billing.';
      } else if (errorMessage.includes('model_not_found') || errorMessage.includes('gpt-image-1')) {
        errorMessage = 'The gpt-image-1 model may not be available for your account. Try using dall-e-3 instead.';
      }

      return {
        tool_call_id: `image_gen_error_${Date.now()}`,
        output: '',
        error: `Image generation failed: ${errorMessage}`,
        status: 'error'
      };
    }
  }
}