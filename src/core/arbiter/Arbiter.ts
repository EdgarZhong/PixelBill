import type { ICategoryPlugin, Proposal, ProposalSource } from '../plugin/types';
import type { FullTransactionRecord, LedgerMemory, TransactionBase } from '../../types/metadata';

export interface FinalDecision {
  category: string;
  source: ProposalSource | 'FALLBACK';
  reasoning?: string;
  confidence: number;
}

export class Arbiter {
  private plugins: ICategoryPlugin[] = [];
  
  // 规则引擎计算结果缓存: TransactionID -> Proposal
  private ruleResultCache: Map<string, Proposal> = new Map();

  // 默认优先级
  private defaultPriority: ProposalSource[] = ['USER', 'RULE_ENGINE', 'AI_AGENT'];

  constructor() {}

  /**
   * 注册规则插件
   */
  public registerPlugin(plugin: ICategoryPlugin) {
    // 简单的去重逻辑：同名插件覆盖
    const index = this.plugins.findIndex(p => p.name === plugin.name);
    if (index !== -1) {
      this.plugins[index] = plugin;
    } else {
      this.plugins.push(plugin);
    }
  }

  /**
   * 批量处理交易数据（通常在加载数据后调用）
   * 运行所有规则插件并更新缓存
   */
  public async ingest(transactions: TransactionBase[]) {
    console.log(`[Arbiter] Ingesting ${transactions.length} transactions for rule analysis...`);
    
    // 简单实现：串行遍历所有交易，运行所有插件
    for (const tx of transactions) {
      let bestRuleProposal: Proposal | null = null;
      
      for (const plugin of this.plugins) {
        try {
          const proposal = await plugin.analyze(tx);
          if (proposal) {
            // 策略变更：First Match Wins (忽略置信度，优先采纳第一个命中的规则)
            // 这要求插件列表的注册顺序即为规则优先级顺序
            bestRuleProposal = proposal;
            break; 
          }
        } catch (e) {
          console.error(`[Arbiter] Plugin ${plugin.name} failed for tx ${tx.id}:`, e);
        }
      }

      if (bestRuleProposal) {
        this.ruleResultCache.set(tx.id, bestRuleProposal);
      } else {
        this.ruleResultCache.delete(tx.id);
      }
    }
    console.log(`[Arbiter] Analysis complete. Cache size: ${this.ruleResultCache.size}`);
  }

  /**
   * 核心仲裁方法：决定单笔交易的最终分类
   * @param transaction 完整的交易记录（包含元数据）
   * @param ledgerConfig 全局配置（包含优先级设置）
   */
  public decide(
    transaction: FullTransactionRecord, 
    ledgerConfig?: LedgerMemory
  ): FinalDecision {
    // 0. 如果已人工核验，则强制锁定，不再进行仲裁
    if (transaction.is_verified) {
      return {
        category: transaction.category || 'Uncategorized', // 理论上 verified 必然有 category
        source: 'USER', // 视为用户锁定的结果
        reasoning: 'Verified by user (Locked)',
        confidence: 1.0
      };
    }

    const priorityList = ledgerConfig?.arbitration_config?.priority || this.defaultPriority;

    for (const source of priorityList) {
      const decision = this.evaluateSource(source, transaction);
      if (decision) {
        return decision;
      }
    }

    // Fallback
    // 当没有任何有效信源时，倾向于保留原来的 category 不做修改
    return {
      category: transaction.category || 'Uncategorized',
      source: 'FALLBACK',
      reasoning: 'No valid category found from any source, keeping original',
      confidence: 0
    };
  }

  /**
   * 评估特定来源是否有有效提案
   */
  private evaluateSource(source: ProposalSource, tx: FullTransactionRecord): FinalDecision | null {
    switch (source) {
      case 'USER':
        // 使用 UserMetaPlugin 进行标准化处理
        // 注意：analyze 是 async 的，但这里我们需要同步返回（或者这一步只能是 Promise）
        // 由于 decide 目前设计为同步（为了在 render 中使用），我们需要让 UserMetaPlugin.analyze 实际上不进行 IO 操作
        // 幸好 UserMetaPlugin 只是读取内存对象，我们可以忽略 Promise，或者强制转换
        // 为了代码整洁，我们这里还是需要 await，这意味着 decide 必须是 async。
        // 但 React useMemo 不支持 async。
        // 矛盾点：UserMetaPlugin 必须同步吗？
        // CategoryPlugin 接口定义 analyze 为 Promise。
        // 解决方案：UserMetaPlugin 虽然实现了接口，但我们可以直接利用其逻辑，或者在 Arbiter 中特殊处理 USER。
        // 鉴于 React Render 必须同步，我们不得不破坏一点接口统一性，或者修改 decide 为 async 并使用 useEffect。
        // 但用户之前的方案是“利用 useMemo”，这意味着必须是同步。
        // 妥协：在 evaluateSource 中，对于 USER，我们手动同步执行逻辑（因为它确实不需要 await）。
        // 或者，我们修改 ICategoryPlugin 接口？不，规则引擎可能需要 async (正则不需要，但 AI 需要)。
        // 既然 UserMetaPlugin 只是简单的对象读取，我们直接内联逻辑，或者创建一个同步的 helper。
        
        // 实际上，为了严格遵循插件化，我们应该让 decide 变成 async，并使用 useEffect 更新状态。
        // 但这会引发由于异步导致的 UI 闪烁。
        // 鉴于 UserMetaPlugin 的特殊性（它只是读取 props），我们可以直接调用它的同步实现（如果有），或者在此处内联。
        // 这里我选择：暂时保留内联逻辑，但注释说明这是 UserMetaPlugin 的逻辑副本，为了性能和同步性。
        // 实际上，我可以实例化 UserMetaPlugin 并调用它的 analyze，如果它没有 await，它返回的是 Promise<Value>，但如果是立即 resolve 的...
        // 不行，Promise 总是微任务。
        
        // 决定：为了 useMemo 的同步性，USER 逻辑必须同步。
        if (tx.user_category && tx.user_category.trim() !== '') {
          return {
            category: tx.user_category,
            source: 'USER',
            reasoning: tx.user_note || 'User manual assignment',
            confidence: 1.0
          };
        }
        break;

      case 'RULE_ENGINE':
        const ruleProposal = this.ruleResultCache.get(tx.id);
        if (ruleProposal && ruleProposal.category) {
          return {
            category: ruleProposal.category,
            source: 'RULE_ENGINE',
            reasoning: ruleProposal.reasoning || 'Rule engine match',
            confidence: ruleProposal.confidence
          };
        }
        break;

      case 'AI_AGENT':
        if (tx.ai_category && tx.ai_category.trim() !== '') {
          return {
            category: tx.ai_category,
            source: 'AI_AGENT',
            reasoning: tx.ai_reasoning || 'AI prediction',
            confidence: 0.8
          };
        }
        break;
    }
    return null;
  }

  /**
   * 获取当前的规则缓存（调试用）
   */
  public getRuleCacheStats() {
    return {
      size: this.ruleResultCache.size,
      pluginCount: this.plugins.length
    };
  }
}

// 导出单例，方便全局使用
export const globalArbiter = new Arbiter();
