const { expect } = require("chai")
const { BigNumber } = require("ethers")

const deployer = '0x08F7506E0381f387e901c9D0552cf4052A0740a4'
const blockNumber = 11919044
const _1e18 = ethers.constants.WeiPerEther
const ZERO = BigNumber.from(0)

describe('RewardNotifier (live)', function() {
    before('setup contracts', async function() {
        await network.provider.request({
            method: "hardhat_reset",
            params: [{
                forking: {
                    jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY}`,
                    blockNumber
                }
            }]
        })
        ;([ dfd, front ] = await Promise.all([
            ethers.getContractAt('IERC20', '0x20c36f062a31865bed8a5b1e512d9a1a20aa333a'),
            ethers.getContractAt('IERC20', '0xf8C3527CC04340b208C854E985240c02F7B7793f'),
        ]))
        weekly = {
            sushiDfdEth: _1e18.mul(85000),
            sushiDusdEth: _1e18.mul(1e5),
            frontRewards: _1e18.mul(25000),
            uniDusdFront: _1e18.mul(15000),
            ibDFD: _1e18.mul(20000),
            balDusdDfd: _1e18.mul(1e5),
            curve: _1e18.mul(1e5),
            total: _1e18.mul(420000)
        }
        ;([ sushiDfdEth, sushiDusdEth, frontRewards, uniDusdFront, balDusdDfd, curve, ibDFD ] = await Promise.all([
            ethers.getContractAt('SynthetixRewards', '0x81b53a22D51D6769093bEC1158f134fc6b114F4B'),
            ethers.getContractAt('SynthetixRewards', '0x47744B96f799A61874a3cd73b394B7FEAA6c3E19'),
            ethers.getContractAt('SynthetixRewards', '0xD62F34004Ab3d7857d4031C076225939dDA1AFaE'),
            ethers.getContractAt('SynthetixRewards', '0xe58e035089d40dA258ed750Dc948aD34f939D1ba'),
            ethers.getContractAt('SynthetixRewards', '0xf068236ecad5fabb9883bbb26a6445d6c7c9a924'),
            ethers.getContractAt('ISynthetixRewardsLegacy', '0xd9Acb0BAeeD77C99305017821167674Cc7e82f7a'),
            ethers.getContractAt('ISynthetixRewardsLegacy', '0xf5f850daddc393ce325d8ac395519224f498460f')
        ]))
        notifier = await ethers.getContractAt('RewardNotifier', '0xd601f69f387f29db3cb071052eff078cec8b56d5')
        signer = ethers.provider.getSigner(deployer)
        await impersonateAccount(deployer)
    })

    it.skip('setup', async function() {
        await Promise.all([
            balDusdDfd.connect(signer).transferOwnership(notifier.address),
            dfd.connect(signer).transfer(notifier.address, weekly.total),
            front.connect(signer).transfer(notifier.address, weekly.frontRewards),
            sushiDfdEth.connect(signer).setRewardDistribution(notifier.address, true),
            sushiDusdEth.connect(signer).setRewardDistribution(notifier.address, true),
            frontRewards.connect(signer).setRewardDistribution(notifier.address, true),
            uniDusdFront.connect(signer).setRewardDistribution(notifier.address, true),
            ibDFD.connect(signer).setRewardDistribution(notifier.address)
        ])
    })

    it('notifyRewardAmount', async function() {
        const week = 86400 * 7
        const approval = _1e18.mul(1e8)
        // await dfd.connect(signer).transfer(notifier.address, weekly.total)
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

        const balances = await Promise.all([
            dfd.balanceOf(balDusdDfd.address),
            dfd.balanceOf(sushiDfdEth.address),
            dfd.balanceOf(sushiDusdEth.address),
            dfd.balanceOf(uniDusdFront.address),
            dfd.balanceOf(ibDFD.address),
            dfd.balanceOf(curve.address),
            front.balanceOf(notifier.address),
            // front.balanceOf(frontRewards.address),
        ])
        await notifier.connect(signer).execute(targets, data)

        expect(
            (await dfd.balanceOf(balDusdDfd.address)).sub(balances[0])
        ).to.eq(weekly.balDusdDfd)
        expect(
            (await dfd.balanceOf(sushiDfdEth.address)).sub(balances[1])
        ).to.eq(weekly.sushiDfdEth)
        expect(
            (await dfd.balanceOf(sushiDusdEth.address)).sub(balances[2])
        ).to.eq(weekly.sushiDusdEth)
        expect(
            (await dfd.balanceOf(uniDusdFront.address)).sub(balances[3])
        ).to.eq(weekly.uniDusdFront)
        expect(
            (await dfd.balanceOf(ibDFD.address)).sub(balances[4])
        ).to.eq(weekly.ibDFD)
        expect(
            (await dfd.balanceOf(curve.address)).sub(balances[5])
        ).to.eq(weekly.curve)
        expect(
            balances[6].sub(await front.balanceOf(notifier.address))
        ).to.eq(weekly.frontRewards)
        expect(await dfd.balanceOf(notifier.address)).to.eq(ZERO)
        // jointMiner calls frontRewards.getRewards(), hence this assertion becomes difficult
        // expect(
        //     (await front.balanceOf(frontRewards.address)).sub(balances[7])
        // ).to.eq(weekly.frontRewards)
    })
})

async function impersonateAccount(account) {
    await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [account],
    })
}
