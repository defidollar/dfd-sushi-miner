const { expect } = require("chai");
const { network } = require("hardhat");
const { BigNumber } = ethers

const _1e18 = ethers.constants.WeiPerEther
const ZERO = BigNumber.from(0)

const frontDusdLPHolder = '0xaa3d85ad9d128dfecb55424085754f6dfa643eb1'
const frontWhale = '0x08F7506E0381f387e901c9D0552cf4052A0740a4' // deployer
const dfdWhale = '0x08F7506E0381f387e901c9D0552cf4052A0740a4' // deployer

describe('JointMiner (live)', function() {
    before('setup contracts', async function() {
        await network.provider.request({
            method: "hardhat_reset",
            params: [{
                forking: {
                    jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY}`,
                    blockNumber: 11776974 // having a consistent block number speeds up the tests across runs
                }
            }]
        })
        ;([ dfd, front, lpToken ] = await Promise.all([
            ethers.getContractAt('IERC20', '0x20c36f062a31865bed8a5b1e512d9a1a20aa333a'),
            ethers.getContractAt('IERC20', '0xf8C3527CC04340b208C854E985240c02F7B7793f'),
            ethers.getContractAt('IERC20', '0xAEB0d09B99BEf36256601601BC2e47C938f63ee3'),
        ]))
        frontRewards = await ethers.getContractAt('SynthetixRewards', '0xd62f34004ab3d7857d4031c076225939dda1afae')
        jointMiner = await ethers.getContractAt('JointMiner', '0xe58e035089d40dA258ed750Dc948aD34f939D1ba')

        signers = await ethers.getSigners()
        alice = signers[0].address
    })

    it('frontRewards.notifyRewardAmount', async function() {
        const amount = _1e18.mul(1000)
        await impersonateAccount(frontWhale)
        await frontRewards.connect(ethers.provider.getSigner(frontWhale)).setRewardDistribution(frontWhale, true)
        await front.connect(ethers.provider.getSigner(frontWhale)).approve(frontRewards.address, amount)
        await frontRewards.connect(ethers.provider.getSigner(frontWhale)).notifyRewardAmount(amount, 86400)
        expect(await front.balanceOf(frontRewards.address)).to.eq(amount)
    })

    it('jointMiner.notifyRewardAmount', async function() {
        const amount = _1e18.mul(1000)
        await impersonateAccount(dfdWhale)
        await jointMiner.connect(ethers.provider.getSigner(dfdWhale)).setRewardDistribution(dfdWhale, true)
        await dfd.connect(ethers.provider.getSigner(dfdWhale)).approve(jointMiner.address, amount)
        await jointMiner.connect(ethers.provider.getSigner(dfdWhale)).notifyRewardAmount(amount, 86400)
        expect(await dfd.balanceOf(jointMiner.address)).to.eq(amount)
    })

    it('stake', async function() {
        amount = _1e18.mul(10)
        await impersonateAccount(frontDusdLPHolder)
        await lpToken.connect(ethers.provider.getSigner(frontDusdLPHolder)).transfer(alice, amount)

        await lpToken.approve(jointMiner.address, amount)
        await jointMiner.stake(amount)

        expect(await jointMiner.balanceOf(alice)).to.eq(amount)
        expect(await lpToken.balanceOf(alice)).to.eq(ZERO)
        expect(await lpToken.balanceOf(frontRewards.address)).to.eq(amount)
        expect(await lpToken.balanceOf(jointMiner.address)).to.eq(ZERO)
    })

    it('withdraw', async function() {
        const amount = _1e18.mul(3)
        const left = _1e18.mul(7)

        await jointMiner.withdraw(amount)

        expect(await jointMiner.balanceOf(alice)).to.eq(left)
        expect(await lpToken.balanceOf(alice)).to.eq(amount)
        expect(await lpToken.balanceOf(frontRewards.address)).to.eq(left)
        expect(await lpToken.balanceOf(jointMiner.address)).to.eq(ZERO)
    })

    it('exit', async function() {
        expect(await front.balanceOf(alice)).to.eq(ZERO)
        expect(await dfd.balanceOf(alice)).to.eq(ZERO)

        await jointMiner.exit()

        expect((await front.balanceOf(alice)).gt(ZERO)).to.be.true
        expect((await dfd.balanceOf(alice)).gt(ZERO)).to.be.true
        expect(await jointMiner.balanceOf(alice)).to.eq(ZERO)
        expect(await lpToken.balanceOf(alice)).to.eq(amount)
        expect(await lpToken.balanceOf(jointMiner.address)).to.eq(ZERO)
        expect(await lpToken.balanceOf(frontRewards.address)).to.eq(ZERO)
    })
})

function impersonateAccount(account) {
    return network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ account ]
    })
}
