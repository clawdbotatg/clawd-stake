// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import { DeployClawdStake } from "./DeployClawdStake.s.sol";

contract DeployScript is ScaffoldETHDeploy {
    function run() external {
        DeployClawdStake deployClawdStake = new DeployClawdStake();
        deployClawdStake.run();
    }
}
