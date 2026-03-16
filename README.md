# @elizaos-plugins/plugin-buff

Buff round-up investing plugin for ElizaOS. Auto-invests spare change from every agent transaction into crypto assets via Jupiter on Solana.

## Install

```bash
npm install @elizaos-plugins/plugin-buff
```

## Configure

Set environment variables:

```bash
BUFF_AGENT_SEED=your-32-byte-hex-seed   # Deterministic wallet (optional — generates random if not set)
BUFF_PLAN=sprout                         # seed|sprout|tree|forest
BUFF_INVEST_INTO=BTC                     # BTC|ETH|SOL|USDC
BUFF_THRESHOLD=5                         # USD threshold before auto-swap
```

## Add to your character

```json
{
  "name": "my-agent",
  "plugins": ["@elizaos-plugins/plugin-buff"]
}
```

## Actions

| Action | Trigger | Description |
|--------|---------|-------------|
| `BUFF_ROUNDUP` | "round up my $4.73 transaction" | Record a round-up |
| `BUFF_INVEST` | "check my Buff investments" | Check threshold & auto-invest |
| `BUFF_PORTFOLIO` | "show my Buff portfolio" | View invested assets |
| `BUFF_SET_PLAN` | "set plan to tree" | Change round-up tier |
| `BUFF_SET_ALLOC` | "set allocation 60% BTC 40% ETH" | Set portfolio split |

## Provider

The `buffPortfolioProvider` automatically injects portfolio context into agent conversations, so the agent knows its investment status.

## How It Works

1. Agent makes transactions (swaps, API calls, payments)
2. Each transaction is rounded up to the nearest increment
3. Spare change accumulates in the agent's Buff wallet
4. When threshold is reached → auto-swap to BTC/ETH via Jupiter
5. Agent builds a crypto portfolio passively

## Links

- [Buff Docs](https://sow-beryl.vercel.app/docs)
- [Buff Dashboard](https://sow-beryl.vercel.app/dashboard)
- [GitHub](https://github.com/nightcode112/Buff)

## License

MIT
