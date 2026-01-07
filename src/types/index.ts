import { type TransactionBase } from './metadata';
export * from './metadata';

// 运行时交易数据结构
// 继承自 TransactionBase (JSON结构)，并添加运行时特有的 originalDate
export interface Transaction extends TransactionBase {
  readonly originalDate: Date;   // [Runtime Only] 原始时间对象，用于UI组件和日期计算
}

export interface DayActivity {
  date: string; // YYYY-MM-DD
  totalExpense: number;
  count: number;
}
