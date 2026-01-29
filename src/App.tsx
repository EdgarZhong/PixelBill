import { DesktopApp } from './views/DesktopApp';
import { MobileApp } from './views/MobileApp';
import { useState, useEffect } from 'react';
import { configManager } from './core/config/ConfigManager';
import { FetchClient } from './core/network/FetchClient';

function App() {
  const [isMobile, setIsMobile] = useState(false);

  // Monitor window resize and determine layout based on viewport width
  useEffect(() => {
    const checkIsMobile = () => {
      // Mobile breakpoint: less than 768px (typical tablet/mobile threshold)
      const isMobileView = window.innerWidth < 768;
      setIsMobile(isMobileView);
    };

    // Check on mount
    checkIsMobile();

    // Listen to resize events
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // --- Debug / Console Testing Exposure ---
  useEffect(() => {
    // Expose internal tools to window for console testing
    if (import.meta.env.DEV) {
      // @ts-expect-error - Exposing for debug
      window.__DEBUG_TOOLS__ = {
        configManager,
        FetchClient,
        testLLM: async (question: string = '1+1=?') => {
          try {
            console.log('[Debug] Starting LLM Test...');
            const config = await configManager.getConfig();
            console.log('[Debug] Config loaded:', { ...config, apiKey: '***' });
            
            if (!config.apiKey) {
              console.error('[Debug] No API Key found in config!');
              return;
            }

            const requestBody = {
              model: config.model,
              messages: [{ role: 'user', content: question }],
              stream: false,
              extra_body: config.enableThinking ? { enable_thinking: true } : undefined
            };

            const url = config.baseUrl.endsWith('/') 
              ? `${config.baseUrl}chat/completions` 
              : `${config.baseUrl}/chat/completions`;
              
            const cleanUrl = url.replace('//chat', '/chat'); // Fix double slashes

            console.log(`[Debug] POST ${cleanUrl}`);
            
            const response = await FetchClient.request<any>(cleanUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
              },
              body: JSON.stringify(requestBody)
            });

            console.log('[Debug] Raw Response:', response);
            
            if (response.choices && response.choices.length > 0) {
              const msg = response.choices[0].message;
              console.log('\n================ AI RESPONSE ================');
              if (msg.reasoning_content) {
                console.log('%c[Thinking Process]:', 'color: orange; font-weight: bold;');
                console.log(msg.reasoning_content);
                console.log('---------------------------------------------');
              }
              console.log('%c[Final Content]:', 'color: #4ade80; font-weight: bold;'); // pixel-green
              console.log(msg.content);
              console.log('=============================================\n');
            } else {
              console.warn('[Debug] No choices in response');
            }

            return response;
          } catch (e) {
            console.error('[Debug] LLM Test Failed:', e);
            throw e;
          }
        }
      };
      console.log('🔧 Debug Tools Exposed: window.__DEBUG_TOOLS__.testLLM()');
    }
  }, []);

  // Return appropriate layout based on current viewport
  return isMobile ? <MobileApp /> : <DesktopApp />;
}

export default App;

