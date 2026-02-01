import { useEffect, useRef, useState } from 'react';
import { isNative } from '../utils/fs-storage';
import type { StorageHandle, NativeFileHandle } from '../utils/fs-storage';
import { Filesystem, Directory } from '@capacitor/filesystem';

export interface FileChangeInfo {
  lastModified: number;
}

/**
 * Watch for file system handle changes (polling based)
 * Supports both Web (FileSystemAccessAPI) and Native (Capacitor Filesystem)
 */
export function useFileWatcher(
  fileHandle: StorageHandle | null,
  onFileChange: (info: FileChangeInfo) => void,
  interval: number = 2000
) {
  const lastModifiedRef = useRef<number>(0);
  const [isWatching, setIsWatching] = useState(false);

  // Use ref for callback to avoid stale closures
  const callbackRef = useRef(onFileChange);
  useEffect(() => {
    callbackRef.current = onFileChange;
  }, [onFileChange]);

  useEffect(() => {
    // Mobile Performance Optimization:
    // Disable file watching on native devices to save battery and CPU.
    // Cloud Sync (Future) should use a dedicated Event Bus or Push Notification mechanism,
    // not low-level file polling.
    if (!fileHandle || isNative) {
      setIsWatching(false);
      if (isNative) {
        console.log('[FileWatcher] Disabled on native platform for performance.');
      }
      return;
    }

    const getMetadata = async (): Promise<number> => {
      if (isNative) {
        const nativeHandle = fileHandle as NativeFileHandle;
        try {
          const stat = await Filesystem.stat({
            path: nativeHandle.path,
            directory: Directory.Documents
          });
          return stat.mtime;
        } catch (e) {
          console.warn('[FileWatcher] Native stat failed:', e);
          throw e;
        }
      } else {
        const webHandle = fileHandle as FileSystemFileHandle;
        const file = await webHandle.getFile();
        return file.lastModified;
      }
    };

    // Initialize lastModified
    getMetadata().then(mtime => {
      lastModifiedRef.current = mtime;
      setIsWatching(true);
      console.log('[FileWatcher] Started watching:', isNative ? (fileHandle as NativeFileHandle).path : (fileHandle as FileSystemFileHandle).name);
    }).catch(err => {
      console.warn('[FileWatcher] Init failed:', err);
    });

    const checkFile = async () => {
      try {
        const currentMtime = await getMetadata();
        
        if (currentMtime > lastModifiedRef.current) {
          console.log('[FileWatcher] Change detected!', {
            oldTime: new Date(lastModifiedRef.current).toLocaleTimeString(),
            newTime: new Date(currentMtime).toLocaleTimeString()
          });
          
          lastModifiedRef.current = currentMtime;
          callbackRef.current({ lastModified: currentMtime });
        }
      } catch (err) {
        // Silently fail on check errors to avoid log spam
        // console.warn('[FileWatcher] Check failed:', err);
      }
    };

    const timer = setInterval(checkFile, interval);

    // Check on focus
    const handleFocus = () => {
      checkFile();
    };
    
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fileHandle, interval]);

  return isWatching;
}
