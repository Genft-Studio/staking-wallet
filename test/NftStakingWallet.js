const {waffle} = require("hardhat")
const IERC721 = require("../artifacts/@openzeppelin/contracts/token/ERC721/IERC721.sol/IERC721.json")
const IERC20 = require("../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json")
const ICERC20 = require("../artifacts/contracts/NftStakingWallet.sol/ICERC20.json")

const {BigNumber, utils: { parseEther, parseUnits }, getSigners} = require("ethers");
const {expect} = require("chai")

describe("Staking wallet contract", function () {
    let user1, user2, userDummy, contract,
        mockCollection, mockCToken, mockUnderlyingAsset, mockRewardToken

    beforeEach(async () => {
        [user1, user2, userDummy] = await ethers.getSigners()

        // Deploy a dummy ERC721 contract with tokens that accept stakes
        mockCollection = await waffle.deployMockContract(user1, IERC721.abi)
        await mockCollection.mock.ownerOf.returns(user2.address)

        // Deploy the compound lending market token
        mockCToken = await waffle.deployMockContract(user1, ICERC20.abi)
        await mockCToken.mock.mint.returns(0)

        // Deploy an underlying token
        mockUnderlyingAsset = await waffle.deployMockContract(user1, IERC20.abi)
        await mockUnderlyingAsset.mock.approve.returns(true)

        // Deploy a reward token
        mockRewardToken = await waffle.deployMockContract(user1, IERC20.abi)

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

    it('should send the interest to the address that won the prize', async () => {
        const initialExchangeRate = parseUnits("1")
        const currentExchangeRate = parseUnits("1.1")
        const totalDeposited = parseUnits("55")
        const cTokenBalance = totalDeposited.div(initialExchangeRate)

        await mockCToken.mock.exchangeRateCurrent.returns(currentExchangeRate)
        await mockCToken.mock.balanceOf.returns(cTokenBalance)

        await contract.deposit(1001, parseEther("1"))
        await contract.deposit(1002, parseEther("2"))
        await contract.deposit(1003, parseEther("3"))
        await contract.deposit(1004, parseEther("4"))
        await contract.deposit(1005, parseEther("5"))
        await contract.deposit(1006, parseEther("6"))
        await contract.deposit(1007, parseEther("7"))
        await contract.deposit(1008, parseEther("8"))
        await contract.deposit(1009, parseEther("9"))
        await contract.deposit(1010, parseEther("10"))

        expect(await contract.totalDeposits()).to.be.equal(totalDeposited)

        const interestEarned = parseUnits("5.5");
        expect(await contract.getInterestEarned()).to.be.equal(interestEarned)
    })

})