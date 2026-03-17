"use strict";
/**
 * @elizaos-plugins/plugin-buff
 *
 * Buff round-up investing plugin for ElizaOS.
 * Auto-invests spare change from every agent transaction into crypto assets.
 * Uses the Buff API (server-side fee enforcement) — no sensitive logic here.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buffPlugin = void 0;
const buff_protocol_sdk_1 = require("buff-protocol-sdk");
// Shared Buff client instance
let buffInstance = null;
let agentWalletPubkey = null;
function getBuff(runtime) {
    if (buffInstance)
        return buffInstance;
    const apiKey = runtime.getSetting?.("BUFF_API_KEY") || process.env.BUFF_API_KEY;
    const plan = (runtime.getSetting?.("BUFF_PLAN") || process.env.BUFF_PLAN || "sprout");
    const investInto = (runtime.getSetting?.("BUFF_INVEST_INTO") || process.env.BUFF_INVEST_INTO || "BTC");
    const threshold = parseFloat(runtime.getSetting?.("BUFF_THRESHOLD") || process.env.BUFF_THRESHOLD || "5");
    buffInstance = new buff_protocol_sdk_1.Buff({
        apiKey,
        plan,
        investInto,
        investThreshold: threshold,
    });
    agentWalletPubkey = runtime.getSetting?.("BUFF_WALLET_PUBKEY") || process.env.BUFF_WALLET_PUBKEY || null;
    return buffInstance;
}
// ── Actions ──
const roundUpAction = {
    name: "BUFF_ROUNDUP",
    similes: ["ROUND_UP", "INVEST_SPARE_CHANGE", "BUFF_WRAP", "RECORD_ROUNDUP"],
    description: "Record a round-up from a transaction. Calculates the spare change via the Buff API.",
    validate: async (_runtime, message) => {
        const text = message.content?.text || "";
        return /round.?up|invest|spare.?change|buff/i.test(text) || message.content?.action === "BUFF_ROUNDUP";
    },
    handler: async (runtime, message, _state, _options, callback) => {
        try {
            const buff = getBuff(runtime);
            const amount = parseFloat(message.content?.amount || message.content?.txValueUsd || "1");
            const breakdown = await buff.calculateRoundUp(amount);
            const text = breakdown.skipped
                ? `$${amount.toFixed(2)} is an exact amount — no round-up needed.`
                : `Rounded up $${amount.toFixed(2)} → $${breakdown.roundedToUsd.toFixed(2)}. Round-up: $${breakdown.roundUpUsd.toFixed(4)} (fee: $${breakdown.buffFeeUsd.toFixed(4)}, invested: $${breakdown.userInvestmentUsd.toFixed(4)})`;
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
            { user: "{{agent}}", content: { text: "Rounded up $4.73 → $4.80. Round-up: $0.07 (fee: $0.0005, invested: $0.0695)" } },
        ],
    ],
};
const investAction = {
    name: "BUFF_INVEST",
    similes: ["CHECK_INVEST", "AUTO_INVEST", "SWAP_TO_BTC", "BUFF_CHECK"],
    description: "Check if the investment threshold is reached and build swap transactions via the Buff API.",
    validate: async (_runtime, message) => {
        const text = message.content?.text || "";
        return /invest|threshold|swap|check.*buff|buff.*check/i.test(text) || message.content?.action === "BUFF_INVEST";
    },
    handler: async (runtime, message, _state, _options, callback) => {
        try {
            const buff = getBuff(runtime);
            const wallet = agentWalletPubkey || message.content?.walletPubkey;
            if (!wallet) {
                const text = "No wallet configured. Set BUFF_WALLET_PUBKEY to check investments.";
                if (callback)
                    callback({ text });
                return { success: false, text };
            }
            const acc = await buff.getAccumulator(wallet);
            if (!acc.thresholdReached) {
                const text = `Accumulated $${acc.balanceUsd.toFixed(2)} / $${acc.thresholdUsd}. $${acc.remaining.toFixed(2)} more to go.`;
                if (callback)
                    callback({ text });
                return { success: true, text, data: acc };
            }
            const result = await buff.buildSwap(wallet);
            if (!result.ready || result.transactions.length === 0) {
                const text = `Threshold reached ($${acc.balanceUsd.toFixed(2)}) but no swaps available.`;
                if (callback)
                    callback({ text });
                return { success: true, text, data: result };
            }
            const swapDetails = result.transactions.map((t) => `${t.quote.inputSol.toFixed(4)} SOL → ${t.asset}`).join(", ");
            const text = `Threshold reached! Built swap transactions: ${swapDetails}. Sign and execute to complete.`;
            if (callback)
                callback({ text });
            return { success: true, text, data: result };
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
    description: "Get the agent's Buff portfolio — shows balances and pending SOL.",
    validate: async (_runtime, message) => {
        const text = message.content?.text || "";
        return /portfolio|balance|holdings|invested|buff.*value/i.test(text) || message.content?.action === "BUFF_PORTFOLIO";
    },
    handler: async (runtime, message, _state, _options, callback) => {
        try {
            const buff = getBuff(runtime);
            const wallet = agentWalletPubkey || message.content?.walletPubkey;
            if (!wallet) {
                const text = "No wallet configured. Set BUFF_WALLET_PUBKEY to view portfolio.";
                if (callback)
                    callback({ text });
                return { success: false, text };
            }
            const portfolio = await buff.getPortfolio(wallet);
            let text = `Buff Portfolio:\n`;
            text += `Total: $${portfolio.totalUsd.toFixed(2)}\n`;
            text += `Pending: ${portfolio.pendingSol.toFixed(6)} SOL ($${portfolio.pendingUsd.toFixed(2)})\n`;
            for (const b of portfolio.balances) {
                text += `${b.asset}: ${b.amount} ($${b.usdValue.toFixed(2)})\n`;
            }
            if (callback)
                callback({ text });
            return { success: true, text, data: portfolio };
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
            { user: "{{agent}}", content: { text: "Buff Portfolio:\nTotal: $48.20\nBTC: 0.00068 ($48.20)" } },
        ],
    ],
};
const setPlanAction = {
    name: "BUFF_SET_PLAN",
    similes: ["CHANGE_PLAN", "SET_ROUNDUP_PLAN", "BUFF_PLAN"],
    description: "Change the Buff round-up plan tier (seed=$0.05, sprout=$0.10, tree=$0.50, forest=$1.00).",
    validate: async (_runtime, message) => {
        const text = message.content?.text || "";
        return /set.*plan|change.*plan|buff.*plan|seed|sprout|tree|forest/i.test(text) || message.content?.action === "BUFF_SET_PLAN";
    },
    handler: async (runtime, message, _state, _options, callback) => {
        try {
            const buff = getBuff(runtime);
            const text = message.content?.text || "";
            const planMatch = text.match(/\b(seed|sprout|tree|forest)\b/i);
            const plan = (planMatch ? planMatch[1].toLowerCase() : "sprout");
            buff.setPlan(plan);
            const plans = {
                seed: "$0.05, 1% fee",
                sprout: "$0.10, 0.75% fee",
                tree: "$0.50, 0.5% fee",
                forest: "$1.00, 0.25% fee",
            };
            const resultText = `Plan set to ${plan} — rounds to ${plans[plan]}.`;
            if (callback)
                callback({ text: resultText });
            return { success: true, text: resultText };
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
            { user: "{{agent}}", content: { text: "Plan set to tree — rounds to $0.50, 0.5% fee." } },
        ],
    ],
};
const setAllocAction = {
    name: "BUFF_SET_ALLOC",
    similes: ["SET_ALLOCATION", "CHANGE_ALLOCATION", "PORTFOLIO_SPLIT", "BUFF_ALLOC"],
    description: "Set portfolio allocation — e.g. 60% BTC, 40% ETH. Must sum to 100%.",
    validate: async (_runtime, message) => {
        const text = message.content?.text || "";
        return /alloc|split|percent.*btc|percent.*eth|60.*40|50.*50/i.test(text) || message.content?.action === "BUFF_SET_ALLOC";
    },
    handler: async (runtime, message, _state, _options, callback) => {
        try {
            const buff = getBuff(runtime);
            const text = message.content?.text || "";
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
                const resultText = `Allocations must sum to 100%, got ${total}%.`;
                if (callback)
                    callback({ text: resultText });
                return { success: false, text: resultText };
            }
            buff.setAllocations(allocations);
            const detail = allocations.map((a) => `${a.pct}% ${a.asset}`).join(", ");
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
    get: async (runtime, _message) => {
        try {
            const buff = getBuff(runtime);
            const wallet = agentWalletPubkey;
            if (!wallet)
                return "[Buff Status] No wallet configured";
            const acc = await buff.getAccumulator(wallet);
            return `[Buff Status] Balance: ${acc.balanceSol.toFixed(6)} SOL ($${acc.balanceUsd.toFixed(2)}) | Threshold: $${acc.thresholdUsd} | Ready: ${acc.thresholdReached}`;
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
