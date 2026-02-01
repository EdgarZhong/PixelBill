import { Filesystem, Directory, Encoding } from '../../../utils/filesystem-adapter';

export class RuleLoader {
  private static readonly BASE_PATH = 'PixelBill/classify_rules';

  /**
   * 加载指定账本的分类规则
   * @param ledgerName 账本名称 (默认为 'default')
   * @returns Markdown 格式的规则字符串
   */
  public static async load(ledgerName: string = 'default'): Promise<string> {
    const fileName = `${ledgerName}.md`;
    const fullPath = `${this.BASE_PATH}/${fileName}`;

    try {
      // 尝试读取规则文件
      const result = await Filesystem.readFile({
        path: fullPath,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });

      return result.data as string;
    } catch (e) {
      console.warn(`[RuleLoader] Rules not found for ${ledgerName}, using empty rules.`);
      // 如果文件不存在，返回空字符串，或者可以返回默认的内置规则
      return '';
    }
  }

  /**
   * 保存/更新分类规则
   */
  public static async save(ledgerName: string, content: string): Promise<void> {
    const fileName = `${ledgerName}.md`;
    const fullPath = `${this.BASE_PATH}/${fileName}`;

    try {
      await Filesystem.writeFile({
        path: fullPath,
        data: content,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true // 确保目录存在
      });
    } catch (e) {
      console.error(`[RuleLoader] Failed to save rules for ${ledgerName}:`, e);
      throw e;
    }
  }
}
