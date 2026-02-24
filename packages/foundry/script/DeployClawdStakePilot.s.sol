// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/ClawdStakePilot.sol";

contract DeployClawdStakePilot is Script {
    address constant CLAWD_BASE = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

    function run() external {
        vm.startBroadcast();
        ClawdStakePilot pilot = new ClawdStakePilot(CLAWD_BASE);
        console.log("ClawdStakePilot deployed at:", address(pilot));
        vm.stopBroadcast();
    }
}
