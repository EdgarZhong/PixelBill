import { DesktopApp } from './views/DesktopApp';
import { MobileApp } from './views/MobileApp';
import { useState, useEffect } from 'react';
import { configManager } from './core/config/ConfigManager';
import { FetchClient } from './core/network/FetchClient';
import { AnimatePresence } from 'framer-motion';
import { SplashScreen } from './components/SplashScreen';
// import { generateSystemPrompt } from './core/llm_service/prompt/SystemPrompt';

function App() {
  const [isMobile, setIsMobile] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

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

  // Handle Splash Screen Logic
  useEffect(() => {
    // Force splash screen to stay for at least 1.5s to ensure "No Flash" and "Data Warming"
    // This replaces the manual delay we added in useLedger.ts
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1500);
    
    return () => clearTimeout(timer);
  }, []);

  // --- Debug / Console Testing Exposure ---
  useEffect(() => {
    // Expose internal tools to window for console testing
    if (import.meta.env.DEV) {
      // @ts-expect-error - Exposing for debug
      window.__DEBUG_TOOLS__ = {
        configManager,
        FetchClient,
      };
    }
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* 1. Main App Layer (Base Layer) */}
      {/* It is always rendered in the background to ensure "No Flash" when splash exits */}
      <div className="absolute inset-0 z-0">
        {isMobile ? <MobileApp /> : <DesktopApp />}
      </div>

      {/* 2. Splash Screen Overlay Layer */}
      {/* High z-index ensures it covers everything */}
      <AnimatePresence>
        {showSplash && <SplashScreen key="splash" />}
      </AnimatePresence>
    </div>
  );
}

export default App;

