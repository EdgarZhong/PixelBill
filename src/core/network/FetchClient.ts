// 简单的 HTTP 客户端封装
// 职责：处理超时、重试、错误统一包装

export interface FetchOptions extends RequestInit {
  timeout?: number; // ms
  retries?: number;
}

export class FetchClient {
  private static readonly DEFAULT_TIMEOUT = 30000; // 30s
  private static readonly DEFAULT_RETRIES = 1;

  public static async request<T>(url: string, options: FetchOptions = {}): Promise<T> {
    const { timeout = this.DEFAULT_TIMEOUT, retries = this.DEFAULT_RETRIES, ...fetchInit } = options;

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= retries) {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...fetchInit,
          signal: controller.signal
        });

        clearTimeout(id);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // 尝试解析 JSON
        try {
          return await response.json() as T;
        } catch (e) {
          throw new Error('Invalid JSON response');
        }

      } catch (err: any) {
        lastError = err;
        
        // 如果是 AbortError (超时)，则视为可重试
        // 如果是 5xx 错误，也可重试
        // 4xx 错误通常不重试
        const isTimeout = err.name === 'AbortError';
        const isNetworkError = err instanceof TypeError; // fetch network error
        
        if (isTimeout || isNetworkError) {
          console.warn(`[FetchClient] Attempt ${attempt + 1} failed: ${err.message}. Retrying...`);
          attempt++;
          // Exponential backoff
          if (attempt <= retries) {
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          }
        } else {
          // 其他错误直接抛出
          throw err;
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  // Helper for POST JSON
  public static async post<T>(url: string, body: any, headers: Record<string, string> = {}, options: FetchOptions = {}): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(body),
      ...options
    });
  }
}
