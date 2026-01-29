import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '../2025-11-5to2026-1-5/default.pixelbill.json');

// User-defined exclusions based on previous feedback
const EXCLUSIONS = {
    "fdc3e643028d166b": "非饭钱 (120元大额)",
    "6a3020753bd3bfb7": "非饭钱 (19.9元 玩具代付)",
    "d3572934a3eefd8d": "非饭钱 (200元 大额转账)",
    "7760d4bb063b68e1": "非饭钱 (50元 超出时段 08:17)",
    "9c3b5d0fabec3b45": "非饭钱 (39元 超出时段)",
    // Add logic for others if needed
};

// Start date constraint
const START_DATE = new Date('2025-11-06T00:00:00');

try {
    const rawData = fs.readFileSync(DATA_FILE, 'utf8');
    const json = JSON.parse(rawData);
    const records = Object.values(json.records || {});
    console.log(`Total records: ${records.length}`);

    // Filter for "亲爱的" incoming transfers
    const transfers = records.filter(tx => 
        tx.counterparty && 
        tx.counterparty.includes('亲爱的') && 
        tx.direction === 'in'
    );
    console.log(`Found "亲爱的" transfers: ${transfers.length}`);

    // Filter by date and sort
    const validTransfers = transfers.filter(tx => {
        const txTime = new Date(tx.time);
        return txTime >= START_DATE;
    }).sort((a, b) => new Date(a.time) - new Date(b.time));

    console.log("| 日期 | 时间 | 金额 | 状态 | 说明 | 交易ID |");
    console.log("|---|---|---|---|---|---|");

    validTransfers.forEach(tx => {
        const isExcluded = EXCLUSIONS[tx.id];
        let status = "✅ 饭钱";
        let reason = "-";

        if (isExcluded) {
            status = "❌ 不算";
            reason = isExcluded;
        } else {
            // General heuristics if not explicitly excluded
            // Check for large amounts or odd times if not in exclusion list?
            // User feedback implied specific exclusions, so assume others are meal transfers unless they look suspicious
            // But let's mark them for review if they look like the excluded ones (e.g. morning time)
            const hours = new Date(tx.time).getHours();
            if (hours < 10 || hours > 21) {
                 // Flag potential time issues if not already excluded
                 // reason = "注意：时间非典型饭点";
            }
        }

        console.log(`| ${tx.time.split(' ')[0]} | ${tx.time.split(' ')[1]} | ${tx.amount} | ${status} | ${reason} | ${tx.id} |`);
    });

} catch (error) {
    console.error("Error:", error.message);
}
