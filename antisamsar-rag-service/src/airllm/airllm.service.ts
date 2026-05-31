import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

@Injectable()
export class AirLLMService {
  private readonly logger = new Logger(AirLLMService.name);
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('AIRLLM_URL') || 'http://localhost:8000';
    this.timeout = 60_000; // 60 secondes
    this.maxRetries = 2;
  }

  /**
   * Envoie un prompt à AirLLM et retourne la réponse textuelle générée.
   */
  async generate(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/generate`;
    const payload = {
      prompt,
      max_tokens: 700,
      temperature: 0.3,
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.log(
          `AirLLM request — attempt ${attempt}/${this.maxRetries}, prompt length: ${prompt.length} chars`,
        );

        const response = await axios.post<{ text?: string; response?: string; generated_text?: string }>(
          url,
          payload,
          {
            timeout: this.timeout,
            headers: { 'Content-Type': 'application/json' },
          },
        );

        // Support plusieurs conventions de réponse AirLLM
        const text =
          response.data?.text ||
          response.data?.response ||
          response.data?.generated_text;

        if (!text) {
          throw new Error('AirLLM returned an empty response body.');
        }

        this.logger.log(`AirLLM response received — ${text.length} chars`);
        return text.trim();
      } catch (err: any) {
        lastError = err;
        const axiosErr = err as AxiosError;

        if (axiosErr.code === 'ECONNREFUSED') {
          this.logger.warn(
            `AirLLM server not reachable at ${url}. Is the AirLLM server running?`,
          );
          // Pas de retry si le serveur est éteint
          break;
        }

        this.logger.warn(
          `AirLLM attempt ${attempt} failed: ${err.message}. ${attempt < this.maxRetries ? 'Retrying...' : 'No more retries.'}`,
        );

        if (attempt < this.maxRetries) {
          await this.sleep(1000 * attempt); // backoff exponentiel léger
        }
      }
    }

    // Retourner un message de fallback plutôt que de crasher le pipeline
    this.logger.error(
      `AirLLM failed after ${this.maxRetries} attempts: ${lastError?.message}`,
    );
    return (
      "Le service IA n'est pas disponible pour le moment. " +
      "Voici les annonces les plus pertinentes pour votre recherche selon notre moteur de similarité."
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
