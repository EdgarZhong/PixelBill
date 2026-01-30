import { generateSystemPrompt } from './SystemPrompt';
import { RuleLoader } from './RuleLoader';
import { LedgerLoader } from './LedgerLoader';
import type { ChatMessage } from '../infrastructure/types';
import type { TransactionBase } from '../../../types/metadata';
import { format } from 'date-fns';

export class PromptBuilder {
  /**
   * 构建完整的 Prompt 消息数组
   * @param transactions 当天的交易列表
   * @param date 当前处理的日期
   * @param ledgerName 账本名称
   * @param language 输出语言 (默认为 'Chinese')
   */
  public static async build(
    transactions: TransactionBase[],
    date: Date,
    ledgerName: string = 'default',
    language: string = 'Chinese'
  ): Promise<ChatMessage[]> {
    // 1. 加载用户规则
    const userRules = await RuleLoader.load(ledgerName);
    
    // 2. 加载类别列表
    const categoryList = await LedgerLoader.loadCategories();

    // 3. 序列化交易数据
    // 仅保留 AI 需要的字段：时间、金额、描述、对方、方向、原有分类
    const txData = transactions.map(tx => ({
      id: tx.id,
      time: tx.time,
      amount: tx.amount,
      currency: 'CNY', // 假设
      direction: tx.direction,
      counterparty: tx.counterparty,
      description: tx.product || tx.remark, // 优先使用商品名，无则备注
      source: tx.sourceType,
      raw_category: tx.rawClass
    }));

    // 4. 构建 Prompt Payload
    // 严格遵循 DAY3_IMPLEMENTATION.md 定义的结构
    const payload = {
      user_rules: userRules,
      category_list: categoryList,
      context: {
        date: format(date, 'yyyy-MM-dd'),
        weekday: format(date, 'EEEE'), // e.g., "Monday"
      },
      transactions: txData
    };

    // 4. 组装 User Message
    const userContent = JSON.stringify(payload, null, 2);

    return [
      {
        role: 'system',
        content: PIXEL_BILL_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: userContent
      }
    ];
  }
}
