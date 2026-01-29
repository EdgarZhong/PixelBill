import { CryptoUtils } from '../../utils/crypto';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { isNative } from '../../utils/fs-storage';

// 安全配置接口
export interface SecureConfig {
  apiKey: string;
  provider: 'openai' | 'deepseek' | 'custom';
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  enableThinking?: boolean; // 新增思考模式开关
}

const DEFAULT_CONFIG: SecureConfig = {
  apiKey: '',
  provider: 'custom', // 默认为 custom 以适应 ModelScope
  baseUrl: 'https://api-inference.modelscope.cn/v1',
  model: 'deepseek-ai/DeepSeek-V3.2',
  maxTokens: 2000,
  temperature: 0.3,
  enableThinking: true
};

const CONFIG_FILE_NAME = 'secure_config.bin'; // 使用 .bin 后缀暗示二进制/加密内容
const MASTER_KEY = 'PixelBill_Local_Device_Key_2024'; // 简化版：硬编码密钥 (在真实 App 中应存储在 Android Keystore / iOS Keychain)

export class ConfigManager {
  private static instance: ConfigManager;
  private currentConfig: SecureConfig | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * 初始化配置 (从磁盘加载并解密)
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const encryptedData = await this.readFromDisk();
      if (encryptedData) {
        const jsonStr = await CryptoUtils.decrypt(encryptedData, MASTER_KEY);
        this.currentConfig = JSON.parse(jsonStr);
        console.log('[ConfigManager] Config loaded and decrypted.');
      } else {
        console.log('[ConfigManager] No config found, using defaults.');
        this.currentConfig = { ...DEFAULT_CONFIG };
      }
    } catch (e) {
      console.error('[ConfigManager] Failed to load config:', e);
      // Fallback to default but DON'T persist immediately to avoid overwriting potentially recoverable data
      this.currentConfig = { ...DEFAULT_CONFIG };
    }

    this.isInitialized = true;
  }

  /**
   * 获取配置 (如果未初始化会自动初始化)
   */
  public async getConfig(): Promise<SecureConfig> {
    if (!this.isInitialized) {
      await this.init();
    }
    return this.currentConfig || { ...DEFAULT_CONFIG };
  }

  /**
   * 保存配置 (加密并写入磁盘)
   */
  public async saveConfig(config: Partial<SecureConfig>): Promise<void> {
    const newConfig = { ...this.currentConfig, ...config } as SecureConfig;
    
    // Validate
    if (!newConfig.apiKey) {
      // throw new Error('API Key cannot be empty'); 
      // Allow saving empty key (clearing it)
    }

    try {
      const jsonStr = JSON.stringify(newConfig);
      const encryptedData = await CryptoUtils.encrypt(jsonStr, MASTER_KEY);
      
      await this.writeToDisk(encryptedData);
      
      this.currentConfig = newConfig;
      console.log('[ConfigManager] Config saved securely.');
    } catch (e) {
      console.error('[ConfigManager] Failed to save config:', e);
      throw e;
    }
  }

  // --- Low Level Disk IO ---

  private async readFromDisk(): Promise<string | null> {
    if (isNative) {
      try {
        const result = await Filesystem.readFile({
          path: CONFIG_FILE_NAME,
          directory: Directory.Data, // 使用 Data 目录，映射到 virtual_android_filesys/sandbox_path
          encoding: Encoding.UTF8
        });
        return result.data as string;
      } catch (e) {
        return null; // File not found
      }
    } else {
      // 纯 Web 环境 (非 Dev Mock 模式) 下的回退逻辑
      // 注意：在 Dev 模式下，由于 mock-fs 的存在，isNative 恒为 true，不会进入此分支
      const local = localStorage.getItem('pixelbill_secure_config');
      if (local) return local;
      return null;
    }
  }

  private async writeToDisk(data: string): Promise<void> {
    if (isNative) {
      await Filesystem.writeFile({
        path: CONFIG_FILE_NAME,
        data: data,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });
    } else {
      localStorage.setItem('pixelbill_secure_config', data);
    }
  }
}

export const configManager = ConfigManager.getInstance();
