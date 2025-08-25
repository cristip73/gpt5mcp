import { Tool, ToolExecutionContext, ToolResult } from '../base.js';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';

interface ImageGenerationArgs {
  prompt: string;
  model?: 'dall-e-3' | 'gpt-image-1';
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
}

interface ImageGenerationResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

export class ImageGenerationTool extends Tool {
  name = 'image_generation';
  description = 'Generate images using OpenAI DALL-E 3 or GPT-Image-1 models. Images are automatically saved to _IMAGES folder for permanent storage.';
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
        description: 'The size of the generated images. DALL-E 3: 1024x1024, 1024x1792, 1792x1024. GPT-Image-1: 1024x1024, 1024x1536, 1536x1024, auto.',
        enum: ['1024x1024', '1024x1792', '1792x1024', '1024x1536', '1536x1024', 'auto'],
        default: '1024x1024'
      },
      quality: {
        type: 'string',
        description: 'The quality of the image. Only supported by dall-e-3: "standard" or "hd".',
        enum: ['standard', 'hd'],
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
      // GPT-Image-1 validations - different sizes than DALL-E 3
      const validSizes = ['1024x1024', '1024x1536', '1536x1024', 'auto'];
      if (!validSizes.includes(size)) {
        return { isValid: false, error: `Invalid size for gpt-image-1: ${size}. Valid sizes: ${validSizes.join(', ')}` };
      }

      // gpt-image-1 doesn't support quality or style parameters
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

      // Prepare request body - both models use the same Images API
      const requestBody: any = {
        model,
        prompt,
        n,
        size
      };

      // Add model-specific parameters
      if (model === 'dall-e-3') {
        requestBody.quality = quality;
        requestBody.response_format = 'url';
        if (style) {
          requestBody.style = style;
        }
      }
      // gpt-image-1 doesn't use quality, style or response_format parameters

      console.error('Making OpenAI Images API request:', JSON.stringify(requestBody, null, 2));

      // Both models use the same endpoint
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${context.apiKey}`,
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `OpenAI Images API error: ${response.status} ${response.statusText}`;
        
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

      const data = await response.json() as ImageGenerationResponse;
      console.error('OpenAI Images API response:', JSON.stringify(data, null, 2));

      if (!data.data || data.data.length === 0) {
        throw new Error('No images were generated');
      }

      // Get the image URL
      const image = data.data[0];
      const imageUrl = image.url;

      if (!imageUrl) {
        throw new Error('No image URL in response');
      }
      
      // Download and save image locally
      let localPath: string | null = null;
      try {
        localPath = await this.downloadAndSaveImage(imageUrl, prompt);
      } catch (error) {
        console.error('Failed to save image locally, continuing with URL only:', error);
      }

      let output = `✅ Image generated successfully!\n\n`;
      output += `🎨 **Model**: ${model}\n`;
      output += `📐 **Size**: ${size}\n`;
      if (model === 'dall-e-3') {
        output += `⭐ **Quality**: ${quality}\n`;
        if (style) {
          output += `🎭 **Style**: ${style}\n`;
        }
      }
      
      if (localPath) {
        output += `\n💾 **Saved locally**: ${localPath}\n`;
        output += `🔗 **Original URL**: ${imageUrl}\n`;
      } else {
        output += `\n🔗 **Image URL**: ${imageUrl}\n`;
      }
      
      if (image.revised_prompt) {
        output += `\n📝 **Revised Prompt**: ${image.revised_prompt}\n`;
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
          quality: model === 'dall-e-3' ? quality : null,
          style: style || null,
          image_url: imageUrl,
          local_path: localPath,
          revised_prompt: image.revised_prompt || null,
          created_at: new Date(data.created * 1000).toISOString()
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
      } else if (errorMessage.includes('only supports n=1')) {
        errorMessage = 'This model currently only supports generating 1 image at a time (n=1).';
      } else if (errorMessage.includes('Unrecognized request argument')) {
        errorMessage = `Invalid parameter sent to API: ${errorMessage}`;
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