// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import "../contracts/ClawdStakeTest.sol";

contract DeployClawdStakeTest is ScaffoldETHDeploy {
    address constant CLAWD_BASE = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

    function run() external ScaffoldEthDeployerRunner {
        ClawdStakeTest testStaking = new ClawdStakeTest(CLAWD_BASE);
        // Owner will loadHouse() after deploy — needs 2 CLAWD for 1 test slot
    }
}
