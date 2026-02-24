// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/ClawdStake.sol";
import "../contracts/MockERC20.sol";

contract ClawdStakeTest is Test {
    ClawdStake public staking;
    MockERC20 public clawd;

    address public owner = address(this);
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public carol = makeAddr("carol");

    uint256 constant STAKE_AMOUNT = 1_000_000 ether;
    uint256 constant YIELD_AMOUNT = 10_000 ether;
    uint256 constant BURN_AMOUNT = 10_000 ether;
    uint256 constant LOCK_DURATION = 86400;
    address constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    function setUp() public {
        clawd = new MockERC20("CLAWD", "CLAWD", 18);
        staking = new ClawdStake(address(clawd));

        clawd.mint(owner, 100_000_000 ether);
        clawd.mint(alice, 10_000_000 ether);
        clawd.mint(bob, 10_000_000 ether);
        clawd.mint(carol, 10_000_000 ether);

        clawd.approve(address(staking), 2_000_000 ether);
        staking.loadHouse(2_000_000 ether);
    }

    // ============ Deployment ============

    function test_DeployOk() public view {
        assertEq(address(staking.clawd()), address(clawd));
        assertEq(staking.houseReserve(), 2_000_000 ether);
        assertEq(staking.totalStaked(), 0);
        assertEq(staking.slotsAvailable(), 100);
    }

    // ============ loadHouse ============

    function test_LoadHouse() public {
        uint256 before = staking.houseReserve();
        clawd.approve(address(staking), 200_000 ether);
        staking.loadHouse(200_000 ether);
        assertEq(staking.houseReserve(), before + 200_000 ether);
    }

    function test_CannotLoadHouseAsNonOwner() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), 100_000 ether);
        vm.expectRevert();
        staking.loadHouse(100_000 ether);
        vm.stopPrank();
    }

    // ============ withdrawHouse ============

    function test_WithdrawHouse() public {
        uint256 before = staking.houseReserve();
        staking.withdrawHouse(20_000 ether);
        assertEq(staking.houseReserve(), before - 20_000 ether);
    }

    function test_CannotWithdrawMoreThanReserve() public {
        uint256 tooMuch = staking.houseReserve() + 1;
        vm.expectRevert(bytes("Exceeds reserve"));
        staking.withdrawHouse(tooMuch);
    }

    function test_CannotWithdrawHouseAsNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        staking.withdrawHouse(1 ether);
    }

    // ============ stake ============

    function test_StakeSuccess() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        ClawdStake.StakeInfo memory info = staking.getStake(alice);
        assertTrue(info.active);
        assertApproxEqAbs(info.stakedAt, block.timestamp, 1);
        assertEq(staking.totalStaked(), STAKE_AMOUNT);
        assertEq(staking.totalStakers(), 1);
        assertEq(staking.activeStakers(), 1);
    }

    function test_StakeDecrementsHouseReserve() public {
        uint256 before = staking.houseReserve();
        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();
        assertEq(staking.houseReserve(), before - (YIELD_AMOUNT + BURN_AMOUNT));
    }

    function test_CannotStakeTwice() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT * 2);
        staking.stake();
        vm.expectRevert("Already staking");
        staking.stake();
        vm.stopPrank();
    }

    function test_CannotStakeInsufficientHouse() public {
        uint256 reserve = staking.houseReserve();
        staking.withdrawHouse(reserve - 19_999 ether);

        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        vm.expectRevert("House reserve too low");
        staking.stake();
        vm.stopPrank();
    }

    // ============ Issue #1: Balance accounting ============

    function test_TotalAccountedBalanceMatchesReal() public {
        // Before any stakes
        assertEq(staking.totalAccountedBalance(), clawd.balanceOf(address(staking)));

        // After stake
        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        assertEq(staking.totalAccountedBalance(), clawd.balanceOf(address(staking)));

        // After unstake
        vm.warp(block.timestamp + LOCK_DURATION);
        vm.prank(alice);
        staking.unstake();

        assertEq(staking.totalAccountedBalance(), clawd.balanceOf(address(staking)));
    }

    function test_TotalCommittedTracking() public {
        assertEq(staking.totalCommitted(), 0);

        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        assertEq(staking.totalCommitted(), YIELD_AMOUNT + BURN_AMOUNT);

        vm.warp(block.timestamp + LOCK_DURATION);
        vm.prank(alice);
        staking.unstake();

        assertEq(staking.totalCommitted(), 0);
    }

    // ============ Issue #2: Unique stakers ============

    function test_TotalStakersCountsUniqueAddresses() public {
        // Alice stakes, unstakes, stakes again
        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.warp(block.timestamp + LOCK_DURATION);
        staking.unstake();

        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.warp(block.timestamp + LOCK_DURATION);
        staking.unstake();
        vm.stopPrank();

        // Bob stakes once
        vm.startPrank(bob);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        // Should be 2 unique stakers, not 3 events
        assertEq(staking.totalStakers(), 2);
    }

    // ============ Issue #3: stakedAt reset ============

    function test_StakedAtResetOnUnstake() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        vm.warp(block.timestamp + LOCK_DURATION);
        vm.prank(alice);
        staking.unstake();

        ClawdStake.StakeInfo memory info = staking.getStake(alice);
        assertFalse(info.active);
        assertEq(info.stakedAt, 0);
    }

    // ============ Issue #4: Abandoned stake reclaim ============

    function test_ReclaimAbandoned() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        uint256 reserveBefore = staking.houseReserve();

        // Can't reclaim too early (only 1 day past lock)
        vm.warp(block.timestamp + LOCK_DURATION + 1 days);
        vm.expectRevert("Too early to reclaim");
        staking.reclaimAbandoned(alice);

        // After 30 days past unlock, owner can reclaim
        vm.warp(block.timestamp + 30 days);
        staking.reclaimAbandoned(alice);

        ClawdStake.StakeInfo memory info = staking.getStake(alice);
        assertFalse(info.active);
        assertEq(info.stakedAt, 0);
        // Reserve gets back principal + committed funds
        assertEq(staking.houseReserve(), reserveBefore + STAKE_AMOUNT + YIELD_AMOUNT + BURN_AMOUNT);
        assertEq(staking.activeStakers(), 0);
        assertEq(staking.totalStaked(), 0);
        assertEq(staking.totalCommitted(), 0);
    }

    function test_CannotReclaimAsNonOwner() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        vm.warp(block.timestamp + LOCK_DURATION + 31 days);

        vm.prank(bob);
        vm.expectRevert();
        staking.reclaimAbandoned(alice);
    }

    function test_CannotReclaimActiveUser() public {
        // User who hasn't staked
        vm.expectRevert("No active stake");
        staking.reclaimAbandoned(alice);
    }

    // ============ activeStakers ============

    function test_ActiveStakersTracking() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        vm.startPrank(bob);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        assertEq(staking.activeStakers(), 2);

        vm.warp(block.timestamp + LOCK_DURATION);
        vm.prank(alice);
        staking.unstake();

        assertEq(staking.activeStakers(), 1);
    }

    // ============ unstake ============

    function test_CannotUnstakeEarly() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.expectRevert("Still locked");
        staking.unstake();
        vm.stopPrank();
    }

    function test_CannotUnstakeWithNoStake() public {
        vm.prank(alice);
        vm.expectRevert("No active stake");
        staking.unstake();
    }

    function test_UnstakeAfterDay() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        vm.warp(block.timestamp + LOCK_DURATION);

        vm.prank(alice);
        staking.unstake();

        ClawdStake.StakeInfo memory info = staking.getStake(alice);
        assertFalse(info.active);
        assertEq(staking.totalStaked(), 0);
    }

    function test_UnstakeYieldCorrect() public {
        uint256 aliceBalBefore = clawd.balanceOf(alice);

        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        vm.warp(block.timestamp + LOCK_DURATION);
        vm.prank(alice);
        staking.unstake();

        uint256 aliceBalAfter = clawd.balanceOf(alice);
        assertEq(aliceBalAfter - aliceBalBefore, YIELD_AMOUNT);
    }

    function test_UnstakeBurnCorrect() public {
        uint256 deadBefore = clawd.balanceOf(BURN_ADDRESS);

        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        vm.warp(block.timestamp + LOCK_DURATION);
        vm.prank(alice);
        staking.unstake();

        assertEq(clawd.balanceOf(BURN_ADDRESS) - deadBefore, BURN_AMOUNT);
    }

    function test_StatsAfterUnstake() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        vm.warp(block.timestamp + LOCK_DURATION);
        vm.prank(alice);
        staking.unstake();

        assertEq(staking.totalYieldPaid(), YIELD_AMOUNT);
        assertEq(staking.totalBurned(), BURN_AMOUNT);
        assertEq(staking.totalStaked(), 0);
    }

    // ============ View functions ============

    function test_SlotsAvailable() public view {
        assertEq(staking.slotsAvailable(), 100);
    }

    function test_TimeUntilUnlock() public {
        assertEq(staking.timeUntilUnlock(alice), 0);

        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        uint256 remaining = staking.timeUntilUnlock(alice);
        assertApproxEqAbs(remaining, LOCK_DURATION, 2);
    }

    function test_CanUnstake() public {
        assertFalse(staking.canUnstake(alice));

        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        assertFalse(staking.canUnstake(alice));

        vm.warp(block.timestamp + LOCK_DURATION);
        assertTrue(staking.canUnstake(alice));
    }

    // ============ Multi-user ============

    function test_MultipleStakers() public {
        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        vm.startPrank(bob);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        vm.startPrank(carol);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        assertEq(staking.totalStakers(), 3);
        assertEq(staking.totalStaked(), 3 * STAKE_AMOUNT);

        vm.warp(block.timestamp + LOCK_DURATION);

        uint256 deadBefore = clawd.balanceOf(BURN_ADDRESS);

        vm.prank(alice); staking.unstake();
        vm.prank(bob); staking.unstake();
        vm.prank(carol); staking.unstake();

        assertEq(staking.totalYieldPaid(), 3 * YIELD_AMOUNT);
        assertEq(clawd.balanceOf(BURN_ADDRESS) - deadBefore, 3 * BURN_AMOUNT);
        assertEq(staking.totalStaked(), 0);
    }

    // ============ Fuzz ============

    function testFuzz_StakeUnstakeYield(uint256 warpTime) public {
        vm.assume(warpTime >= LOCK_DURATION && warpTime <= 365 days);

        uint256 aliceBalBefore = clawd.balanceOf(alice);

        vm.startPrank(alice);
        clawd.approve(address(staking), STAKE_AMOUNT);
        staking.stake();
        vm.stopPrank();

        vm.warp(block.timestamp + warpTime);

        vm.prank(alice);
        staking.unstake();

        assertEq(clawd.balanceOf(alice) - aliceBalBefore, YIELD_AMOUNT);
    }
}
