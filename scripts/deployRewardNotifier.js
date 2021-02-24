const _1e18 = ethers.constants.WeiPerEther

async function main() {
    const notifier = await deployNotifier()
    await notifyRewards(notifier)
}

async function deployNotifier() {
    return ethers.getContractAt('RewardNotifier', '0xd601f69f387f29db3cb071052eff078cec8b56d5')
}

async function notifyRewards(notifier) {
    const weekly = {
        sushiDfdEth: _1e18.mul(85000),
        sushiDusdEth: _1e18.mul(1e5),
        frontRewards: _1e18.mul(25000),
        uniDusdFront: _1e18.mul(15000),
        ibDFD: _1e18.mul(20000),
        balDusdDfd: _1e18.mul(1e5),
        curve: _1e18.mul(1e5)
    }
    const [ sushiDfdEth, sushiDusdEth, frontRewards, uniDusdFront, balDusdDfd, curve, ibDFD ] = await Promise.all([
        ethers.getContractAt('SynthetixRewards', '0x81b53a22D51D6769093bEC1158f134fc6b114F4B'),
        ethers.getContractAt('SynthetixRewards', '0x47744B96f799A61874a3cd73b394B7FEAA6c3E19'),
        ethers.getContractAt('SynthetixRewards', '0xD62F34004Ab3d7857d4031C076225939dDA1AFaE'),
        ethers.getContractAt('SynthetixRewards', '0xe58e035089d40dA258ed750Dc948aD34f939D1ba'),
        ethers.getContractAt('SynthetixRewards', '0xf068236ecad5fabb9883bbb26a6445d6c7c9a924'),
        ethers.getContractAt('ISynthetixRewardsLegacy', '0xd9Acb0BAeeD77C99305017821167674Cc7e82f7a'),
        ethers.getContractAt('ISynthetixRewardsLegacy', '0xf5f850daddc393ce325d8ac395519224f498460f')
    ])

    const week = 86400 * 7
    const tasks = [
        {
            target: balDusdDfd.address,
            data: balDusdDfd.interface.encodeFunctionData('notifyRewardAmount', [ weekly.balDusdDfd, week ])
        },
        {
            target: sushiDfdEth.address,
            data: sushiDfdEth.interface.encodeFunctionData('notifyRewardAmount', [ weekly.sushiDfdEth, week ])
        },
        {
            target: sushiDusdEth.address,
            data: sushiDusdEth.interface.encodeFunctionData('notifyRewardAmount', [ weekly.sushiDusdEth, week ])
        },
        {
            target: frontRewards.address,
            data: frontRewards.interface.encodeFunctionData('notifyRewardAmount', [ weekly.frontRewards, week ])
        },
        {
            target: uniDusdFront.address,
            data: uniDusdFront.interface.encodeFunctionData('notifyRewardAmount', [ weekly.uniDusdFront, week ])
        },
        {
            target: curve.address,
            data: curve.interface.encodeFunctionData('notifyRewardAmount', [ weekly.curve ])
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
    console.log(notifier.interface.encodeFunctionData('execute', [ targets, data ]))
    await notifier.execute(targets, data)
}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
