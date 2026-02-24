# QA Audit — CLAWD Stake 🦞

**Date:** 2026-02-24
**Auditor:** LeftClaw (ethskills.com/qa)
**Contract:** ClawdStake @ `0xc9d25b7ad08f2d238302e56681b373b3e18b8e00` on Base
**Live:** https://stake.clawdbotatg.eth.link/

---

## Ship-Blocking

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Wallet connection shows a BUTTON, not text | ❌ FAIL | Shows "Connect your wallet to stake" text above the button. Should be JUST the button. |
| 2 | Wrong network shows a Switch button | ✅ PASS | RainbowKitCustomConnectButton handles it |
| 3 | One button at a time (Connect → Network → Approve → Action) | ✅ PASS | Clean four-state flow |
| 4 | Approve button disabled with spinner through block confirmation | ✅ PASS | useScaffoldWriteContract + isPending |
| 5 | SE2 footer branding removed | ✅ PASS | Shows clawd-stake repo + $CLAWD link |
| 6 | SE2 tab title removed | ⚠️ PARTIAL | Main title "CLAWD Stake 🦞" ✅ but titleTemplate still says "%s \| Scaffold-ETH 2" |
| 7 | SE2 README replaced | ❌ FAIL | Still stock SE2 README |

## Should Fix

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 8 | Contract address displayed with `<Address/>` | ✅ PASS | Shown at bottom of card |
| 9 | USD values next to all token/ETH amounts | ✅ PASS | DexScreener price feed throughout |
| 10 | OG image is absolute production URL | ⚠️ RISK | Resolves correctly on Vercel but default SE2 thumbnail image — needs custom |
| 11 | pollingInterval is 3000 | ✅ PASS | |
| 12 | RPC overrides set + env var confirmed | ⚠️ RISK | Falls back to mainnet.base.org if env not set |
| 13 | Favicon updated from SE2 default | ❌ FAIL | Still SE2 scaffold+diamond favicon |
| 14 | Phantom wallet in RainbowKit | ✅ PASS | |
| 15 | Mobile deep linking | ❌ FAIL | No writeAndOpen / openWallet pattern |

---

## Fix List

### 🔴 Must Fix
1. **Remove "Connect your wallet to stake" text** — button alone is enough (`page.tsx` line ~178)
2. **Replace README** — write project-specific README
3. **Custom favicon** — lobster/CLAWD branded (`public/favicon.png`)
4. **Fix titleTemplate** — change `"%s | Scaffold-ETH 2"` to `"%s | CLAWD Stake"` (`getMetadata.ts`)

### 🟡 Should Fix
5. **Custom OG thumbnail** — replace default SE2 image (`public/thumbnail.jpg`)
6. **Mobile deep linking** — implement `writeAndOpen` pattern for approve/stake/unstake
7. **Confirm RPC env var** — ensure `NEXT_PUBLIC_BASE_RPC` is set in build environment
