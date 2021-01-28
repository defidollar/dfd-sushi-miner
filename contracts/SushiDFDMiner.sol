pragma solidity 0.6.11;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20, SafeMath} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/math/Math.sol";

import "hardhat/console.sol"; // @todo remove

abstract contract IRewardDistributionRecipient is Ownable {
    address public rewardDistribution;

    function notifyRewardAmount(uint256 reward, uint256 duration) virtual external;

    modifier onlyRewardDistribution() {
        require(_msgSender() == rewardDistribution, "Caller is not reward distribution");
        _;
    }

    function setRewardDistribution(address _rewardDistribution)
        external
        onlyOwner
    {
        rewardDistribution = _rewardDistribution;
    }
}

contract LPTokenWrapper {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IERC20 public immutable uni;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    constructor(address lpToken) public {
        require(lpToken != address(0), "NULL_ADDRESSES");
        uni = IERC20(lpToken);
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function stake(uint256 amount) virtual public {
        _totalSupply = _totalSupply.add(amount);
        _balances[msg.sender] = _balances[msg.sender].add(amount);
        uni.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) virtual public {
        _totalSupply = _totalSupply.sub(amount);
        _balances[msg.sender] = _balances[msg.sender].sub(amount);
        uni.safeTransfer(msg.sender, amount);
    }
}

contract SushiDFDMiner is LPTokenWrapper, IRewardDistributionRecipient {
    IERC20 public immutable dfd;
    IERC20 public immutable sushi;
    IMasterChef public immutable masterChef;
    uint256 public immutable pid; // sushi pool id

    uint256 public periodFinish = 0;
    uint256 public rewardRate = 0;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 public sushiPerTokenStored;
    mapping(address => uint256) public sushiPerTokenPaid;
    mapping(address => uint256) public sushiRewards;

    event RewardAdded(uint256 reward);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event SushiPaid(address indexed user, uint256 reward);

    constructor(
        address _dfd,
        address _sushi,
        address lpToken,
        address _masterChef,
        uint256 _pid
    )
        public
        LPTokenWrapper(lpToken)
    {
        require(
           _dfd != address(0) && _sushi != address(0) && _masterChef != address(0),
           "NULL_ADDRESSES"
        );
        dfd = IERC20(_dfd);
        sushi = IERC20(_sushi);
        masterChef = IMasterChef(_masterChef);
        pid = _pid;
        // IERC20(lpToken).safeApprove(_masterChef, 2^256 - 1);
        IERC20(lpToken).safeApprove(_masterChef, uint(-1));
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        sushiPerTokenStored = sushiPerToken();
        if (account != address(0)) {
            rewards[account] = _earned(account, rewardPerTokenStored);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;

            sushiRewards[account] = _sushiEarned(account, sushiPerTokenStored);
            sushiPerTokenPaid[account] = sushiPerTokenStored;
        }
        _;
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

    function sushiPerToken() public view returns (uint256) {
        uint _totalSupply = totalSupply();
        if (_totalSupply > 0) {
            return sushiPerTokenStored
                .add(
                    masterChef.pendingSushi(pid, address(this))
                    .mul(1e18)
                    .div(_totalSupply)
                );
        }
        return sushiPerTokenStored;
    }

    function sushiEarned(address account) public view returns (uint256) {
        return _sushiEarned(account, sushiPerToken());
    }

    function _sushiEarned(address account, uint256 _sushiPerToken) public view returns (uint256) {
        return
            balanceOf(account)
                .mul(_sushiPerToken.sub(sushiPerTokenPaid[account]))
                .div(1e18)
                .add(sushiRewards[account]);
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

    // stake visibility is public as overriding LPTokenWrapper's stake() function
    function stake(uint256 amount) override public updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        super.stake(amount);
        masterChef.deposit(pid, amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) override public updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");
        masterChef.withdraw(pid, amount); // harvests sushi
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
        reward = sushiRewards[msg.sender];
        if (reward > 0) {
            if (reward > sushi.balanceOf(address(this))) {
                masterChef.withdraw(pid, 0); // harvests sushi
            }
            sushiRewards[msg.sender] = 0;
            sushi.safeTransfer(msg.sender, reward);
            emit SushiPaid(msg.sender, reward);
        }
    }

    function notifyRewardAmount(uint256 reward, uint256 duration)
        override
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

interface IMasterChef {
    function deposit(uint256 pid, uint256 amount) external;
    function withdraw(uint256 pid, uint256 amount) external;
    function pendingSushi(uint256 pid, address user) external view returns(uint);
}
