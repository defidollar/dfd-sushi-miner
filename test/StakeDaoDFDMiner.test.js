const { expect } = require("chai");
const { network } = require("hardhat");
const { BigNumber } = ethers

const _1e18 = ethers.constants.WeiPerEther
const ZERO = BigNumber.from('0')

const lpTokenAddress = '0xc465C0a16228Ef6fE1bF29C04Fdb04bb797fd537' // sdt-eth until sdt-dusd is added
const lpTokenHolder = '0x042e15f7e74f1af6c34170347954d46f707061ec'
const dfdWhale = '0x5522f77c8abb389ce2686accb7deaff2e7c02429'
const pid = '0x4'
const blockNumber = 11775588 // having a consistent block number speeds up the tests across runs

describe('StakeDaoDFDMiner', function() {
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
        const [ StakeDaoDFDMiner ] = await Promise.all([
            ethers.getContractFactory("StakeDaoDFDMiner"),
        ])
        ;([ dfd, sdt, lpToken, masterChef ] = await Promise.all([
            ethers.getContractAt('IERC20', '0x20c36f062a31865bed8a5b1e512d9a1a20aa333a'),
            ethers.getContractAt('IERC20', '0x73968b9a57c6e53d41345fd57a6e6ae27d6cdb2f'),
            ethers.getContractAt('IERC20', lpTokenAddress),
            ethers.getContractAt('IMasterChef', '0xfEA5E213bbD81A8a94D0E1eDB09dBD7CEab61e1c')
        ]))
        sdtDFDMiner = await StakeDaoDFDMiner.deploy(
            dfd.address,
            sdt.address,
            lpToken.address,
            masterChef.address,
            pid
        )
        await impersonateAccount(lpTokenHolder)
        signers = await ethers.getSigners()
        alice = signers[0].address
        await web3.eth.sendTransaction({ to: dfdWhale, value: web3.utils.toWei('1'), from: alice })
    })

    it('stake', async function() {
        amount = _1e18.mul(10)
        await lpToken.connect(ethers.provider.getSigner(lpTokenHolder)).transfer(alice, amount)

        const masterChefLPBal = await lpToken.balanceOf(masterChef.address)
        expect(await sdtDFDMiner.balanceOf(alice)).to.eq(ZERO)

        await lpToken.approve(sdtDFDMiner.address, amount)
        await sdtDFDMiner.stake(amount)

        expect(await sdtDFDMiner.balanceOf(alice)).to.eq(amount)
        expect(await lpToken.balanceOf(alice)).to.eq(ZERO)
        expect((await lpToken.balanceOf(masterChef.address)).sub(masterChefLPBal)).to.eq(amount)
    })

    it('notifyRewardAmount', async function() {
        await sdtDFDMiner.setRewardDistribution(dfdWhale, true)
        const amount = _1e18.mul(1000)
        await impersonateAccount(dfdWhale)
        await dfd.connect(ethers.provider.getSigner(dfdWhale)).approve(sdtDFDMiner.address, amount)
        await sdtDFDMiner.connect(ethers.provider.getSigner(dfdWhale)).notifyRewardAmount(amount, 86400)
        expect(await dfd.balanceOf(sdtDFDMiner.address)).to.eq(amount)
    })

    it('withdraw', async function() {
        const amount = _1e18.mul(3)
        left = _1e18.mul(7)

        const masterChefLPBal = await lpToken.balanceOf(masterChef.address)

        await sdtDFDMiner.withdraw(amount)

        expect(await sdtDFDMiner.balanceOf(alice)).to.eq(left)
        expect(await dfd.balanceOf(alice)).to.eq(ZERO)
        expect(await lpToken.balanceOf(alice)).to.eq(amount)
        expect(masterChefLPBal.sub(await lpToken.balanceOf(masterChef.address))).to.eq(amount)
        expect(await lpToken.balanceOf(sdtDFDMiner.address)).to.eq(ZERO)
    })

    it('exit', async function() {
        await network.provider.request({
            method: "evm_increaseTime",
            params: [ 86400 ],
            id: 0
        })

        expect(await sdt.balanceOf(alice)).to.eq(ZERO)
        const masterChefLPBal = await lpToken.balanceOf(masterChef.address)

        await sdtDFDMiner.exit()

        expect((await sdt.balanceOf(alice)).gt(ZERO)).to.be.true
        expect(parseInt((await dfd.balanceOf(alice)).div(_1e18))).to.eq(999) // rounding-off error gives 999.999
        expect((await dfd.balanceOf(alice)).gt(ZERO)).to.be.true
        expect(await sdtDFDMiner.balanceOf(alice)).to.eq(ZERO)
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
