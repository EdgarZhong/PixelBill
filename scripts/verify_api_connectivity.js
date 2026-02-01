import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 常量定义 (必须与 setup_config.js 和 src/utils/crypto.ts 保持一致)
const ALGORITHM = 'aes-256-gcm';
const KDF_ALGORITHM = 'sha256';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;
const AUTH_TAG_LENGTH = 16;
const APP_SALT = Buffer.from('PixelBill_Secure_Salt_v1', 'utf-8');
const MASTER_KEY = 'PixelBill_Local_Device_Key_2024';

// 解密函数
function decrypt(encryptedBase64, password) {
  const combined = Buffer.from(encryptedBase64, 'base64');
  
  // 提取各部分: IV (12) + Ciphertext + AuthTag (16)
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encryptedText = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

  // 派生密钥
  const key = crypto.pbkdf2Sync(password, APP_SALT, ITERATIONS, KEY_LENGTH, KDF_ALGORITHM);

  // 解密
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString('utf8');
}

async function main() {
  console.log('=== 开始 API 连通性测试 ===');

  // 1. 读取加密配置
  // 注意：模拟 Native 环境下，配置位于 sandbox_path
  const sandboxPath = path.join(__dirname, '../virtual_android_filesys/sandbox_path/secure_config.bin');
  
  if (!fs.existsSync(sandboxPath)) {
    console.error(`[Error] 配置文件不存在: ${sandboxPath}`);
    console.error('请先运行 "node scripts/setup_config.js" 生成配置。');
    process.exit(1);
  }

  try {
    const encryptedData = fs.readFileSync(sandboxPath, 'utf8');
    
    // 2. 解密配置
    console.log('[1/3] 正在读取并解密配置...');
    const configStr = decrypt(encryptedData, MASTER_KEY);
    const config = JSON.parse(configStr);
    
    // 解析 MultiProviderConfig
    let activeCandidate = 'deepseek::deepseek-chat';
    if (config.candidateModels && config.candidateModels.length > 0) {
        activeCandidate = config.candidateModels[0];
    } else if (config.provider) {
        // Fallback for legacy config structure (should not happen with new setup script but good for safety)
        activeCandidate = `${config.provider}::${config.model}`;
        // Polyfill providers if missing
        if (!config.providers) {
             config.providers = {
                 [config.provider]: { apiKey: config.apiKey, baseUrl: config.baseUrl }
             };
        }
    }

    const [providerName, modelName] = activeCandidate.split('::');
    const providerConfig = config.providers ? config.providers[providerName] : null;
    const globalParams = config.globalParams || {};

    if (!providerConfig) {
        throw new Error(`Provider '${providerName}' not found in configuration.`);
    }

    console.log(`      Active Candidate: ${activeCandidate}`);
    console.log(`      Provider: ${providerName}`);
    console.log(`      Model: ${modelName}`);
    console.log(`      BaseURL: ${providerConfig.baseUrl}`);
    console.log(`      Thinking Mode: ${globalParams.enableThinking ? 'Enabled' : 'Disabled'}`);

    if (!providerConfig.apiKey) {
      throw new Error(`API Key for ${providerName} is empty.`);
    }

    // 3. 发起测试请求
    console.log('\n[2/3] 正在发送测试请求...');
    
    const requestBody = JSON.stringify({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant. Output JSON only.'
        },
        {
          role: 'user',
          content: 'List 3 fruits with their colors in a JSON array under the key "fruits".'
        }
      ],
      stream: false,
      response_format: {
        type: 'json_object'
      },
      // 如果启用了思考模式，且是 DeepSeek 模型，可能需要特殊参数
      extra_body: globalParams.enableThinking ? {
        enable_thinking: true
      } : undefined
    });

    const url = new URL(providerConfig.baseUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname + '/chat/completions', // 假设是 OpenAI 兼容接口
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${providerConfig.apiKey}`
      }
    };

    // 处理路径: 如果 baseUrl 已经包含 /v1 等，需要正确拼接
    if (providerConfig.baseUrl.endsWith('/')) {
        options.path = url.pathname + 'chat/completions';
    } else {
        // 简单处理：假设 baseUrl 是 https://.../v1
        options.path = url.pathname + '/chat/completions';
    }
    // 移除双斜杠 (如果 baseUrl 包含路径)
    options.path = options.path.replace('//chat', '/chat');

    console.log(`      POST ${options.hostname}${options.path}`);

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`\n[3/3] 收到响应 (Status: ${res.statusCode})`);
        
        try {
          const response = JSON.parse(data);
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('✅ 测试成功！API 服务可用。');
            
            const choice = response.choices?.[0];
            if (choice) {
              if (choice.message?.reasoning_content) {
                console.log('\n[思考过程]:');
                console.log(choice.message.reasoning_content.substring(0, 100) + '...');
              }
              console.log('\n[回复内容]:');
              console.log(choice.message?.content);
            }
          } else {
            console.error('❌ 请求失败');
            console.error('Error Response:', JSON.stringify(response, null, 2));
          }
        } catch (e) {
          console.error('❌ 响应解析失败');
          console.error('Raw Data:', data);
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ 网络请求错误:', e.message);
    });

    req.write(requestBody);
    req.end();

  } catch (e) {
    console.error('❌ 测试过程中发生错误:', e.message);
    if (e.message.includes('bad decrypt') || e.message.includes('Decryption failed')) {
      console.error('提示: 解密失败可能是因为密钥不匹配，请尝试重新运行 setup_config.js');
    }
  }
}

main();
