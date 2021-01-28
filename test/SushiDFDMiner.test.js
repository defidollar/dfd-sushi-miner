const { expect } = require("chai");
const { network } = require("hardhat");
const { BigNumber } = ethers

const _1e18 = ethers.constants.WeiPerEther
const ZERO = BigNumber.from('0')

const dfdEthSushiLpHolder = '0x6595732468a241312bc307f327ba0d64f02b3c20'

describe("SushiDFDMiner", function() {
    before('setup contracts', async function() {
        await network.provider.request({
            method: "hardhat_reset",
            params: [{
                forking: {
                    jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY}`,
                    blockNumber: 11718322 // having a consistent block number speeds up the tests across runs
                }
            }]
        })
        const [ SushiDFDMiner ] = await Promise.all([
            ethers.getContractFactory("SushiDFDMiner"),
        ])
        ;([ dfd, sushi, lpToken, masterChef ] = await Promise.all([
            ethers.getContractAt('IERC20', '0x20c36f062a31865bed8a5b1e512d9a1a20aa333a'),
            ethers.getContractAt('IERC20', '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2'),
            ethers.getContractAt('IERC20', '0xb12aa722a3a4566645f079b6f10c89a3205b6c2c'),
            ethers.getContractAt('IMasterChef', '0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd')
        ]))
        sushiDFDMiner = await SushiDFDMiner.deploy(
            dfd.address,
            sushi.address,
            lpToken.address,
            masterChef.address,
            '0x48' // pid
        )
        await impersonateAccount(dfdEthSushiLpHolder)
        signers = await ethers.getSigners()
        alice = signers[0].address
    })

    it('stake', async function() {
        amount = _1e18.mul(10)
        await lpToken.connect(ethers.provider.getSigner(dfdEthSushiLpHolder)).transfer(alice, amount)

        const masterChefLPBal = await lpToken.balanceOf(masterChef.address)
        expect(await sushiDFDMiner.balanceOf(alice)).to.eq(ZERO)

        await lpToken.approve(sushiDFDMiner.address, amount)
        await sushiDFDMiner.stake(amount)

        expect(await sushiDFDMiner.balanceOf(alice)).to.eq(amount)
        expect(await lpToken.balanceOf(alice)).to.eq(ZERO)
        expect((await lpToken.balanceOf(masterChef.address)).sub(masterChefLPBal)).to.eq(amount)
    })

    it('exit', async function() {
        expect(await sushi.balanceOf(alice)).to.eq(ZERO)
        const masterChefLPBal = await lpToken.balanceOf(masterChef.address)

        await sushiDFDMiner.exit()

        expect((await sushi.balanceOf(alice)).gt(ZERO)).to.be.true
        expect(await sushiDFDMiner.balanceOf(alice)).to.eq(ZERO)
        expect(await lpToken.balanceOf(alice)).to.eq(amount)
        expect(masterChefLPBal.sub(await lpToken.balanceOf(masterChef.address))).to.eq(amount)
    })
})

function impersonateAccount(account) {
    return network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [account],
    })
}
