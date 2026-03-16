"use strict";
/**
 * @elizaos-plugins/plugin-buff
 *
 * Buff round-up investing plugin for ElizaOS.
 * Auto-invests spare change from every agent transaction into crypto assets.
 *
 * Actions:
 *   BUFF_ROUNDUP     — Record a round-up from a transaction
 *   BUFF_INVEST      — Check threshold and auto-invest via Jupiter
 *   BUFF_PORTFOLIO   — Get the agent's Buff portfolio
 *   BUFF_SET_PLAN    — Change the round-up plan tier
 *   BUFF_SET_ALLOC   — Set portfolio allocation (e.g. 60% BTC, 40% ETH)
 *
 * Providers:
 *   buffPortfolioProvider — Injects portfolio context into agent conversations
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buffPlugin = void 0;
const web3_js_1 = require("@solana/web3.js");
// Buff SDK — import dynamically to handle cases where it's not installed
let BuffClass = null;
let buffInstance = null;
async function getBuff(runtime) {
    if (buffInstance)
        return buffInstance;
    if (!BuffClass) {
        const sdk = await Promise.resolve().then(() => __importStar(require("buff-protocol-sdk")));
        BuffClass = sdk.Buff;
    }
    const agentSeed = runtime.getSetting?.("BUFF_AGENT_SEED") || process.env.BUFF_AGENT_SEED;
    const plan = runtime.getSetting?.("BUFF_PLAN") || process.env.BUFF_PLAN || "sprout";
    const investInto = runtime.getSetting?.("BUFF_INVEST_INTO") || process.env.BUFF_INVEST_INTO || "BTC";
    const threshold = parseFloat(runtime.getSetting?.("BUFF_THRESHOLD") || process.env.BUFF_THRESHOLD || "5");
    if (agentSeed) {
        buffInstance = await BuffClass.init({
            agentSeed,
            platformId: "elizaos",
            agentId: runtime.agentId || "eliza-agent",
            source: "agent",
            plan: plan,
            investInto: investInto,
            investThreshold: threshold,
        });
    }
    else {
        // Generate a new keypair if no seed provided
        const kp = web3_js_1.Keypair.generate();
        buffInstance = await BuffClass.init({
            agentKeypair: kp,
            platformId: "elizaos",
            agentId: runtime.agentId || "eliza-agent",
            source: "agent",
            plan: plan,
            investInto: investInto,
            investThreshold: threshold,
        });
    }
    return buffInstance;
}
// ── Actions ──
const roundUpAction = {
    name: "BUFF_ROUNDUP",
    similes: ["ROUND_UP", "INVEST_SPARE_CHANGE", "BUFF_WRAP", "RECORD_ROUNDUP"],
    description: "Record a round-up from a transaction. Calculates the spare change and adds it to the investment accumulator.",
    validate: async (runtime, message) => {
        const text = message.content?.text || "";
        return /round.?up|invest|spare.?change|buff/i.test(text) || message.content?.action === "BUFF_ROUNDUP";
    },
    handler: async (runtime, message, state, options, callback) => {
        try {
            const buff = await getBuff(runtime);
            const amount = parseFloat(message.content?.amount || message.content?.txValueUsd || "1");
            const breakdown = await buff.wrapAmount({
                txValueUsd: amount,
                source: "agent",
                memo: message.content?.memo || "ElizaOS agent transaction",
            });
            const text = `Rounded up $${amount.toFixed(2)} → $${breakdown.roundedToUsd?.toFixed(2) || "N/A"}. Invested $${breakdown.userInvestmentUsd?.toFixed(4) || breakdown.roundUpUsd?.toFixed(4)} into your Buff portfolio.`;
            if (callback)
                callback({ text });
            return { success: true, text, data: breakdown };
        }
        catch (err) {
            const text = `Round-up failed: ${err.message}`;
            if (callback)
                callback({ text });
            return { success: false, text };
        }
    },
    examples: [
        [
            { user: "{{user1}}", content: { text: "Round up my $4.73 transaction", amount: "4.73" } },
            { user: "{{agent}}", content: { text: "Rounded up $4.73 → $5.00. Invested $0.2680 into your Buff portfolio." } },
        ],
    ],
};
const investAction = {
    name: "BUFF_INVEST",
    similes: ["CHECK_INVEST", "AUTO_INVEST", "SWAP_TO_BTC", "BUFF_CHECK"],
    description: "Check if the investment threshold is reached and auto-invest accumulated round-ups into crypto via Jupiter.",
    validate: async (runtime, message) => {
        const text = message.content?.text || "";
        return /invest|threshold|swap|check.*buff|buff.*check/i.test(text) || message.content?.action === "BUFF_INVEST";
    },
    handler: async (runtime, message, state, options, callback) => {
        try {
            const buff = await getBuff(runtime);
            const { state: accState, swaps } = await buff.checkAndInvest();
            let text;
            if (swaps.length > 0) {
                const swapDetails = swaps.map((s) => `${s.inputSol.toFixed(4)} SOL → ${s.asset}`).join(", ");
                text = `Threshold reached! Invested: ${swapDetails}`;
            }
            else if (accState.thresholdReached) {
                text = `Threshold reached ($${accState.balanceUsd.toFixed(2)} / $${accState.thresholdUsd}) but swap failed. Will retry.`;
            }
            else {
                text = `Accumulated $${accState.balanceUsd.toFixed(2)} / $${accState.thresholdUsd}. ${(accState.thresholdUsd - accState.balanceUsd).toFixed(2)} more to go.`;
            }
            if (callback)
                callback({ text });
            return { success: true, text, data: { state: accState, swaps } };
        }
        catch (err) {
            const text = `Investment check failed: ${err.message}`;
            if (callback)
                callback({ text });
            return { success: false, text };
        }
    },
    examples: [
        [
            { user: "{{user1}}", content: { text: "Check my Buff investments" } },
            { user: "{{agent}}", content: { text: "Accumulated $3.42 / $5.00. $1.58 more to go." } },
        ],
    ],
};
const portfolioAction = {
    name: "BUFF_PORTFOLIO",
    similes: ["CHECK_PORTFOLIO", "BUFF_BALANCE", "MY_INVESTMENTS", "BUFF_HOLDINGS"],
    description: "Get the agent's Buff portfolio — shows invested assets, pending SOL, and total value.",
    validate: async (runtime, message) => {
        const text = message.content?.text || "";
        return /portfolio|balance|holdings|invested|buff.*value/i.test(text) || message.content?.action === "BUFF_PORTFOLIO";
    },
    handler: async (runtime, message, state, options, callback) => {
        try {
            const buff = await getBuff(runtime);
            const portfolio = await buff.getPortfolio();
            const stats = buff.getStats();
            let text = `Buff Portfolio:\n`;
            text += `Total: $${(portfolio.totalUsd + portfolio.pendingUsd).toFixed(2)}\n`;
            text += `Pending: ${portfolio.pendingSol.toFixed(6)} SOL ($${portfolio.pendingUsd.toFixed(2)})\n`;
            for (const b of portfolio.balances) {
                text += `${b.asset}: ${b.balance} ($${b.usdValue.toFixed(2)})\n`;
            }
            text += `\nLifetime: ${stats.totalRoundUps} round-ups, $${stats.totalInvestedUsd.toFixed(2)} invested`;
            if (callback)
                callback({ text });
            return { success: true, text, data: { portfolio, stats } };
        }
        catch (err) {
            const text = `Portfolio check failed: ${err.message}`;
            if (callback)
                callback({ text });
            return { success: false, text };
        }
    },
    examples: [
        [
            { user: "{{user1}}", content: { text: "Show my Buff portfolio" } },
            { user: "{{agent}}", content: { text: "Buff Portfolio:\nTotal: $48.20\nBTC: 0.00068 ($48.20)\n\nLifetime: 142 round-ups, $48.20 invested" } },
        ],
    ],
};
const setPlanAction = {
    name: "BUFF_SET_PLAN",
    similes: ["CHANGE_PLAN", "SET_ROUNDUP_PLAN", "BUFF_PLAN"],
    description: "Change the Buff round-up plan tier (seed=$0.05, sprout=$0.10, tree=$0.50, forest=$1.00).",
    validate: async (runtime, message) => {
        const text = message.content?.text || "";
        return /set.*plan|change.*plan|buff.*plan|seed|sprout|tree|forest/i.test(text) || message.content?.action === "BUFF_SET_PLAN";
    },
    handler: async (runtime, message, state, options, callback) => {
        try {
            const buff = await getBuff(runtime);
            const text = message.content?.text || "";
            const planMatch = text.match(/\b(seed|sprout|tree|forest)\b/i);
            const plan = planMatch ? planMatch[1].toLowerCase() : "sprout";
            buff.setPlan(plan);
            const current = buff.getCurrentPlan();
            const resultText = `Plan set to ${current.tier} — rounds to $${current.roundToUsd.toFixed(2)}, ${current.buffFeePercent}% fee.`;
            if (callback)
                callback({ text: resultText });
            return { success: true, text: resultText, data: current };
        }
        catch (err) {
            const text = `Failed to set plan: ${err.message}`;
            if (callback)
                callback({ text });
            return { success: false, text };
        }
    },
    examples: [
        [
            { user: "{{user1}}", content: { text: "Set my Buff plan to tree" } },
            { user: "{{agent}}", content: { text: "Plan set to Tree — rounds to $0.50, 0.5% fee." } },
        ],
    ],
};
const setAllocAction = {
    name: "BUFF_SET_ALLOC",
    similes: ["SET_ALLOCATION", "CHANGE_ALLOCATION", "PORTFOLIO_SPLIT", "BUFF_ALLOC"],
    description: "Set portfolio allocation — e.g. 60% BTC, 40% ETH. Must sum to 100%.",
    validate: async (runtime, message) => {
        const text = message.content?.text || "";
        return /alloc|split|percent.*btc|percent.*eth|60.*40|50.*50/i.test(text) || message.content?.action === "BUFF_SET_ALLOC";
    },
    handler: async (runtime, message, state, options, callback) => {
        try {
            const buff = await getBuff(runtime);
            const text = message.content?.text || "";
            // Parse allocations from text like "60% BTC 40% ETH" or "50 BTC 30 ETH 20 SOL"
            const matches = text.matchAll(/(\d+)%?\s*(BTC|ETH|SOL|USDC)/gi);
            const allocations = [];
            for (const m of matches) {
                allocations.push({ asset: m[2].toUpperCase(), pct: parseInt(m[1]) });
            }
            if (allocations.length === 0) {
                const resultText = "Couldn't parse allocations. Use format like: 60% BTC 40% ETH";
                if (callback)
                    callback({ text: resultText });
                return { success: false, text: resultText };
            }
            const total = allocations.reduce((s, a) => s + a.pct, 0);
            if (total !== 100) {
                const resultText = `Allocations must sum to 100%, got ${total}%. Adjust and try again.`;
                if (callback)
                    callback({ text: resultText });
                return { success: false, text: resultText };
            }
            buff.setAllocations(allocations);
            const detail = allocations.map(a => `${a.pct}% ${a.asset}`).join(", ");
            const resultText = `Allocation set: ${detail}`;
            if (callback)
                callback({ text: resultText });
            return { success: true, text: resultText, data: allocations };
        }
        catch (err) {
            const text = `Failed to set allocation: ${err.message}`;
            if (callback)
                callback({ text });
            return { success: false, text };
        }
    },
    examples: [
        [
            { user: "{{user1}}", content: { text: "Set allocation to 60% BTC 40% ETH" } },
            { user: "{{agent}}", content: { text: "Allocation set: 60% BTC, 40% ETH" } },
        ],
    ],
};
// ── Provider ──
const buffPortfolioProvider = {
    name: "buffPortfolio",
    description: "Provides the agent's Buff portfolio context for investment-related conversations.",
    get: async (runtime, message) => {
        try {
            const buff = await getBuff(runtime);
            const stats = buff.getStats();
            const plan = buff.getCurrentPlan();
            const allocs = buff.getAllocations();
            const allocStr = allocs.map((a) => `${a.pct}% ${a.asset}`).join(", ");
            return `[Buff Status] Plan: ${plan.tier} ($${plan.roundToUsd} round-up) | Allocation: ${allocStr} | Round-ups: ${stats.totalRoundUps} | Invested: $${stats.totalInvestedUsd.toFixed(2)} | Wallet: ${buff.getWalletAddress()}`;
        }
        catch {
            return "[Buff Status] Not initialized";
        }
    },
};
// ── Plugin Export ──
exports.buffPlugin = {
    name: "buff",
    description: "Buff round-up investing — auto-invest spare change from every agent transaction into BTC, ETH, SOL via Jupiter on Solana.",
    actions: [roundUpAction, investAction, portfolioAction, setPlanAction, setAllocAction],
    providers: [buffPortfolioProvider],
    services: [],
};
exports.default = exports.buffPlugin;
