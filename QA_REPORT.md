# QA Report — CLAWD Stake 🦞

**Date:** 2026-02-25  
**Auditor:** clawdgut (ethskills.com QA checklist)  
**Contract:** `ClawdStake` @ [`0xc9d25b7ad08f2d238302e56681b373b3e18b8e00`](https://basescan.org/address/0xc9d25b7ad08f2d238302e56681b373b3e18b8e00) on Base  
**Live:** https://stake.clawdbotatg.eth.link/  
**Standards:** [ethskills.com/qa](https://ethskills.com/qa/SKILL.md) · [ethskills.com/frontend-ux](https://ethskills.com/frontend-ux/SKILL.md) · [ethskills.com/security](https://ethskills.com/security/SKILL.md)

---

## Overall Summary

**Status: 🟡 Mostly Ship-Ready with Minor Issues**

ClawdStake is a clean, well-structured staking dApp. The smart contract is solid, the frontend follows most ethskills standards, and the codebase is well-tested. A previous audit (`QA-AUDIT.md`, 2026-02-24) identified several issues; most have been resolved. This report audits the current state of the code.

**Ship blockers remaining:** None  
**Should-fix issues:** 3 (bare HTTP fallback, duplicate h1, dead test-mode code)  
**Minor polish:** 2

---

## Part 1: Smart Contract Audit

### Contract: `packages/foundry/contracts/ClawdStake.sol`

#### ✅ Strengths

| Item | Finding |
|------|---------|
| **SafeERC20** | All token transfers use `SafeERC20` — handles non-standard ERC20s (e.g. USDT) that don't return `bool`. Required for any production token integration. |
| **Checks-Effects-Interactions** | Both `unstake()` and `reclaimAbandoned()` follow CEI pattern: state cleared before transfers. No reentrancy risk. |
| **No integer overflow** | Solidity `^0.8.20` — overflow/underflow checked by default. |
| **Immutable token address** | `clawd` declared `immutable` — cannot be changed after deploy. |
| **Balance accounting** | `totalAccountedBalance()` = `houseReserve + totalStaked + totalCommitted`. Tests confirm this matches `balanceOf(address(this))` across stake/unstake cycles. |
| **Events on all state changes** | `Staked`, `Unstaked`, `HouseLoaded`, `HouseWithdrawn`, `AbandonedStakeReclaimed` — full audit trail. |
| **Constants clearly named** | `STAKE_AMOUNT`, `YIELD_AMOUNT`, `BURN_AMOUNT`, `LOCK_DURATION` — self-documenting math. |
| **One stake per address** | `require(!stakes[msg.sender].active)` prevents double-staking. |
| **House reserve gating** | `require(houseReserve >= YIELD_AMOUNT + BURN_AMOUNT)` before accepting user funds — staker can never be stuck waiting for yield that doesn't exist. |

#### ⚠️ Issues

**[LOW] No `ReentrancyGuard`**  
File: `ClawdStake.sol`  
CEI pattern is correctly followed so there is no current exploit path. However, a `ReentrancyGuard` is defense-in-depth against future modifications that accidentally break CEI order.  
_Recommendation: Add `import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"` and `nonReentrant` on `stake()`, `unstake()`, `reclaimAbandoned()`._

**[LOW] Centralization risk — owner has unilateral power over house reserve**  
File: `ClawdStake.sol`, `withdrawHouse()` + `reclaimAbandoned()`  
Owner can drain the house reserve (`withdrawHouse`) or reclaim a user's locked principal after 30 days (`reclaimAbandoned`). There is no timelock or multisig requirement. Users must trust the operator entirely.  
_Current mitigation:_ `reclaimAbandoned` requires 30+ days past unlock (reasonable "lost keys" window).  
_Recommendation: Document the trust model in the README and/or deploy the owner as a multisig (Safe)._

**[INFORMATIONAL] `BURN_ADDRESS` is `0x...dEaD`, not `address(0)`**  
File: `ClawdStake.sol` line 20  
`0x000000000000000000000000000000000000dEaD` is the standard burn address for ERC-20s that would revert on a transfer to `address(0)`. This is correct for ERC-20 burning. Not an issue.

**[INFORMATIONAL] No upgradeability**  
The contract is not upgradeable (no proxy). For a simple staking vault this is actually safer — no upgrade key to steal. Document this as a feature, not a gap.

#### ✅ Test Coverage: `packages/foundry/test/ClawdStake.t.sol`

| Category | Tests | Quality |
|----------|-------|---------|
| Deployment | `test_DeployOk` | ✅ |
| `loadHouse` | load, non-owner revert | ✅ |
| `withdrawHouse` | withdraw, exceed-reserve revert, non-owner revert | ✅ |
| `stake` | success, house decrement, double-stake revert, insufficient-house revert | ✅ |
| `unstake` | early revert, no-stake revert, after-1-day, yield correct, burn correct, stats correct | ✅ |
| Balance accounting | `totalAccountedBalance` matches `balanceOf(this)` at all phases | ✅ |
| Staker tracking | Unique staker counting across stake/unstake cycles | ✅ |
| `reclaimAbandoned` | Too-early revert, valid reclaim, non-owner revert, no-stake revert | ✅ |
| `activeStakers` | Multi-user tracking | ✅ |
| View functions | `slotsAvailable`, `timeUntilUnlock`, `canUnstake` | ✅ |
| Multi-user | 3 simultaneous stakers | ✅ |
| Fuzz | `testFuzz_StakeUnstakeYield` — random warp time within valid range | ✅ |

**Missing tests:**
- No invariant test (`invariant_*`) — fuzz covers parameterized inputs but doesn't sequence random calls. Per ethskills, invariant testing is the gold standard for vault math. _Recommendation: Add invariant test asserting `totalAccountedBalance() == clawd.balanceOf(address(staking))` across random call sequences._
- No test for `stake()` with a token that reverts on `safeTransferFrom` (e.g. zero balance) — minor since the EVM will revert naturally.

---

## Part 2: Frontend Audit

### ethskills QA Checklist — Ship-Blocking

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Wallet connection shows a **BUTTON**, not text | ✅ **PASS** | `<RainbowKitCustomConnectButton />` rendered directly. No "connect to continue" text found in `page.tsx`. |
| 2 | Wrong network shows a Switch button | ✅ **PASS** | `isConnected && !isBase` branch renders `<RainbowKitCustomConnectButton />` which handles Switch Network. |
| 3 | One button at a time (Connect → Network → Approve → Action) | ✅ **PASS** | Clean five-state conditional (adding Locked state). No simultaneous Approve+Stake visible. |
| 4 | Approve button disabled with spinner through block confirmation | ✅ **PASS** | `disabled={isApproving}` + `isPending` from `useScaffoldWriteContract`. Uses scaffold hooks, not raw wagmi. |
| 5 | SE2 footer branding removed | ✅ **PASS** | Footer shows only `🦞 clawd-stake` (GitHub) + `$CLAWD on Base` (Basescan). |
| 6 | SE2 tab title removed | ✅ **PASS** | `titleTemplate = "%s | CLAWD Stake"` in `getMetadata.ts`. No SE2 reference. |
| 7 | SE2 README replaced | ✅ **PASS** | README is project-specific: describes mechanics, links live URL and contract addresses. |

All ship-blocking checks **PASS**.

---

### ethskills QA Checklist — Should Fix

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 8 | Contract address displayed with `<Address/>` | ✅ **PASS** | `<Address address={stakeContract.address} size="xs" />` at bottom of main card. |
| 9 | USD values next to all token/ETH amounts | ✅ **PASS** | DexScreener price feed (`useCLAWDPrice` hook). USD values on all stats, stake amounts, and balance display. |
| 10 | OG image is absolute production URL | ⚠️ **RISK** | `getMetadata.ts` builds URL from `process.env.VERCEL_PROJECT_PRODUCTION_URL`. If this env var is unset, image URL falls back to `http://localhost:3000/thumbnail.png`, breaking social unfurling. **Confirm `VERCEL_PROJECT_PRODUCTION_URL` is set in Vercel project settings.** |
| 11 | `pollingInterval` is 3000 | ✅ **PASS** | `scaffold.config.ts` line: `pollingInterval: 3000`. |
| 12 | RPC overrides set + env var confirmed | ⚠️ **RISK** | `rpcOverrides` uses `process.env.NEXT_PUBLIC_BASE_RPC \|\| "https://mainnet.base.org"`. Additionally, `wagmiConfig.tsx` (line 21) still contains a bare `http()` in the fallback array — viem's `fallback()` fires transports in parallel, meaning the public Base RPC can still receive requests even when override is set. **Remove the bare `http()` from the non-mainnet fallback path in `wagmiConfig.tsx`.** |
| 13 | Favicon updated from SE2 default | ✅ **PASS** | `public/favicon.png` present. `getMetadata.ts` explicitly sets `icon: "/favicon.png"`. |
| 14 | Phantom wallet in RainbowKit | ✅ **PASS** | `phantomWallet` imported and listed in `wagmiConnectors.tsx` (lines 6, 19). |
| 15 | Mobile deep linking | ✅ **PASS** | `useOpenWallet` + `useWriteAndOpen` hooks fully implemented (`page.tsx` lines 12–60). Checks WC session data in localStorage. Fires TX first, then deep-links after 2s. Skips if `window.ethereum` exists. All three write calls (`handleApprove`, `handleStake`, `handleUnstake`) wrapped with `writeAndOpen`. |
| 16 | No hardcoded dark backgrounds | ✅ **PASS** | `data-theme="dark"` forced in `layout.tsx` + `SwitchTheme` removed from footer (comment: "Theme toggle removed — dark-only app"). Page uses `bg-base-200 text-base-content`. Meets the "dark-only exception" pattern. |
| 17 | Raw wagmi `useWriteContract` not used in app code | ✅ **PASS** | `grep useWriteContract packages/nextjs/app/page.tsx` → no matches. All writes via `useScaffoldWriteContract`. |

---

### Additional Findings (Beyond Standard Checklist)

**[LOW] Duplicate `<h1>` — ethskills Rule 5 violation**  
File: `packages/nextjs/app/page.tsx`, line ~247  
```tsx
<h1 className="text-4xl font-bold mb-2 text-base-content">CLAWD Stake</h1>
```
The Header (`Header.tsx` line ~68) already renders `"🦞 CLAWD Stake"` as a bold `<span>` in the nav link on desktop. Per ethskills Rule 5, the page body should not repeat the app name as an `<h1>`. This wastes vertical space and is redundant with the header branding.  
_Recommendation: Replace `<h1>CLAWD Stake</h1>` with a tagline or subtitle, or remove it entirely and jump straight into the stats/card UI._

**[LOW] Dead test-mode code — `IS_TEST = false` hardcoded**  
File: `packages/nextjs/app/page.tsx`, line ~68  
```tsx
const IS_TEST = false;
```
The `IS_TEST` flag is referenced throughout the page to conditionally show "100 CLAWD / 5 min lock / 1 CLAWD yield" values. Since this is `false`, all the ternary branches for TEST mode are dead code. This clutters the component and could confuse future contributors.  
_Recommendation: Remove `IS_TEST` and all its ternary branches. If test mode is needed, use an environment variable (`process.env.NEXT_PUBLIC_TEST_MODE`) or a separate deploy._

**[INFORMATIONAL] `wagmiConfig.tsx` bare `http()` fallback (deeper context)**  
File: `packages/nextjs/services/web3/wagmiConfig.tsx`, line 21  
```ts
let rpcFallbacks = [...(chain.id === mainnet.id ? mainnetFallbackWithDefaultRPC : []), http()];
```
This bare `http()` is always added to the fallback list for non-mainnet chains. Even when `NEXT_PUBLIC_BASE_RPC` is correctly set, viem's `fallback()` transport fires all transports in parallel — the public Base RPC (`mainnet.base.org`) gets spammed every poll cycle. Under sustained load this will hit rate limits.  
_Fix: Change to `let rpcFallbacks: ReturnType<typeof http>[] = [];` (empty array for non-mainnet) before the override is applied._

**[INFORMATIONAL] `useConnectorClient` type cast**  
File: `packages/nextjs/app/page.tsx`, line ~20  
```ts
(connectorClient as any)?.connector?.id
```
The `as any` cast is used to access `connector` on the client object. This is fragile — if wagmi changes the internal shape this silently returns `undefined`. Not a bug today but a maintenance risk.  
_Recommendation: Use `useAccount()` 's `connector` field directly: `const { connector } = useAccount()`. This is the stable public API._

**[INFORMATIONAL] CLAWD price fetch — no retry / stale handling**  
File: `packages/nextjs/app/page.tsx`, `useCLAWDPrice` hook  
DexScreener is fetched once on mount. If the fetch fails (network blip, CORS, DexScreener downtime), `price` stays `null` permanently and all USD values disappear silently. No retry, no stale-while-revalidate, no error state shown to user.  
_Recommendation: Add a simple retry with exponential backoff or use SWR/React Query with `refreshInterval`._

---

## Part 3: Ethskills Compliance Summary

| Skill | Compliance |
|-------|-----------|
| **security** — SafeERC20, CEI, no overflow | ✅ Compliant |
| **security** — ReentrancyGuard | ⚠️ Missing (mitigated by CEI) |
| **testing** — unit + fuzz | ✅ Compliant |
| **testing** — invariant tests | ⚠️ Missing |
| **frontend-ux Rule 1** — loader + disable per button | ✅ Compliant |
| **frontend-ux Rule 2** — four-state flow | ✅ Compliant |
| **frontend-ux Rule 3** — `<Address/>` for display | ✅ Compliant |
| **frontend-ux Rule 4** — USD values everywhere | ✅ Compliant |
| **frontend-ux Rule 5** — no duplicate h1 | ❌ Duplicate h1 present |
| **frontend-ux Rule 6** — RPC config | ⚠️ Bare `http()` fallback |
| **frontend-ux Rule 7** — DaisyUI semantic colors | ✅ Compliant (dark-only exception) |
| **frontend-ux Rule 8** — pre-publish checklist | ✅ Mostly compliant |
| **qa** — mobile deep linking | ✅ Compliant |
| **qa** — Phantom wallet | ✅ Compliant |
| **qa** — SE2 branding removed | ✅ Compliant |
| **qa** — raw wagmi not used | ✅ Compliant |

---

## Prioritized Fix List

### 🟡 Should Fix (before next major traffic push)

1. **Remove bare `http()` from wagmiConfig.tsx** — prevents rate-limiting of public Base RPC  
   `packages/nextjs/services/web3/wagmiConfig.tsx` line 21  
   Change `let rpcFallbacks = [..., http()]` → start with empty array for non-mainnet

2. **Remove duplicate `<h1>CLAWD Stake</h1>`** — ethskills Rule 5 violation, wastes space  
   `packages/nextjs/app/page.tsx` line ~247  
   Replace with a tagline or remove entirely

3. **Confirm `VERCEL_PROJECT_PRODUCTION_URL` is set in Vercel** — prevents broken OG images  
   Run `vercel env ls | grep VERCEL_PROJECT_PRODUCTION_URL` to verify

### 🔵 Nice to Have

4. **Clean up `IS_TEST` dead code** — reduces clutter in `page.tsx`

5. **Replace `as any` with `useAccount().connector`** — safer mobile deep-link detection

6. **Add retry to `useCLAWDPrice`** — more resilient USD display

7. **Add invariant test** — `invariant_balanceAlwaysAccountedFor` in Foundry

8. **Add `ReentrancyGuard`** — defense-in-depth for future contract changes

---

## Conclusion

ClawdStake is a well-built, production-deployed dApp. The contract is clean and correctly audited. The frontend correctly implements all the hard patterns agents typically get wrong: four-state button flow, per-button loading states, scaffold hooks only, mobile deep linking, USD values, and custom branding. The existing `QA-AUDIT.md` items (connect-text, favicon, titleTemplate, README) appear to have been addressed since that audit.

The three remaining "should fix" items are operational risks (RPC rate limits, broken OG unfurl) that should be addressed before a marketing push. None are functional bugs.
