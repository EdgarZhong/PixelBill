import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const INPUT_FILE = 'd:\\Code\\VibeCodingWork\\pixel_bill\\2025-11-5to2026-1-5\\default.pixelbill.json';
const OUTPUT_FILE = 'd:\\Code\\VibeCodingWork\\pixel_bill\\2025-11-5to2026-1-5\\shared_expenses_analysis.json';

// Constants
const YANG_GUOFU_GROUP_BUY_PRICE = 35; // Assumed price for the invisible group buy
const ADJACENT_TIME_WINDOW_MINUTES = 60; // Window to check for adjacent Meituan transactions

function parseDate(timeStr) {
    return new Date(timeStr);
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

function main() {
    console.log("Reading data from:", INPUT_FILE);
    const rawData = fs.readFileSync(INPUT_FILE, 'utf8');
    const json = JSON.parse(rawData);
    const records = Object.values(json.records || json);

    // 1. Yang Guofu Invisible Group Buys
    // Logic: Small Yang Guofu payment + NO adjacent Meituan/BankCard large payment = Invisible Group Buy
    const yangGuofuSmalltxs = [];
    const yangGuofuInvisibleBuys = [];

    // First, identify all Yang Guofu transactions
    const yangGuofuTxs = records.filter(r => 
        r.counterparty && r.counterparty.includes('杨国福')
    );

    // Identify potential triggers (small payments, e.g., < 20 yuan, usually supplementary)
    // User mentioned "small amount", threshold raised to 20 based on user feedback
    // User added date constraint: Only consider transactions on or after 2025-11-06
    const smallPaymentThreshold = 20; 
    const startDateConstraint = new Date('2025-11-06T00:00:00');

    yangGuofuTxs.forEach(tx => {
        const txTime = parseDate(tx.time);
        
        // Apply date constraint first
        if (txTime < startDateConstraint) return;

        if (tx.amount < smallPaymentThreshold && tx.direction === 'out') {
            // Check for adjacent "Meituan" payments in the main records
            
            // Look for any transaction around this time that looks like the main payment
            const hasMainPayment = records.some(other => {
                if (other.id === tx.id) return false;
                const otherTime = parseDate(other.time);
                const diffMinutes = Math.abs(txTime - otherTime) / (1000 * 60);
                
                if (diffMinutes > ADJACENT_TIME_WINDOW_MINUTES) return false;

                // Check if it's a main payment (ONLY Meituan as per new rule)
                const isMeituan = other.counterparty && (other.counterparty.includes('美团') || other.product.includes('美团'));
                
                return isMeituan;
            });

            if (!hasMainPayment) {
                yangGuofuInvisibleBuys.push({
                    trigger_tx: tx,
                    assumed_amount: YANG_GUOFU_GROUP_BUY_PRICE,
                    note: "Detected small payment without adjacent main payment"
                });
            }
        }
    });

    // 2. Single-Meal Days Deduction
    // Logic: If only ONE meal transaction (in 'meal' category) exists on a day -> deduct it (already shared/personal)
    // Also apply date constraint: Only consider days on or after 2025-11-06
    const mealsByDay = {};
    
    records.filter(r => r.ai_category === 'meal' && parseDate(r.time) >= startDateConstraint).forEach(r => {
        const day = r.time.split(' ')[0];
        if (!mealsByDay[day]) mealsByDay[day] = [];
        mealsByDay[day].push(r);
    });

    const singleMealDays = [];
    let totalDeductedSingleMeals = 0;

    Object.keys(mealsByDay).forEach(day => {
        const meals = mealsByDay[day];
        if (meals.length === 1) {
            singleMealDays.push({
                date: day,
                meal: meals[0],
                amount: meals[0].amount
            });
            totalDeductedSingleMeals += meals[0].amount;
        }
    });

    // 3. "Dear" Transfers
    // Logic: Income from "亲爱的", excluding specific non-food transfers identified by user
    const EXCLUDED_DEAR_TRANSFER_IDS = [
        "fdc3e643028d166b", // 120元
        "6a3020753bd3bfb7", // 19.9元 (玩具代付)
        "d3572934a3eefd8d", // 200元
        "7760d4bb063b68e1", // 50元 (超出时段 08:17)
        "9c3b5d0fabec3b45"  // 39元 (超出时段)
    ];

    const dearTransfers = records.filter(tx => 
        tx.counterparty && 
        tx.counterparty.includes('亲爱的') && 
        tx.direction === 'in' &&
        !EXCLUDED_DEAR_TRANSFER_IDS.includes(tx.id) &&
        parseDate(tx.time) >= startDateConstraint
    );

    // Construct Result Object
    const analysisResult = {
        meta: {
            generated_at: new Date().toISOString(),
            input_file: INPUT_FILE
        },
        yang_guofu_invisible_group_buys: {
            count: yangGuofuInvisibleBuys.length,
            total_added_cost: yangGuofuInvisibleBuys.length * YANG_GUOFU_GROUP_BUY_PRICE,
            items: yangGuofuInvisibleBuys
        },
        single_meal_days_deduction: {
            count: singleMealDays.length,
            total_deducted: totalDeductedSingleMeals,
            items: singleMealDays
        },
        dear_transfers_income: {
            count: dearTransfers.length,
            total_income: dearTransfers.reduce((sum, tx) => sum + tx.amount, 0),
            items: dearTransfers
        }
    };

    // Write to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(analysisResult, null, 2), 'utf8');
    console.log("Analysis written to:", OUTPUT_FILE);

    // Print Summary
    console.log("\n--- Analysis Summary ---");
    console.log(`1. Yang Guofu Invisible Group Buys: ${analysisResult.yang_guofu_invisible_group_buys.count} detected`);
    console.log(`   Total Estimated Cost Added: ${analysisResult.yang_guofu_invisible_group_buys.total_added_cost.toFixed(2)} (at ${YANG_GUOFU_GROUP_BUY_PRICE}/each)`);
    
    console.log(`\n2. Single-Meal Days Deducted: ${analysisResult.single_meal_days_deduction.count} days`);
    console.log(`   Total Deducted Amount: ${analysisResult.single_meal_days_deduction.total_deducted.toFixed(2)}`);

    console.log(`\n3. 'Dear' Transfers (Income): ${analysisResult.dear_transfers_income.count} transactions`);
    console.log(`   Total Income: ${analysisResult.dear_transfers_income.total_income.toFixed(2)}`);
    console.log("   (Please review 'dear_transfers_income.items' in the JSON to exclude non-food large transfers)");

}

main();
