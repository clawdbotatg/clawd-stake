"use client";

import { useCallback, useEffect, useState } from "react";
import { Address } from "@scaffold-ui/components";
import { formatEther, parseEther } from "viem";
import { base } from "viem/chains";
import { useAccount, useChainId, useConnectorClient } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

const STAKE_AMOUNT = parseEther("1000000");

// ─── Mobile deep link helper ──────────────────────────────────────────────
function useOpenWallet() {
  const { data: connectorClient } = useConnectorClient();

  return useCallback(() => {
    if (typeof window === "undefined") return;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile || window.ethereum) return; // Skip desktop or in-app browser

    const allIds = [
      (connectorClient as any)?.connector?.id,
      (connectorClient as any)?.connector?.name,
      localStorage.getItem("wagmi.recentConnectorId"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    let wcWallet = "";
    try {
      const wcKey = Object.keys(localStorage).find(k => k.startsWith("wc@2:client"));
      if (wcKey) wcWallet = (localStorage.getItem(wcKey) || "").toLowerCase();
    } catch {}
    const search = `${allIds} ${wcWallet}`;

    const schemes: [string[], string][] = [
      [["rainbow"], "rainbow://"],
      [["metamask"], "metamask://"],
      [["coinbase", "cbwallet"], "cbwallet://"],
      [["trust"], "trust://"],
      [["phantom"], "phantom://"],
    ];

    for (const [keywords, scheme] of schemes) {
      if (keywords.some(k => search.includes(k))) {
        window.location.href = scheme;
        return;
      }
    }
  }, [connectorClient]);
}

function useWriteAndOpen() {
  const openWallet = useOpenWallet();
  return useCallback(
    <T,>(writeFn: () => Promise<T>): Promise<T> => {
      const promise = writeFn();
      setTimeout(openWallet, 2000);
      return promise;
    },
    [openWallet],
  );
}
const IS_TEST = false;
const LOCK_DURATION = 86400; // 24 hours in seconds
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

// ─── Countdown hook ────────────────────────────────────────────────────────
function useCountdown(unlockTimestamp: number) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const update = () => {
      const diff = unlockTimestamp - Math.floor(Date.now() / 1000);
      setRemaining(Math.max(0, diff));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [unlockTimestamp]);
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  return {
    remaining,
    formatted: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
  };
}

// ─── CLAWD price hook ──────────────────────────────────────────────────────
function useCLAWDPrice() {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    fetch("https://api.dexscreener.com/latest/dex/tokens/0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07")
      .then(r => r.json())
      .then(d => {
        const p = parseFloat(d?.pairs?.[0]?.priceUsd ?? "0");
        if (p > 0) setPrice(p);
      })
      .catch(() => {});
  }, []);
  return price;
}

function fmtClawd(wei: bigint | undefined) {
  if (!wei) return "0";
  const n = Number(formatEther(wei));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function usd(wei: bigint | undefined, price: number | null) {
  if (!wei || !price) return null;
  const val = Number(formatEther(wei)) * price;
  if (val >= 1000) return `~$${(val / 1000).toFixed(1)}K`;
  return `~$${val.toFixed(2)}`;
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function Home() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isBase = chainId === base.id;
  const clawdPrice = useCLAWDPrice();

  const writeAndOpen = useWriteAndOpen();

  // ── ClawdStake contract info ──
  const { data: stakeContract } = useDeployedContractInfo({ contractName: "ClawdStake" });

  // ── Contract reads ──
  const { data: houseReserve } = useScaffoldReadContract({
    contractName: "ClawdStake",
    functionName: "houseReserve",
  });
  const { data: totalStaked } = useScaffoldReadContract({
    contractName: "ClawdStake",
    functionName: "totalStaked",
  });
  const { data: totalYieldPaid } = useScaffoldReadContract({
    contractName: "ClawdStake",
    functionName: "totalYieldPaid",
  });
  const { data: totalBurned } = useScaffoldReadContract({
    contractName: "ClawdStake",
    functionName: "totalBurned",
  });
  const { data: slotsAvailable } = useScaffoldReadContract({
    contractName: "ClawdStake",
    functionName: "slotsAvailable",
  });
  const { data: totalStakers } = useScaffoldReadContract({
    contractName: "ClawdStake",
    functionName: "totalStakers",
  });

  // ── User's stake ──
  const { data: stakeInfo, refetch: refetchStake } = useScaffoldReadContract({
    contractName: "ClawdStake",
    functionName: "getStake",
    args: [address ?? ZERO_ADDR],
  });
  const { refetch: refetchTime } = useScaffoldReadContract({
    contractName: "ClawdStake",
    functionName: "timeUntilUnlock",
    args: [address ?? ZERO_ADDR],
  });
  const { refetch: refetchCanUnstake } = useScaffoldReadContract({
    contractName: "ClawdStake",
    functionName: "canUnstake",
    args: [address ?? ZERO_ADDR],
  });

  // ── CLAWD allowance ──
  const { data: clawdAllowance, refetch: refetchAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [address ?? ZERO_ADDR, stakeContract?.address ?? ZERO_ADDR],
  });

  // ── CLAWD balance ──
  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [address ?? ZERO_ADDR],
  });

  // ── Write hooks ──
  const { writeContractAsync: approveClawd, isPending: isApproving } = useScaffoldWriteContract({
    contractName: "CLAWD",
  });
  const { writeContractAsync: stakeWrite, isPending: isStaking } = useScaffoldWriteContract({
    contractName: "ClawdStake",
  });
  const { writeContractAsync: unstakeWrite, isPending: isUnstaking } = useScaffoldWriteContract({
    contractName: "ClawdStake",
  });

  // ── Countdown ──
  const unlockTimestamp = stakeInfo?.active ? Number(stakeInfo.stakedAt) + LOCK_DURATION : 0;
  const { remaining: secondsLeft, formatted: countdownStr } = useCountdown(unlockTimestamp);

  // ── Action handlers ──
  const handleApprove = async () => {
    await writeAndOpen(() =>
      approveClawd({
        functionName: "approve",
        args: [stakeContract?.address ?? ZERO_ADDR, STAKE_AMOUNT],
      }),
    );
    await refetchAllowance();
  };

  const handleStake = async () => {
    await writeAndOpen(() => stakeWrite({ functionName: "stake" }));
    await refetchStake();
    await refetchAllowance();
  };

  const handleUnstake = async () => {
    await writeAndOpen(() => unstakeWrite({ functionName: "unstake" }));
    await refetchStake();
    await refetchTime();
    await refetchCanUnstake();
  };

  // ── Derived state ──
  const isApproved = clawdAllowance !== undefined && clawdAllowance >= STAKE_AMOUNT;
  const hasActivStake = stakeInfo?.active === true;
  const isLocked = hasActivStake && secondsLeft > 0;
  const isMatured = hasActivStake && secondsLeft === 0;
  const hasEnoughClawd = clawdBalance !== undefined && clawdBalance >= STAKE_AMOUNT;

  // Progress bar (0–100%)
  const lockProgress = hasActivStake
    ? Math.min(100, Math.round(((LOCK_DURATION - secondsLeft) / LOCK_DURATION) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-base-200 text-base-content">
      {/* ── Stats Banner ─────────────────────────────────────────── */}
      <div className="border-b border-base-content/10 py-4 px-4">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-6 text-sm">
          <StatPill
            label="House Reserve"
            value={`${fmtClawd(houseReserve)} CLAWD`}
            sub={usd(houseReserve, clawdPrice)}
            color="text-orange-400"
          />
          <StatPill
            label="Open Slots"
            value={slotsAvailable !== undefined ? String(slotsAvailable) : "—"}
            color="text-green-400"
          />
          <StatPill
            label="Total Staked"
            value={`${fmtClawd(totalStaked)} CLAWD`}
            sub={usd(totalStaked, clawdPrice)}
            color="text-blue-400"
          />
          <StatPill
            label="Yield Paid"
            value={`${fmtClawd(totalYieldPaid)} CLAWD`}
            sub={usd(totalYieldPaid, clawdPrice)}
            color="text-yellow-400"
          />
          <StatPill
            label="🔥 Burned"
            value={`${fmtClawd(totalBurned)} CLAWD`}
            sub={usd(totalBurned, clawdPrice)}
            color="text-red-500"
          />
          <StatPill
            label="All-time Stakers"
            value={totalStakers !== undefined ? String(totalStakers) : "—"}
            color="text-purple-400"
          />
        </div>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="max-w-xl mx-auto px-4 pt-12 pb-8 text-center">
        {IS_TEST && (
          <div className="mb-4 px-4 py-2 bg-orange-500/20 border border-orange-500/40 rounded-xl text-orange-400 text-sm font-bold">
            🧪 TEST MODE — 100 CLAWD stake · 5 min lock · 1 CLAWD yield
          </div>
        )}
        <div className="text-7xl mb-4">🦞</div>
        <h1 className="text-4xl font-bold mb-2 text-base-content">CLAWD Stake</h1>
        <p className="text-base-content/50 text-base mb-2">
          Lock <span className="text-orange-400 font-bold">{IS_TEST ? "100" : "1,000,000"} CLAWD</span> for{" "}
          {IS_TEST ? "5 minutes" : "1 day"}.
          <br />
          Earn <span className="text-green-400 font-bold">{IS_TEST ? "1" : "10,000"} CLAWD</span> yield.
          <span className="text-red-500 font-bold ml-2">🔥 {IS_TEST ? "1" : "10,000"} burned.</span>
        </p>
        {clawdPrice && (
          <p className="text-base-content/30 text-xs">
            CLAWD ≈ ${clawdPrice.toFixed(6)} · {IS_TEST ? "100" : "1M"} CLAWD ≈ {usd(STAKE_AMOUNT, clawdPrice)}
          </p>
        )}
      </div>

      {/* ── Main Card ─────────────────────────────────────────────── */}
      <div className="max-w-xl mx-auto px-4 pb-16">
        <div className="bg-base-content/5 border border-base-content/10 rounded-2xl p-8 flex flex-col items-center gap-6">
          {/* Active stake display */}
          {hasActivStake && (
            <div className="w-full">
              <div className="flex justify-between text-sm mb-2 text-base-content/60">
                <span>🔒 Locked</span>
                <span>{isLocked ? `${countdownStr} remaining` : "Ready to claim!"}</span>
              </div>
              <div className="w-full bg-base-content/10 rounded-full h-3 overflow-hidden">
                <div
                  className="h-3 rounded-full transition-all duration-1000"
                  style={{
                    width: `${lockProgress}%`,
                    background: isMatured
                      ? "linear-gradient(90deg, #22c55e, #16a34a)"
                      : "linear-gradient(90deg, #f97316, #dc2626)",
                  }}
                />
              </div>
              <div className="flex justify-between text-xs mt-1 text-base-content/30">
                <span>Staked</span>
                <span>{lockProgress}% elapsed</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-center text-sm">
                <div className="bg-base-content/5 rounded-xl p-3">
                  <div className="text-base-content/50 text-xs mb-1">Your stake</div>
                  <div className="font-bold text-base-content">{IS_TEST ? "100" : "1,000,000"} CLAWD</div>
                  {clawdPrice && <div className="text-base-content/30 text-xs">{usd(STAKE_AMOUNT, clawdPrice)}</div>}
                </div>
                <div className="bg-base-content/5 rounded-xl p-3">
                  <div className="text-base-content/50 text-xs mb-1">You&apos;ll receive</div>
                  <div className="font-bold text-green-400">{IS_TEST ? "101" : "1,010,000"} CLAWD</div>
                  {clawdPrice && (
                    <div className="text-base-content/30 text-xs">
                      {usd(parseEther(IS_TEST ? "101" : "1010000"), clawdPrice)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* No stake: show balance */}
          {!hasActivStake && isConnected && (
            <div className="w-full text-center">
              <div className="text-base-content/40 text-sm">Your CLAWD balance</div>
              <div className="text-2xl font-bold text-orange-400">{fmtClawd(clawdBalance)} CLAWD</div>
              {clawdPrice && clawdBalance && (
                <div className="text-base-content/30 text-xs">{usd(clawdBalance, clawdPrice)}</div>
              )}
              {isConnected && !hasEnoughClawd && (
                <div className="text-red-400 text-xs mt-1">
                  ⚠️ Need at least {IS_TEST ? "100" : "1,000,000"} CLAWD to stake
                </div>
              )}
            </div>
          )}

          {/* ── Four-Button Flow ── */}
          <div className="w-full flex justify-center">
            {/* 1. Not connected */}
            {!isConnected && <RainbowKitCustomConnectButton />}

            {/* 2. Wrong network */}
            {isConnected && !isBase && <RainbowKitCustomConnectButton />}

            {/* 3–6. On Base */}
            {isConnected && isBase && (
              <div className="w-full flex flex-col gap-3">
                {/* 3. Approve */}
                {!hasActivStake && !isApproved && hasEnoughClawd && (
                  <button
                    onClick={handleApprove}
                    disabled={isApproving}
                    className="w-full py-4 px-6 rounded-xl font-bold text-lg transition-all
                      bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed
                      text-base-content shadow-lg shadow-orange-500/20"
                  >
                    {isApproving ? (
                      <span className="flex items-center justify-center gap-2">
                        <Spinner /> Approving...
                      </span>
                    ) : (
                      `Approve ${IS_TEST ? "100" : "1,000,000"} CLAWD`
                    )}
                  </button>
                )}

                {/* 4. Stake */}
                {!hasActivStake && (isApproved || !hasEnoughClawd) && (
                  <button
                    onClick={handleStake}
                    disabled={isStaking || !isApproved || !hasEnoughClawd}
                    className="w-full py-4 px-6 rounded-xl font-bold text-lg transition-all
                      bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed
                      text-base-content shadow-lg shadow-red-600/20"
                  >
                    {isStaking ? (
                      <span className="flex items-center justify-center gap-2">
                        <Spinner /> Staking...
                      </span>
                    ) : (
                      `🦞 Stake ${IS_TEST ? "100" : "1,000,000"} CLAWD`
                    )}
                  </button>
                )}

                {/* 5. Locked */}
                {isLocked && (
                  <button
                    disabled
                    className="w-full py-4 px-6 rounded-xl font-bold text-lg
                      bg-base-content/5 text-base-content/40 cursor-not-allowed"
                  >
                    🔒 Locked · {countdownStr}
                  </button>
                )}

                {/* 6. Claim (unstake) */}
                {isMatured && (
                  <button
                    onClick={handleUnstake}
                    disabled={isUnstaking}
                    className="w-full py-4 px-6 rounded-xl font-bold text-lg transition-all
                      bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed
                      text-base-content shadow-lg shadow-green-600/20 animate-pulse"
                  >
                    {isUnstaking ? (
                      <span className="flex items-center justify-center gap-2">
                        <Spinner /> Claiming...
                      </span>
                    ) : (
                      `🎉 Claim ${IS_TEST ? "101" : "1,010,000"} CLAWD`
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Contract address */}
          {stakeContract?.address && (
            <div className="w-full pt-2 border-t border-base-content/10 flex items-center justify-center gap-2 text-xs text-base-content/30">
              <span>Contract:</span>
              <Address address={stakeContract.address} size="xs" />
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="mt-8 bg-base-content/3 border border-white/5 rounded-xl p-6 text-sm text-base-content/50">
          <h3 className="text-base-content/70 font-semibold mb-3">How it works</h3>
          <ol className="space-y-2 list-decimal list-inside">
            <li>
              Approve the contract to spend{" "}
              <span className="text-orange-400">{IS_TEST ? "100" : "1,000,000"} CLAWD</span>
            </li>
            <li>
              Stake — your CLAWD locks for{" "}
              <span className="text-base-content/70">{IS_TEST ? "5 minutes" : "24 hours"}</span>
            </li>
            <li>
              After {IS_TEST ? "5 min" : "24h"}: claim your{" "}
              <span className="text-base-content/70">{IS_TEST ? "100" : "1M"} principal</span> +{" "}
              <span className="text-green-400">{IS_TEST ? "1" : "10K"} CLAWD yield</span>
            </li>
            <li>
              <span className="text-red-400">🔥 {IS_TEST ? "1" : "10,000"} CLAWD is burned</span> from the house reserve
              every unstake
            </li>
          </ol>
          <p className="mt-3 text-base-content/30 text-xs">
            One stake per address. House pre-funds rewards — check &ldquo;Open Slots&rdquo; above before staking.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatPill({ label, value, sub, color }: { label: string; value: string; sub?: string | null; color: string }) {
  return (
    <div className="text-center">
      <div className="text-base-content/30 text-xs mb-0.5">{label}</div>
      <div className={`font-bold ${color}`}>{value}</div>
      {sub && <div className="text-base-content/20 text-xs">{sub}</div>}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
