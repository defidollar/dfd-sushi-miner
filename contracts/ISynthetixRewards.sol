pragma solidity 0.6.11;

interface ISynthetixRewards {
    function stake(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function getReward() external;
    function notifyRewardAmount(uint256 reward, uint256 duration) external;
    function earned(address account) external view returns (uint256);
}

interface ISynthetixRewardsLegacy {
    function notifyRewardAmount(uint256 reward) external;
    function setRewardDistribution(address account) external;
}
