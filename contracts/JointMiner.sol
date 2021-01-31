pragma solidity 0.6.11;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20, SafeMath} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/math/Math.sol";

import {ISynthetixRewards} from "./ISynthetixRewards.sol";

import "hardhat/console.sol"; // @todo remove

contract LPTokenWrapper {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IERC20 public immutable uni;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    constructor(address lpToken) public {
        require(lpToken != address(0), "NULL_ADDRESS");
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

contract JointMiner is LPTokenWrapper, Ownable {
    IERC20 public immutable dfd;
    IERC20 public immutable front;
    ISynthetixRewards public immutable snxRewards;

    uint256 public periodFinish = 0;
    uint256 public rewardRate = 0;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 public frontPerTokenStored;
    mapping(address => uint256) public frontPerTokenPaid;
    mapping(address => uint256) public frontRewards;

    mapping(address => bool) public rewardDistribution;

    event RewardAdded(uint256 reward);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event FrontPaid(address indexed user, uint256 reward);

    constructor(
        address _dfd,
        address _front,
        address _snxRewards,
        address lpToken
    )
        public
        LPTokenWrapper(lpToken)
    {
        require(
           _dfd != address(0) && _front != address(0) && _snxRewards != address(0),
           "NULL_ADDRESSES"
        );
        dfd = IERC20(_dfd);
        front = IERC20(_front);
        snxRewards = ISynthetixRewards(_snxRewards);
        IERC20(lpToken).safeApprove(_snxRewards, uint(-1));
    }

    modifier onlyRewardDistribution() {
        require(rewardDistribution[_msgSender()], "Caller is not reward distribution");
        _;
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();

        uint _then = front.balanceOf(address(this));
        snxRewards.getReward();
        frontPerTokenStored = _frontPerToken(front.balanceOf(address(this)).sub(_then));

        if (account != address(0)) {
            rewards[account] = _earned(account, rewardPerTokenStored);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;

            frontRewards[account] = _frontEarned(account, frontPerTokenStored);
            frontPerTokenPaid[account] = frontPerTokenStored;
        }
        _;
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return Math.min(block.timestamp, periodFinish);
    }

    function rewardPerToken() public view returns (uint256) {
        uint _totalSupply = totalSupply();
        if (_totalSupply > 0) {
            return rewardPerTokenStored.add(
                lastTimeRewardApplicable()
                    .sub(lastUpdateTime)
                    .mul(rewardRate)
                    .mul(1e18)
                    .div(_totalSupply)
            );
        }
        return rewardPerTokenStored;
    }

    function frontPerToken() public view returns (uint256) {
        return _frontPerToken(snxRewards.earned(address(this)));
    }

    function _frontPerToken(uint _frontEarned) internal view returns (uint256) {
        uint _totalSupply = totalSupply();
        if (_totalSupply > 0) {
            return frontPerTokenStored
                .add(
                    _frontEarned
                    .mul(1e18)
                    .div(_totalSupply)
                );
        }
        return frontPerTokenStored;
    }

    function frontEarned(address account) public view returns (uint256) {
        return _frontEarned(account, frontPerToken());
    }

    function _frontEarned(address account, uint256 frontPerToken_) public view returns (uint256) {
        return
            balanceOf(account)
                .mul(frontPerToken_.sub(frontPerTokenPaid[account]))
                .div(1e18)
                .add(frontRewards[account]);
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
        snxRewards.stake(amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) override public updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");
        snxRewards.withdraw(amount);
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
        reward = frontRewards[msg.sender];
        if (reward > 0) {
            frontRewards[msg.sender] = 0;
            front.safeTransfer(msg.sender, reward);
            emit FrontPaid(msg.sender, reward);
        }
    }

    function setRewardDistribution(address _account, bool _status)
        external
        onlyOwner
    {
        rewardDistribution[_account] = _status;
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
