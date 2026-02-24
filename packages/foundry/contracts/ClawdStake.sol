// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ClawdStake
 * @notice Stake 1M CLAWD for 1 day, earn 1% yield (10K CLAWD).
 *         1% (10K CLAWD) is also burned from the house reserve on each unstake.
 *         House (owner) must pre-load the contract with CLAWD to fund rewards + burns.
 */
contract ClawdStake is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable clawd;

    uint256 public constant STAKE_AMOUNT = 1_000_000 ether; // 1M CLAWD
    uint256 public constant YIELD_AMOUNT = 10_000 ether;    // 1% yield
    uint256 public constant BURN_AMOUNT = 10_000 ether;     // 1% burn
    uint256 public constant LOCK_DURATION = 86400;           // 1 day in seconds
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    struct StakeInfo {
        uint256 stakedAt;
        bool active;
    }

    mapping(address => StakeInfo) public stakes;

    uint256 public houseReserve;     // CLAWD loaded by owner for yield + burns
    uint256 public totalStaked;      // currently staked principal
    uint256 public totalYieldPaid;   // cumulative yield paid out
    uint256 public totalBurned;      // cumulative CLAWD burned
    uint256 public totalStakers;     // all-time stakers count

    event Staked(address indexed user, uint256 unlocksAt);
    event Unstaked(address indexed user, uint256 principal, uint256 yield, uint256 burned);
    event HouseLoaded(address indexed owner, uint256 amount, uint256 newReserve);
    event HouseWithdrawn(address indexed owner, uint256 amount, uint256 newReserve);

    constructor(address _clawd) Ownable(msg.sender) {
        clawd = IERC20(_clawd);
    }

    /// @notice Stake exactly 1M CLAWD for 1 day
    function stake() external {
        require(!stakes[msg.sender].active, "Already staking");
        require(houseReserve >= YIELD_AMOUNT + BURN_AMOUNT, "House reserve too low");

        clawd.safeTransferFrom(msg.sender, address(this), STAKE_AMOUNT);
        stakes[msg.sender] = StakeInfo({ stakedAt: block.timestamp, active: true });

        houseReserve -= (YIELD_AMOUNT + BURN_AMOUNT);
        totalStaked += STAKE_AMOUNT;
        totalStakers++;

        emit Staked(msg.sender, block.timestamp + LOCK_DURATION);
    }

    /// @notice Unstake after lock period — returns principal + yield, burns 10K
    function unstake() external {
        StakeInfo storage info = stakes[msg.sender];
        require(info.active, "No active stake");
        require(block.timestamp >= info.stakedAt + LOCK_DURATION, "Still locked");

        info.active = false;
        totalStaked -= STAKE_AMOUNT;
        totalYieldPaid += YIELD_AMOUNT;
        totalBurned += BURN_AMOUNT;

        // Burn 10K CLAWD
        clawd.safeTransfer(BURN_ADDRESS, BURN_AMOUNT);

        // Return principal + yield to staker
        clawd.safeTransfer(msg.sender, STAKE_AMOUNT + YIELD_AMOUNT);

        emit Unstaked(msg.sender, STAKE_AMOUNT, YIELD_AMOUNT, BURN_AMOUNT);
    }

    /// @notice Owner loads CLAWD to fund future stakes
    function loadHouse(uint256 amount) external onlyOwner {
        clawd.safeTransferFrom(msg.sender, address(this), amount);
        houseReserve += amount;
        emit HouseLoaded(msg.sender, amount, houseReserve);
    }

    /// @notice Owner withdraws excess house reserve
    function withdrawHouse(uint256 amount) external onlyOwner {
        require(amount <= houseReserve, "Exceeds reserve");
        houseReserve -= amount;
        clawd.safeTransfer(msg.sender, amount);
        emit HouseWithdrawn(msg.sender, amount, houseReserve);
    }

    // --- View functions ---

    function getStake(address user) external view returns (StakeInfo memory) {
        return stakes[user];
    }

    function timeUntilUnlock(address user) external view returns (uint256) {
        StakeInfo memory info = stakes[user];
        if (!info.active) return 0;
        uint256 unlockTime = info.stakedAt + LOCK_DURATION;
        if (block.timestamp >= unlockTime) return 0;
        return unlockTime - block.timestamp;
    }

    function canUnstake(address user) external view returns (bool) {
        StakeInfo memory info = stakes[user];
        return info.active && block.timestamp >= info.stakedAt + LOCK_DURATION;
    }

    /// @notice How many stake slots the house can currently fund
    function slotsAvailable() external view returns (uint256) {
        return houseReserve / (YIELD_AMOUNT + BURN_AMOUNT);
    }
}
