// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import "../contracts/ClawdStake.sol";
import "../contracts/MockERC20.sol";

contract DeployClawdStake is ScaffoldETHDeploy {
    address constant CLAWD_BASE = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

    function run() external ScaffoldEthDeployerRunner {
        if (block.chainid == 8453) {
            // Base mainnet — use real CLAWD token
            new ClawdStake(CLAWD_BASE);
            // Owner will call loadHouse() after deployment via Basescan or multisig
        } else {
            // Local Anvil — deploy mock CLAWD and pre-fund house for testing
            MockERC20 mock = new MockERC20("CLAWD", "CLAWD", 18);

            ClawdStake staking = new ClawdStake(address(mock));

            // Mint 100M mock CLAWD to deployer
            mock.mint(deployer, 100_000_000 ether);

            // Load house with 2M CLAWD (100 stake slots)
            mock.approve(address(staking), 2_000_000 ether);
            staking.loadHouse(2_000_000 ether);
        }
    }
}
