import Papa from 'papaparse';
import type { Transaction } from '../types';
import { parse, isValid } from 'date-fns';

// 关键词匹配引擎 - 简单的正则匹配
const MEAL_KEYWORDS = [
  '餐饮', '美食', '外卖', '饿了么', '美团', '肯德基', '麦当劳', '星巴克', '瑞幸', 
  '面', '粉', '饭', '烧烤', '火锅', '麻辣烫', '小吃', '咖啡', '茶', '饮', '食堂', '餐厅'
];

const isMeal = (text: string): boolean => {
  return MEAL_KEYWORDS.some(keyword => text.includes(keyword));
};

// 生成唯一ID
const generateId = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
};

// 清洗金额
const cleanAmount = (amountStr: string): number => {
  if (!amountStr) return 0;
  // 去除 ¥, ?, 逗号, 空格
  const cleanStr = amountStr.replace(/[¥?？, ]/g, '');
  return parseFloat(cleanStr) || 0;
};

// 解析微信 CSV
const parseWeChatCSV = (csvText: string): Transaction[] => {
  // 微信CSV前16行是头部信息，第17行是表头
  // 找到表头行 "交易时间,交易类型..."
  const lines = csvText.split('\n');
  const headerIndex = lines.findIndex(line => line.includes('交易时间') && line.includes('交易类型'));
  
  if (headerIndex === -1) return [];

  const csvContent = lines.slice(headerIndex).join('\n');
  
  const results = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const transactions: Transaction[] = [];

  results.data.forEach((row: any) => {
    // 微信字段: 交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
    const dateStr = row['交易时间'];
    if (!dateStr) return;

    const date = parse(dateStr, 'yyyy-MM-dd HH:mm:ss', new Date());
    if (!isValid(date)) return;

    const directionStr = row['收/支'];
    const amountStr = row['金额(元)'];
    
    // 过滤掉非收支记录（如中性交易）或者金额为0的
    if (directionStr !== '收入' && directionStr !== '支出') return;

    const amount = cleanAmount(amountStr);
    const counterparty = row['交易对方'] || 'Unknown';
    const product = row['商品'] || 'Unknown';
    const category = row['交易类型'] || 'Unknown';

    // 组合关键信息用于去重ID
    const rawString = JSON.stringify(row);

    transactions.push({
      id: generateId(rawString),
      originalDate: date,
      timestamp: date.getTime(),
      type: 'wechat',
      category: category,
      counterparty: counterparty,
      product: product,
      amount: amount,
      direction: directionStr === '收入' ? 'in' : 'out',
      isMeal: isMeal(category + counterparty + product),
      raw: row
    });
  });

  return transactions;
};

// 解析支付宝 CSV
const parseAlipayCSV = (csvText: string): Transaction[] => {
  // 支付宝CSV前24行左右是头部，包含 "电子客户回单"
  // 表头: 交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额...
  const lines = csvText.split('\n');
  const headerIndex = lines.findIndex(line => line.includes('交易时间') && line.includes('交易分类'));
  
  if (headerIndex === -1) return [];

  // 支付宝CSV末尾可能有注释，通常以 --------- 结束或者空行
  // 这里直接取从header开始的内容
  const csvContent = lines.slice(headerIndex).join('\n');

  const results = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const transactions: Transaction[] = [];

  results.data.forEach((row: any) => {
    // 支付宝字段: 交易时间, 交易分类, 交易对方, 对方账号, 商品说明, 收/支, 金额, ...
    // 注意: 支付宝CSV字段值可能包含空格，papaparse 默认 trimHeaders: false, trimValues: false
    // 且表头可能包含空格
    
    const dateStr = (row['交易时间'] || '').trim();
    if (!dateStr) return;

    const date = parse(dateStr, 'yyyy-MM-dd HH:mm:ss', new Date());
    if (!isValid(date)) return;

    const directionStr = (row['收/支'] || '').trim(); // 支付宝可能是 "支出" 或 "收入" 或空（不计收支）
    const amountStr = (row['金额'] || '').trim();

    if (directionStr !== '收入' && directionStr !== '支出') return;

    const amount = cleanAmount(amountStr);
    const counterparty = (row['交易对方'] || '').trim() || 'Unknown';
    const product = (row['商品说明'] || '').trim() || 'Unknown';
    const category = (row['交易分类'] || '').trim() || 'Unknown';

    const rawString = JSON.stringify(row);

    transactions.push({
      id: generateId(rawString),
      originalDate: date,
      timestamp: date.getTime(),
      type: 'alipay',
      category: category,
      counterparty: counterparty,
      product: product,
      amount: amount,
      direction: directionStr === '收入' ? 'in' : 'out',
      isMeal: isMeal(category + counterparty + product),
      raw: row
    });
  });

  return transactions;
};

export const parseFiles = async (files: File[]): Promise<Transaction[]> => {
  const allTransactions: Transaction[] = [];

  for (const file of files) {
    if (!file.name.endsWith('.csv')) continue;

    try {
      const buffer = await file.arrayBuffer();
      
      // 智能编码检测策略
      // 1. 优先尝试 UTF-8
      const decoderUtf8 = new TextDecoder('utf-8', { fatal: false });
      const textUtf8 = decoderUtf8.decode(buffer);
      
      // 2. 检查 UTF-8 解码结果是否有效（包含关键标识）
      let text = textUtf8;
      let isGBK = false;
      
      const isWeChat = textUtf8.includes('微信支付账单');
      const isAlipay = textUtf8.includes('支付宝') || textUtf8.includes('电子客户回单');
      
      // 3. 如果 UTF-8 解码未发现特征，尝试 GBK
      if (!isWeChat && !isAlipay) {
        const decoderGbk = new TextDecoder('gbk', { fatal: false });
        const textGbk = decoderGbk.decode(buffer);
        
        if (textGbk.includes('微信支付账单') || textGbk.includes('支付宝') || textGbk.includes('电子客户回单')) {
          text = textGbk;
          isGBK = true;
        }
      }

      console.log(`Parsing file: ${file.name}, Detected Encoding: ${isGBK ? 'GBK' : 'UTF-8'}`);

      if (text.includes('微信支付账单')) {
        allTransactions.push(...parseWeChatCSV(text));
      } else if (text.includes('支付宝') || text.includes('电子客户回单')) {
        allTransactions.push(...parseAlipayCSV(text));
      } else {
        console.warn(`Unknown CSV format for file: ${file.name}`);
      }

    } catch (err) {
      console.error(`Failed to parse file ${file.name}:`, err);
    }
  }

  // 按时间倒序排序
  return allTransactions.sort((a, b) => b.timestamp - a.timestamp);
};
