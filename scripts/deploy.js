const dfd = '0x20c36f062a31865bed8a5b1e512d9a1a20aa333a'
const front = '0xf8C3527CC04340b208C854E985240c02F7B7793f'
const sushi = '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2'

const frontDusdUniLp = '0xaeb0d09b99bef36256601601bc2e47c938f63ee3'

const masterChef = '0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd'
const dfdEthSushiLp = '0xb12aa722a3a4566645f079b6f10c89a3205b6c2c'
const dusdEthSushiLp = '0xb1d38026062ac10feda072ca0e9b7e35f1f5795a'

async function main() {
    await deployFrontJointMiner()
    await deploySushiJoinMiner(dfdEthSushiLp, '0x48')
    await deploySushiJoinMiner(dusdEthSushiLp, '0x63')
}

async function deployFrontJointMiner() {
    const [ FrontRewards, JointMiner, UpgradableProxy ] = await Promise.all([
        ethers.getContractFactory("SynthetixRewards"),
        ethers.getContractFactory("JointMiner"),
        ethers.getContractFactory("UpgradableProxy")
    ])
    const frontRewards = await FrontRewards.deploy(front, frontDusdUniLp)
    const jointMiner = await UpgradableProxy.deploy()
    let _jointMiner = await JointMiner.deploy(dfd, front, frontRewards.address, frontDusdUniLp)
    await jointMiner.updateImplementation(_jointMiner.address)
}

async function deploySushiJoinMiner(lpToken, pid) {
    const [ SushiDFDMiner, UpgradableProxy ] = await Promise.all([
        ethers.getContractFactory("SushiDFDMiner"),
        ethers.getContractFactory("UpgradableProxy")
    ])
    const sushiDFDMiner = await UpgradableProxy.deploy()
    const sushiDFDMiner_ = await SushiDFDMiner.deploy(dfd, sushi, lpToken, masterChef, pid)
    await sushiDFDMiner.updateImplementation(sushiDFDMiner_.address)
}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
