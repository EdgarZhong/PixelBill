import { DesktopApp } from './views/DesktopApp';
import { MobileApp } from './views/MobileApp';
import { useState, useEffect } from 'react';

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

  // Return appropriate layout based on current viewport
  return isMobile ? <MobileApp /> : <DesktopApp />;
}

export default App;

