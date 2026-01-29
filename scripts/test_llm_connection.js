const https = require('https');

// 配置信息
const CONFIG = {
  baseUrl: 'https://api-inference.modelscope.cn/v1',
  apiKey: 'YOUR_API_KEY_HERE', // 用户需在此处填入 Key，或者通过环境变量传递
  model: 'deepseek-ai/DeepSeek-V3.2',
  enableThinking: true
};

// 如果有环境变量，优先使用
if (process.env.MODELSCOPE_API_KEY) {
  CONFIG.apiKey = process.env.MODELSCOPE_API_KEY;
}

console.log('=== 测试 LLM 基础设施连接 ===');
console.log(`URL: ${CONFIG.baseUrl}/chat/completions`);
console.log(`Model: ${CONFIG.model}`);
console.log(`Thinking: ${CONFIG.enableThinking}`);

if (CONFIG.apiKey === 'YOUR_API_KEY_HERE') {
  console.error('\n[错误] 请在脚本中填入 API Key 或设置 MODELSCOPE_API_KEY 环境变量。');
  console.error('示例: $env:MODELSCOPE_API_KEY="sk-xxx"; node scripts/test_llm_connection.js');
  process.exit(1);
}

const requestBody = JSON.stringify({
  model: CONFIG.model,
  messages: [
    {
      role: 'user',
      content: '9.9和9.11谁大'
    }
  ],
  stream: false,
  extra_body: {
    enable_thinking: CONFIG.enableThinking
  }
});

const url = new URL(`${CONFIG.baseUrl}/chat/completions`);

const options = {
  hostname: url.hostname,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CONFIG.apiKey}`
  }
};

const req = https.request(options, (res) => {
  let data = '';

  console.log(`\n状态码: ${res.statusCode}`);
  
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('\n=== 响应成功 ===');
        
        if (response.choices && response.choices.length > 0) {
          const message = response.choices[0].message;
          
          if (message.reasoning_content) {
            console.log('\n[思考过程]:');
            console.log(message.reasoning_content);
          }
          
          console.log('\n[最终回答]:');
          console.log(message.content);
        } else {
          console.log('响应结构异常:', JSON.stringify(response, null, 2));
        }
      } else {
        console.error('\n=== 请求失败 ===');
        console.error(JSON.stringify(response, null, 2));
      }
    } catch (e) {
      console.error('\n=== 解析失败 ===');
      console.error('Raw Data:', data);
    }
  });
});

req.on('error', (e) => {
  console.error(`\n请求错误: ${e.message}`);
});

req.write(requestBody);
req.end();
