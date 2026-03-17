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
interface Plugin {
    name: string;
    description: string;
    actions: Action[];
    providers: Provider[];
    services: never[];
}
interface Action {
    name: string;
    similes: string[];
    description: string;
    validate: (runtime: any, message: any) => Promise<boolean>;
    handler: (runtime: any, message: any, state: any, options: any, callback: any) => Promise<{
        success: boolean;
        text: string;
        data?: any;
    }>;
    examples: any[][];
}
interface Provider {
    name: string;
    description: string;
    get: (runtime: any, message: any) => Promise<string>;
}
export declare const buffPlugin: Plugin;
export default buffPlugin;
