import { DesktopApp } from './views/DesktopApp';
import { MobileApp } from './views/MobileApp';
import { IS_MOBILE } from './config/ui-mode';

function App() {
  // Simple Conditional Entry based on config
  return IS_MOBILE ? <MobileApp /> : <DesktopApp />;
}

export default App;
