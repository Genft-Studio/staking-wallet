const {waffle: {deployMockContract}} = require("hardhat")
const IERC721 = require("../artifacts/@openzeppelin/contracts/token/ERC721/IERC721.sol/IERC721.json")
const IERC20 = require("../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json")
const ICERC20 = require("../artifacts/contracts/NftStakingWallet.sol/ICERC20.json")

const {utils: { parseEther, parseUnits }, getSigners, getContractFactory} = require("ethers");
const {expect} = require("chai")

describe("Staking wallet contract", function () {
    let user1, user2, userDummy, contract,
        mockCollection, mockCToken, mockUnderlyingAsset, mockRewardToken

    beforeEach(async () => {
        [user1, user2, userDummy] = await ethers.getSigners()

        // Deploy a dummy ERC721 contract with tokens that accept stakes
        mockCollection = await deployMockContract(user1, IERC721.abi)
        await mockCollection.mock.ownerOf.returns(user2.address)

        // Deploy the compound lending market token
        mockCToken = await deployMockContract(user1, ICERC20.abi)
        await mockCToken.mock.mint.returns(0)

        // Deploy an underlying token
        mockUnderlyingAsset = await deployMockContract(user1, IERC20.abi)
        await mockUnderlyingAsset.mock.approve.returns(true)

        // Deploy a reward token
        mockRewardToken = await deployMockContract(user1, IERC20.abi)

        // Deploy a staking wallet to test
        const walletFactory = await ethers.getContractFactory("NftStakingWallet")
        contract = await walletFactory.deploy(
            mockCollection.address, mockCToken.address, mockUnderlyingAsset.address, mockRewardToken.address)
        await contract.deployed()
    })

    it('should forward deposits to cToken and record the deposit', async () => {
        const tokensSent = 52
        const tokenId = 8080

        await contract.deposit(tokenId, tokensSent)

        const tx = await contract.depositsOf(tokenId)
        expect(tx).to.be.equal(tokensSent)
        // .to.emit(contract, "Deposited").withArgs(tokenId, user1.address, tokensSent)

        expect(await contract.totalDeposits()).to.be.equal(tokensSent)
        // expect("approve").to.be.calledOnContractWith(mockUnderlyingAsset, [mockCToken.address, tokensSent])
        // expect(mockCToken.mock.mint).to.have.been.calledOnceWith(tokensSent)
    })

    it('should disallow non-owner from calling sensitive functions', async () => {
        const amount = 52
        const tokenId = 80286

        expect(contract.connect(userDummy).deposit(tokenId, amount))
            .to.be.revertedWith('Ownable: caller is not the owner')
        expect(contract.connect(userDummy).withdraw(userDummy.address, tokenId))
            .to.be.revertedWith('Ownable: caller is not the owner')
        expect(contract.connect(userDummy).claimPrize(userDummy.address))
            .to.be.revertedWith('Ownable: caller is not the owner')
        expect(contract.connect(userDummy).claimComp())
            .to.be.revertedWith('Ownable: caller is not the owner')
        expect(contract.connect(userDummy).sendComp(userDummy.address))
            .to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('should keep a running total of deposits', async () => {
        // Input values
        const totalDeposited = parseUnits("666")

        // make a deposit
        await contract.deposit(999, parseEther("333"))
        await contract.deposit(888, parseEther("222"))
        await contract.deposit(777, parseEther("111"))

        expect(await contract.totalDeposits()).to.be.equal(totalDeposited)
    })

    it('should send the interest to the address that won the prize', async () => {
        // Input values
        const initialExchangeRate = parseUnits("1")
        const currentExchangeRate = parseUnits("1.1")
        const totalDeposited = parseUnits("55")
        const cTokenBalance = totalDeposited.div(initialExchangeRate)
        const interestEarned = parseUnits("5.5");

        // mock contract returns
        await mockCToken.mock.exchangeRateCurrent.returns(currentExchangeRate)
        await mockCToken.mock.balanceOf.returns(cTokenBalance)

        // make a deposit
        await contract.deposit(1001, totalDeposited)

        expect(await contract.getInterestEarned()).to.be.equal(interestEarned)
    })
})