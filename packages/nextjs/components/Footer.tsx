import React from "react";
import { hardhat } from "viem/chains";
import { Faucet } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

/**
 * Site footer — CLAWD Stake
 */
export const Footer = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  return (
    <div className="min-h-0 py-5 px-1 mb-11 lg:mb-0">
      <div className="fixed flex justify-between items-center w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
        <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">{isLocalNetwork && <Faucet />}</div>
        {/* Theme toggle removed — dark-only app */}
      </div>
      <div className="w-full">
        <div className="flex justify-center items-center gap-2 text-sm text-base-content/50 py-2">
          <a
            href="https://github.com/clawdbotatg/clawd-stake"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            🦞 clawd-stake
          </a>
          <span>·</span>
          <a
            href="https://basescan.org/token/0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            $CLAWD on Base
          </a>
        </div>
      </div>
    </div>
  );
};
