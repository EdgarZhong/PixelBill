import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 常量定义 (必须与 src/utils/crypto.ts 和 src/core/config/ConfigManager.ts 保持一致)
const ALGORITHM = 'aes-256-gcm';
const KDF_ALGORITHM = 'sha256';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;
const APP_SALT = Buffer.from('PixelBill_Secure_Salt_v1', 'utf-8');
const MASTER_KEY = 'PixelBill_Local_Device_Key_2024';


// 默认配置 (MultiProviderConfig 结构)
const TARGET_CONFIG = {
  providers: {
    'modelscope': { apiKey: '', baseUrl: 'https://api-inference.modelscope.cn/v1' },
    'siliconflow': { apiKey: '', baseUrl: 'https://api.siliconflow.cn/v1' },
    'deepseek': { apiKey: '', baseUrl: 'https://api.deepseek.com' },
    'zhipu': { apiKey: '', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
    'custom': { apiKey: '', baseUrl: 'https://api.openai.com/v1' }
  },
  candidateModels: ['deepseek::deepseek-chat'],
  globalParams: {
    maxTokens: 2000,
    temperature: 0.3,
    enableThinking: true
  }
};

// 获取命令行参数中的 API Key (可选)
const argApiKey = process.argv[2];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

// 加密函数
function encrypt(plaintext, password) {
  const key = crypto.pbkdf2Sync(
    password, 
    APP_SALT, 
    ITERATIONS, 
    KEY_LENGTH, 
    KDF_ALGORITHM
  );

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 拼接: IV + Ciphertext + AuthTag
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString('base64');
}

async function main() {
  try {
    console.log('\n=== PixelBill 安全配置生成工具 (多模型版) ===\n');

    // 1. 遍历预设供应商，询问是否配置/更新 Key
    const providerKeys = Object.keys(TARGET_CONFIG.providers);
    const configuredProviders = [];

    for (const pKey of providerKeys) {
      const provider = TARGET_CONFIG.providers[pKey];
      console.log(`\n--- 配置供应商: ${pKey} ---`);
      console.log(`Base URL: ${provider.baseUrl}`);
      
      const shouldConfig = await ask(`是否配置 ${pKey} 的密钥? (y/N): `);
      if (shouldConfig.toLowerCase() === 'y') {
        const key = await ask(`请输入 ${pKey} API Key: `);
        if (key && key.trim()) {
          provider.apiKey = key.trim();
          configuredProviders.push(pKey);
        }
      } else if (provider.apiKey) {
        // 如果已有密钥且未清除，也算已配置
        configuredProviders.push(pKey);
      }
    }

    if (configuredProviders.length === 0) {
      console.warn('\n警告: 未配置任何供应商密钥，AI 功能将无法使用。');
      const confirm = await ask('是否继续生成空配置? (y/N): ');
      if (confirm.toLowerCase() !== 'y') process.exit(0);
    }

    // 2. 针对已配置的供应商，收集模型名称
    const availableModels = []; // 格式: "provider::model"

    console.log('\n=== 配置可用模型 ===');
    for (const pKey of configuredProviders) {
      const addModel = await ask(`\n是否添加 ${pKey} 的模型? (Y/n): `);
      if (addModel.toLowerCase() !== 'n') {
        let adding = true;
        while (adding) {
          const modelName = await ask(`请输入 ${pKey} 的模型名称 (例如 deepseek-chat): `);
          if (modelName && modelName.trim()) {
            const fullId = `${pKey}::${modelName.trim()}`;
            availableModels.push(fullId);
            console.log(`已添加: ${fullId}`);
          }
          
          const more = await ask(`继续添加 ${pKey} 的其他模型吗? (y/N): `);
          adding = more.toLowerCase() === 'y';
        }
      }
    }

    if (availableModels.length === 0) {
      console.warn('\n警告: 未配置任何模型。');
      // 添加默认 fallback
      if (configuredProviders.includes('deepseek')) {
         availableModels.push('deepseek::deepseek-chat');
         console.log('自动添加默认模型: deepseek::deepseek-chat');
      }
    }

    // 3. 选择当前激活的模型
    if (availableModels.length > 0) {
      console.log('\n=== 选择当前首选模型 ===');
      availableModels.forEach((m, idx) => {
        console.log(`${idx + 1}. ${m}`);
      });
      
      const choice = await ask(`\n请输入序号选择当前启用的模型 (1-${availableModels.length}): `);
      const index = parseInt(choice) - 1;
      
      if (!isNaN(index) && index >= 0 && index < availableModels.length) {
        const selected = availableModels[index];
        // 将选中的模型置顶，其他保留在候选池
        TARGET_CONFIG.candidateModels = [
          selected,
          ...availableModels.filter(m => m !== selected)
        ];
        console.log(`\n已设置当前模型为: ${selected}`);
      } else {
        TARGET_CONFIG.candidateModels = availableModels;
        console.log(`\n无效选择，默认使用第一个: ${availableModels[0]}`);
      }
    }

    // 4. 全局参数配置
    console.log('\n=== 全局参数设置 ===');
    const enableThinking = await ask(`开启思考模式 (Enable Thinking)? (Y/n) [${TARGET_CONFIG.globalParams.enableThinking ? 'Y' : 'n'}]: `);
    if (enableThinking.trim()) {
       TARGET_CONFIG.globalParams.enableThinking = enableThinking.toLowerCase() !== 'n';
    }

    console.log('\n正在生成加密配置...');
    const jsonStr = JSON.stringify(TARGET_CONFIG);
    const encryptedBase64 = encrypt(jsonStr, MASTER_KEY);
    
    // 1. 写入 public/secure_config.json (Web 模式)
    const publicDir = path.join(__dirname, '../public');
    const publicPath = path.join(publicDir, 'secure_config.json');
    
    const publicData = {
      encryptedData: encryptedBase64,
      _note: "This file contains encrypted config generated by scripts/setup_config.js"
    };
    
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    fs.writeFileSync(publicPath, JSON.stringify(publicData, null, 2));

    // 2. 写入 virtual_android_filesys/sandbox_path/secure_config.bin (Mock Native 模式)
    const sandboxDir = path.join(__dirname, '../virtual_android_filesys/sandbox_path');
    const sandboxPath = path.join(sandboxDir, 'secure_config.bin');

    if (!fs.existsSync(sandboxDir)) {
      fs.mkdirSync(sandboxDir, { recursive: true });
    }

    fs.writeFileSync(sandboxPath, encryptedBase64, 'utf8');
    
    console.log('\n=== 配置已成功写入硬盘 ===');
    console.log(`[Web/Public] 路径: ${publicPath}`);
    console.log(`[Native/Mock] 路径: ${sandboxPath}`);
    console.log('\n验证方法:');
    console.log('1. 确保 App 正在运行 (npm run dev)');
    console.log('2. 刷新浏览器页面');
    console.log('3. App 启动时 ConfigManager 会自动读取并解密该文件');
    
    rl.close();
  } catch (e) {
    console.error('配置生成失败:', e);
    rl.close();
  }
}

main();
