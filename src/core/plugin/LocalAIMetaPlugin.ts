import { CategoryPlugin } from './CategoryPlugin';
import type { Proposal } from './types';
import type { FullTransactionRecord } from '../../types/metadata';
import type { TransactionBase } from '../../types/metadata';

/**
 * 本地 AI 元数据读取插件 (Local AI Metadata Reader)
 * 这是一个临时/过渡插件。
 * 逻辑：不直接调用 LLM，而是读取本地 JSON 中已存在的 `ai_category` 字段。
 * 场景：适用于通过外部脚本批量清洗数据后，让 App 感知并应用这些 AI 分类结果。
 */
export class LocalAIMetaPlugin extends CategoryPlugin {
  name = 'LocalAIMetaPlugin';
  version = '0.1.0';

  async analyze(transaction: TransactionBase): Promise<Proposal | null> {
    const tx = transaction as FullTransactionRecord;
    
    // 从元数据中读取 AI 的历史建议
    if (tx.ai_category && tx.ai_category.trim() !== '') {
      return this.createProposal(
        'AI_AGENT',
        tx.ai_category,
        0.8, // AI 的置信度设定为 0.8
        tx.ai_reasoning || 'AI prediction from metadata (Local)'
      );
    }
    
    return null;
  }
}
