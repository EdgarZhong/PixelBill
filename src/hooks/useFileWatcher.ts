import { useEffect, useRef, useState } from 'react';

/**
 * 监听文件系统句柄的变化 (基于 lastModified 轮询)
 * @param fileHandle 文件句柄
 * @param onFileChange 当文件发生变化时的回调
 * @param interval 轮询间隔 (ms), 默认 2000
 */
export function useFileWatcher(
  fileHandle: FileSystemFileHandle | null,
  onFileChange: (file: File) => void,
  interval: number = 2000
) {
  const lastModifiedRef = useRef<number>(0);
  const [isWatching, setIsWatching] = useState(false);

  // 使用 ref 存储回调，避免闭包陷阱导致的重复 effect 执行
  const callbackRef = useRef(onFileChange);
  useEffect(() => {
    callbackRef.current = onFileChange;
  }, [onFileChange]);

  useEffect(() => {
    if (!fileHandle) {
      setIsWatching(false);
      return;
    }

    // 初始化 lastModified
    fileHandle.getFile().then(file => {
      lastModifiedRef.current = file.lastModified;
      setIsWatching(true);
      console.log('[FileWatcher] Started watching:', file.name);
    }).catch(err => {
      console.warn('[FileWatcher] Init failed:', err);
    });

    const checkFile = async () => {
      try {
        const file = await fileHandle.getFile();
        // 只有当修改时间严格大于记录时间时才触发
        // 注意：如果是 App 自己写入文件，App 内存中的 lastModified 应该在写入后更新，
        // 防止自己触发自己。但在 useFileWatcher 层面，我们只管文件。
        // 为了避免“自己写入->触发watcher->重新读取”的循环，
        // App 层需要在写入成功后更新 lastModifiedRef (这很难做到，因为 ref 在 hook 内部)。
        // 替代方案：App 写入后，文件变了，Watcher 触发重读。
        // 重读的内容和内存一样（因为是 App 刚写的）。
        // 这样虽然多读了一次，但是数据一致的，不会造成死循环（只要写入操作不改变 lastModified... 等等，写入肯定改变 lastModified）。
        // 
        // 关键点：如果是 App 自己写入的，App 内存已经是新的了。
        // 重新读取只会确认这一点。React 的 setState 如果新旧值相同不会 rerender。
        // 所以“自己触发自己”通常是安全的，只是浪费一次读取。
        
        if (file.lastModified > lastModifiedRef.current) {
          console.log('[FileWatcher] Change detected!', {
            file: file.name,
            oldTime: new Date(lastModifiedRef.current).toLocaleTimeString(),
            newTime: new Date(file.lastModified).toLocaleTimeString()
          });
          lastModifiedRef.current = file.lastModified;
          callbackRef.current(file);
        }
      } catch (err) {
        console.warn('[FileWatcher] Check failed:', err);
      }
    };

    const timer = setInterval(checkFile, interval);

    // 窗口获得焦点时立即检查一次，提升体验
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
