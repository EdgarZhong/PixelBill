import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { isNative } from '../../utils/fs-storage';
import { format } from 'date-fns';

export interface LogEntry {
  timestamp: string;
  request: any;
  response: any;
  duration_ms: number;
  status: 'SUCCESS' | 'ERROR';
  error?: string;
}

const LOG_DIR = 'llm_logs';
const MAX_LOG_FILES = 300;

export class RawLogger {
  /**
   * 记录一次完整的 LLM 交互
   * @param batchId 批次ID (通常是 hash 或 uuid)
   * @param entry 日志内容
   */
  public static async log(batchId: string, entry: Omit<LogEntry, 'timestamp'>) {
    const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
    const fileName = `${timestamp}_${batchId}.json`;
    const fullEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      ...entry
    };

    const content = JSON.stringify(fullEntry, null, 2);

    try {
      if (isNative) {
        // Ensure dir exists
        try {
          await Filesystem.mkdir({
            path: LOG_DIR,
            directory: Directory.Documents,
            recursive: true
          });
        } catch (e) {
          // Ignore if exists
        }

        await Filesystem.writeFile({
          path: `${LOG_DIR}/${fileName}`,
          data: content,
          directory: Directory.Documents,
          encoding: Encoding.UTF8
        });
      } else {
        console.log(`[RawLogger] (Web Mock) Writing to ${fileName}`, fullEntry);
        // Web 环境下可选：写入 localStorage 或仅 Console
      }

      // 触发轮替清理 (Fire and Forget)
      this.rotateLogs().catch(e => console.error('[RawLogger] Rotate failed:', e));

    } catch (e) {
      console.error('[RawLogger] Failed to write log:', e);
    }
  }

  /**
   * 日志轮替：保留最新的 N 个文件
   */
  private static async rotateLogs() {
    if (!isNative) return;

    try {
      const result = await Filesystem.readdir({
        path: LOG_DIR,
        directory: Directory.Documents
      });

      const files = result.files;
      if (files.length <= MAX_LOG_FILES) return;

      // Sort by name (which includes timestamp) descending
      // name format: yyyyMMdd_HHmmss_BATCHID.json
      // so default string sort is actually chronological
      // We want to delete the OLDEST, so sort Ascending
      files.sort((a, b) => a.name.localeCompare(b.name));

      const deleteCount = files.length - MAX_LOG_FILES;
      const toDelete = files.slice(0, deleteCount);

      console.log(`[RawLogger] Rotating logs: deleting ${deleteCount} old files.`);

      for (const file of toDelete) {
        await Filesystem.deleteFile({
          path: `${LOG_DIR}/${file.name}`,
          directory: Directory.Documents
        });
      }

    } catch (e) {
      console.error('[RawLogger] Rotation error:', e);
    }
  }
}
