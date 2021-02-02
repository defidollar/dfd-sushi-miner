const { expect } = require("chai");
const { network } = require("hardhat");
const { BigNumber } = ethers

const _1e18 = ethers.constants.WeiPerEther
const ZERO = BigNumber.from('0')

const lpTokenAddress = '0xb12aa722a3a4566645f079b6f10c89a3205b6c2c'
const lpTokenHolder = '0x511ed30e9404cbec4bb06280395b74da5f876d47'
const dfdWhale = '0x08F7506E0381f387e901c9D0552cf4052A0740a4'
const blockNumber = 11776974 // having a consistent block number speeds up the tests across runs

describe('Sushi - ETH - DFD (live)', function() {
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
        ;([ dfd, sushi, lpToken, masterChef ] = await Promise.all([
            ethers.getContractAt('IERC20', '0x20c36f062a31865bed8a5b1e512d9a1a20aa333a'),
            ethers.getContractAt('IERC20', '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2'),
            ethers.getContractAt('IERC20', lpTokenAddress),
            ethers.getContractAt('IMasterChef', '0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd')
        ]))
        sushiDFDMiner = await ethers.getContractAt('SushiDFDMiner', '0x81b53a22D51D6769093bEC1158f134fc6b114F4B')
        await impersonateAccount(lpTokenHolder)
        signers = await ethers.getSigners()
        alice = signers[0].address
        await web3.eth.sendTransaction({ to: dfdWhale, value: web3.utils.toWei('1'), from: alice })
    })

    it('stake', async function() {
        amount = _1e18.mul(10)
        await lpToken.connect(ethers.provider.getSigner(lpTokenHolder)).transfer(alice, amount)

        const masterChefLPBal = await lpToken.balanceOf(masterChef.address)
        expect(await sushiDFDMiner.balanceOf(alice)).to.eq(ZERO)

        await lpToken.approve(sushiDFDMiner.address, amount)
        await sushiDFDMiner.stake(amount)

        expect(await sushiDFDMiner.balanceOf(alice)).to.eq(amount)
        expect(await lpToken.balanceOf(alice)).to.eq(ZERO)
        expect((await lpToken.balanceOf(masterChef.address)).sub(masterChefLPBal)).to.eq(amount)
    })

    it('notifyRewardAmount', async function() {
        const amount = _1e18.mul(1000)
        await impersonateAccount(dfdWhale)
        await dfd.connect(ethers.provider.getSigner(dfdWhale)).approve(sushiDFDMiner.address, amount)
        await sushiDFDMiner.connect(ethers.provider.getSigner(dfdWhale)).setRewardDistribution(dfdWhale, true)
        await sushiDFDMiner.connect(ethers.provider.getSigner(dfdWhale)).notifyRewardAmount(amount, 86400)
        expect(await dfd.balanceOf(sushiDFDMiner.address)).to.eq(amount)
    })

    it('withdraw', async function() {
        const amount = _1e18.mul(3)
        left = _1e18.mul(7)

        const masterChefLPBal = await lpToken.balanceOf(masterChef.address)

        await sushiDFDMiner.withdraw(amount)

        expect(await sushiDFDMiner.balanceOf(alice)).to.eq(left)
        expect(await dfd.balanceOf(alice)).to.eq(ZERO)
        expect(await lpToken.balanceOf(alice)).to.eq(amount)
        expect(masterChefLPBal.sub(await lpToken.balanceOf(masterChef.address))).to.eq(amount)
        expect(await lpToken.balanceOf(sushiDFDMiner.address)).to.eq(ZERO)
    })

    it('exit', async function() {
        await network.provider.request({
            method: "evm_increaseTime",
            params: [ 86400 ],
            id: 0
        })

        expect(await sushi.balanceOf(alice)).to.eq(ZERO)
        const masterChefLPBal = await lpToken.balanceOf(masterChef.address)

        await sushiDFDMiner.exit()

        expect((await sushi.balanceOf(alice)).gt(ZERO)).to.be.true
        expect(parseInt((await dfd.balanceOf(alice)).div(_1e18))).to.eq(999) // rounding-off error gives 999.999
        expect((await dfd.balanceOf(alice)).gt(ZERO)).to.be.true
        expect(await sushiDFDMiner.balanceOf(alice)).to.eq(ZERO)
        expect(await lpToken.balanceOf(alice)).to.eq(amount)
        expect(masterChefLPBal.sub(await lpToken.balanceOf(masterChef.address))).to.eq(left)
    })
})

function impersonateAccount(account) {
    return network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [account],
    })
}
