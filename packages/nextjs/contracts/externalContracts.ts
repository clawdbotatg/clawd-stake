import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

/**
 * External contracts used by this dApp.
 * CLAWD token on Base — needed for approve flow.
 */
const externalContracts = {
  8453: {
    CLAWD: {
      address: "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07",
      abi: [
        {
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          name: "approve",
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
        {
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          name: "allowance",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
        {
          inputs: [{ name: "account", type: "address" }],
          name: "balanceOf",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
    },
  },
} as const;

export default externalContracts satisfies GenericContractsDeclaration;
