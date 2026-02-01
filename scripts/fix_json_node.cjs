
const fs = require('fs');
const path = require('path');

// 虚拟沙箱路径
const LEDGER_PATH = path.join(__dirname, '../virtual_android_filesys/Documents_path/PixelBill/default.pixelbill.json');

function runCorrection() {
  console.log(`[FixScript] Target file: ${LEDGER_PATH}`);

  if (!fs.existsSync(LEDGER_PATH)) {
    console.error(`[FixScript] Error: File not found at ${LEDGER_PATH}`);
    process.exit(1);
  }

  try {
    const rawData = fs.readFileSync(LEDGER_PATH, 'utf8');
    const memory = JSON.parse(rawData);
    const records = memory.records || {};
    let fixCount = 0;

    console.log(`[FixScript] Loaded ${Object.keys(records).length} records.`);

    for (const id in records) {
      const tx = records[id];

      // Strict Filter Logic:
      // 1. Category is 'others'
      // 2. Not verified
      // 3. No User Meta (empty/null)
      // 4. No AI Meta (empty/null)
      
      const hasUserMeta = !!(tx.user_category && tx.user_category.trim());
      const hasAIMeta = !!(tx.ai_category && tx.ai_category.trim());

      if (tx.category === 'others' && !tx.is_verified && !hasUserMeta && !hasAIMeta) {
        // Apply Fix
        tx.category = 'uncategorized';
        // Ensure AI meta is clean for re-processing
        tx.ai_category = '';
        tx.ai_reasoning = '';
        
        fixCount++;
      }
    }

    if (fixCount > 0) {
      fs.writeFileSync(LEDGER_PATH, JSON.stringify(memory, null, 2), 'utf8');
      console.log(`[FixScript] Successfully fixed ${fixCount} records.`);
      console.log(`[FixScript] Data saved to ${LEDGER_PATH}`);
    } else {
      console.log(`[FixScript] No records matched the criteria. Nothing to fix.`);
    }

  } catch (e) {
    console.error(`[FixScript] Error processing file:`, e);
    process.exit(1);
  }
}

runCorrection();
