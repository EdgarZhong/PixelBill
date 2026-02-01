import { ChatMessage, LLMConfig } from './types';
import { RawLogger } from '../logging/RawLogger';
import { FetchClient as NetworkClient } from '../network/FetchClient';

export class LLMClient {
  private config: LLMConfig;
  private logger: RawLogger;

  constructor(config: LLMConfig) {
    this.config = config;
    this.logger = new RawLogger();
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const url = `${this.config.baseUrl}/chat/completions`;
    
    const payload = {
      model: this.config.model,
      messages: messages,
      response_format: { type: "json_object" },
      temperature: this.config.temperature || 0.3,
      stream: false
    };

    try {
      // Log Request
      const startTime = Date.now();
      
      const response = await NetworkClient.post<any>(
        url,
        payload,
        {
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        {
          timeout: 60000, // 60s for LLM
          retries: 3
        }
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Extract content
      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      // Log Interaction
      await this.logger.logInteraction(
        messages,
        response,
        duration,
        this.config.model
      );

      return content;

    } catch (error: any) {
      console.error('[LLMClient] Chat request failed:', error);
      throw error;
    }
  }
}
