pragma solidity 0.6.11;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20, SafeMath} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/math/Math.sol";

import {LPTokenWrapper} from "./JointMiner.sol";
import {StorageBuffer} from "./proxy/StorageBuffer.sol";
import {GovernableProxy} from "./proxy/GovernableProxy.sol";

contract StakeDaoDFDMiner is LPTokenWrapper {
    IERC20 public immutable sdt;
    ISDTMaster public immutable masterChef;
    uint256 public immutable pid; // sdt pool id

    uint256 public periodFinish = 0;
    uint256 public rewardRate = 0;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 public sdtPerTokenStored;
    mapping(address => uint256) public sdtPerTokenPaid;
    mapping(address => uint256) public sdtRewards;

    event RewardAdded(uint256 reward);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event SdtPaid(address indexed user, uint256 reward);

    constructor(
        address _dfd,
        address _sdt,
        address _lpToken,
        address _masterChef,
        uint256 _pid
    )
        public
        LPTokenWrapper(_dfd, _lpToken)
    {
        require(
           _dfd != address(0) && _sdt != address(0) && _masterChef != address(0),
           "NULL_ADDRESSES"
        );
        sdt = IERC20(_sdt);
        masterChef = ISDTMaster(_masterChef);
        pid = _pid;
    }

    function _updateReward(address account) override internal {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();

        uint _then = sdt.balanceOf(address(this));
        masterChef.withdraw(pid, 0); // harvests SDT
        sdtPerTokenStored = _sdtPerToken(sdt.balanceOf(address(this)).sub(_then));

        sdtPerTokenStored = sdtPerToken();

        if (account != address(0)) {
            rewards[account] = _earned(account, rewardPerTokenStored);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;

            sdtRewards[account] = _sdtEarned(account, sdtPerTokenStored);
            sdtPerTokenPaid[account] = sdtPerTokenStored;
        }
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return Math.min(block.timestamp, periodFinish);
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalSupply() == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored.add(
                lastTimeRewardApplicable()
                    .sub(lastUpdateTime)
                    .mul(rewardRate)
                    .mul(1e18)
                    .div(totalSupply())
            );
    }

    function sdtPerToken() public view returns (uint256) {
        return _sdtPerToken(masterChef.pendingSdt(pid, address(this)));
    }

    function _sdtPerToken(uint earned_) internal view returns (uint256) {
        uint _totalSupply = totalSupply();
        if (_totalSupply > 0) {
            return sdtPerTokenStored
                .add(
                    earned_
                    .mul(1e18)
                    .div(_totalSupply)
                );
        }
        return sdtPerTokenStored;
    }

    function earned(address account) public view returns (uint256) {
        return _earned(account, rewardPerToken());
    }

    function _earned(address account, uint _rewardPerToken) internal view returns (uint256) {
        return
            balanceOf(account)
                .mul(_rewardPerToken.sub(userRewardPerTokenPaid[account]))
                .div(1e18)
                .add(rewards[account]);
    }

    function sdtEarned(address account) public view returns (uint256) {
        return _sdtEarned(account, sdtPerToken());
    }

    function _sdtEarned(address account, uint256 sdtPerToken_) public view returns (uint256) {
        return
            balanceOf(account)
                .mul(sdtPerToken_.sub(sdtPerTokenPaid[account]))
                .div(1e18)
                .add(sdtRewards[account]);
    }

    // stake visibility is public as overriding LPTokenWrapper's stake() function
    function stake(uint256 amount) override public updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        super.stake(amount);
        lpToken.safeApprove(address(masterChef), amount);
        masterChef.deposit(pid, amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) override public updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");
        masterChef.withdraw(pid, amount); // harvests sdt
        super.withdraw(amount);
        emit Withdrawn(msg.sender, amount);
    }

    function exit() external {
        withdraw(balanceOf(msg.sender));
        getReward();
    }

    function getReward() public updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            dfd.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
        reward = sdtRewards[msg.sender];
        if (reward > 0) {
            if (reward > sdt.balanceOf(address(this))) {
                masterChef.withdraw(pid, 0); // harvests sdt
            }
            sdtRewards[msg.sender] = 0;
            sdt.safeTransfer(msg.sender, reward);
            emit SdtPaid(msg.sender, reward);
        }
    }

    function notifyRewardAmount(uint256 reward, uint256 duration)
        external
        onlyRewardDistribution
        updateReward(address(0))
    {
        dfd.safeTransferFrom(msg.sender, address(this), reward);
        if (block.timestamp >= periodFinish) {
            rewardRate = reward.div(duration);
        } else {
            uint256 remaining = periodFinish.sub(block.timestamp);
            uint256 leftover = remaining.mul(rewardRate);
            rewardRate = reward.add(leftover).div(duration);
        }
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp.add(duration);
        emit RewardAdded(reward);
    }
}

interface ISDTMaster {
    function deposit(uint256 pid, uint256 amount) external;
    function withdraw(uint256 pid, uint256 amount) external;
    function pendingSdt(uint256 pid, address user) external view returns(uint);
}
