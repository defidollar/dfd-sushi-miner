const _1e18 = ethers.constants.WeiPerEther

async function main() {
    const notifier = await deployNotifier()
    await notifyRewards(notifier)
}

async function deployNotifier() {
    // const RewardNotifier = await ethers.getContractFactory('RewardNotifier')
    // return RewardNotifier.deploy()
    return ethers.getContractAt('RewardNotifier', '0xd601f69f387f29db3cb071052eff078cec8b56d5')
}

async function notifyRewards(notifier) {
    const weekly = {
        sushiDfdEth: _1e18.mul(85000),
        sushiDusdEth: _1e18.mul(1e5),
        frontRewards: _1e18.mul(25000),
        uniDusdFront: _1e18.mul(15000),
        ibDFD: _1e18.mul(20000),
        total: _1e18.mul(220000)
    }
    const [ dfd, front ] = await Promise.all([
        ethers.getContractAt('IERC20', '0x20c36f062a31865bed8a5b1e512d9a1a20aa333a'),
        ethers.getContractAt('IERC20', '0xf8C3527CC04340b208C854E985240c02F7B7793f'),
    ])
    const [ sushiDfdEth, sushiDusdEth, frontRewards, uniDusdFront, ibDFD ] = await Promise.all([
        ethers.getContractAt('SynthetixRewards', '0x81b53a22D51D6769093bEC1158f134fc6b114F4B'),
        ethers.getContractAt('SynthetixRewards', '0x47744B96f799A61874a3cd73b394B7FEAA6c3E19'),
        ethers.getContractAt('SynthetixRewards', '0xD62F34004Ab3d7857d4031C076225939dDA1AFaE'),
        ethers.getContractAt('SynthetixRewards', '0xe58e035089d40dA258ed750Dc948aD34f939D1ba'),
        ethers.getContractAt('ISynthetixRewardsLegacy', '0xf5f850daddc393ce325d8ac395519224f498460f')
    ])
    await dfd.transfer(notifier.address, weekly.total)
    await front.transfer(notifier.address, weekly.frontRewards)
    await sushiDfdEth.setRewardDistribution(notifier.address, true)
    await sushiDusdEth.setRewardDistribution(notifier.address, true)
    await frontRewards.setRewardDistribution(notifier.address, true)
    await uniDusdFront.setRewardDistribution(notifier.address, true)
    await ibDFD.setRewardDistribution(notifier.address)

    const week = 86400 * 7
    const approval = _1e18.mul(1e8)
    const tasks = [
        {
            target: dfd.address,
            data: dfd.interface.encodeFunctionData('approve', [ sushiDfdEth.address, approval ])
        },
        {
            target: sushiDfdEth.address,
            data: sushiDfdEth.interface.encodeFunctionData('notifyRewardAmount', [ weekly.sushiDfdEth, week ])
        },
        {
            target: dfd.address,
            data: dfd.interface.encodeFunctionData('approve', [ sushiDusdEth.address, approval ])
        },
        {
            target: sushiDusdEth.address,
            data: sushiDusdEth.interface.encodeFunctionData('notifyRewardAmount', [ weekly.sushiDusdEth, week ])
        },
        {
            target: front.address,
            data: front.interface.encodeFunctionData('approve', [ frontRewards.address, approval ])
        },
        {
            target: frontRewards.address,
            data: frontRewards.interface.encodeFunctionData('notifyRewardAmount', [ weekly.frontRewards, week ])
        },
        {
            target: dfd.address,
            data: dfd.interface.encodeFunctionData('approve', [ uniDusdFront.address, approval ])
        },
        {
            target: uniDusdFront.address,
            data: uniDusdFront.interface.encodeFunctionData('notifyRewardAmount', [ weekly.uniDusdFront, week ])
        },
        {
            target: dfd.address,
            data: dfd.interface.encodeFunctionData('approve', [ ibDFD.address, approval ])
        },
        {
            target: ibDFD.address,
            data: ibDFD.interface.encodeFunctionData('notifyRewardAmount', [ weekly.ibDFD ])
        }
    ]
    const targets = [], data = []
    tasks.forEach(t => {
        targets.push(t.target)
        data.push(t.data)
    })
    await notifier.execute(targets, data)
}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
