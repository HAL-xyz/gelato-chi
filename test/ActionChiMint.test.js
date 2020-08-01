// running `npx buidler test` automatically makes use of buidler-waffle plugin
// => only dependency we need is "chai"
const { expect } = require("chai");
const bre = require("@nomiclabs/buidler");
const { ethers } = bre;
const { utils } = require("ethers");
const GelatoCoreLib = require("@gelatonetwork/core");
const GelatoUserProxyLib = require("@gelatonetwork/gelato-user-proxy");

// GelatoGasPriceOracle setup vars
const GELATO_GAS_PRICE_START = ethers.utils.parseUnits("80", "gwei");

// Gelato Core Setup Vars
const ORACLE_REQUEST_DATA = "0x50d25bcd"; // latestAnswer() selector
const GELATO_MAX_GAS = 7000000;
const INTERNAL_GAS_REQUIREMENT = 100000;
const MIN_EXECUTOR_STAKE = ethers.utils.parseEther("1");
const EXECUTOR_SUCCESS_SHARE = 5;
const SYS_ADMIN_SUCCESS_SHARE = 5;

const gelatoCoreConstrutorParams = {
  gelatoGasPriceOracle: ethers.constants.AddressZero, // we deploy and fill in later
  oracleRequestData: ORACLE_REQUEST_DATA,
  gelatoMaxGas: GELATO_MAX_GAS,
  internalGasRequirement: INTERNAL_GAS_REQUIREMENT,
  minExecutorStake: MIN_EXECUTOR_STAKE,
  executorSuccessShare: EXECUTOR_SUCCESS_SHARE,
  sysAdminSuccessShare: SYS_ADMIN_SUCCESS_SHARE,
  totalSuccessShare: EXECUTOR_SUCCESS_SHARE + SYS_ADMIN_SUCCESS_SHARE,
};

// The funds we provide to Gelato, in order to pay for automated CHI tokens minted
const GELATO_GAS_TANK_FUNDS = ethers.utils.parseEther("1");

// The gas limit for our automated CHI.mint TX
// ActionChiMint caps chiAmount to 140 CHI => 6 mio gas should always suffice
const SELF_PROVIDER_GAS_LIMIT = 6000000; // 6 mio gas

// This is the gelatoGasPrice that we want to be the trigger for our
// automatic CHI minting => we set it to half of the initial gas price
const TRIGGER_GAS_PRICE = GELATO_GAS_PRICE_START.div("2");

// These are the maximum CHI tokens mintable
const CHI_TOKENS_MAX = "140";

describe("ActionChiMint Local Test Suite", function () {
  if (bre.network.name !== "buidlerevm") {
    console.error("Test Suite is meant to be run on buidlerevm only");
    process.exit(1);
  }

  // Wallet to use for local testing
  let testUserWallet;
  let testUserAddress;
  let gelatoUserProxyAddress;

  // Contracts to deploy and use for locak testing
  let gelatoGasPriceOracle;
  let gelatoCore;
  let gelatoUserProxy;
  let gelatoActionPipeline;
  let providerModuleGelatoUserProxy;
  let chiToken;
  let actionChiMint;

  // Gelato Types
  let gelatoSelfProvider;
  let taskAutoMintWhenTriggerGasPrice;

  beforeEach(async function () {
    // Get Test Wallet for local testnet
    [testUserWallet] = await ethers.getSigners();
    testUserAddress = await testUserWallet.getAddress();

    // ===== GELATO LOCAL SETUP START ==================
    // Deploy GelatoGasPriceOracle and set starting GELATO_GAS_PRICE_START
    const GelatoGasPriceOracle = await ethers.getContractFactory(
      GelatoCoreLib.GelatoGasPriceOracle.abi,
      GelatoCoreLib.GelatoGasPriceOracle.bytecode
    );
    gelatoGasPriceOracle = await GelatoGasPriceOracle.deploy(
      GELATO_GAS_PRICE_START
    );
    await gelatoGasPriceOracle.deployed();
    gelatoCoreConstrutorParams.gelatoGasPriceOracle =
      gelatoGasPriceOracle.address;

    // Deploy Gelato Core to local testnet
    const GelatoCore = await ethers.getContractFactory(
      GelatoCoreLib.GelatoCore.abi,
      GelatoCoreLib.GelatoCore.bytecode
    );
    gelatoCore = await GelatoCore.deploy(gelatoCoreConstrutorParams);
    await gelatoCore.deployed();
    // Additional GelatoCore setup: stakeExecutor
    await gelatoCore.stakeExecutor({ value: MIN_EXECUTOR_STAKE });

    // Deploy GelatoUserProxyFactory to local testnet
    const GelatoUserProxyFactory = await ethers.getContractFactory(
      GelatoUserProxyLib.GelatoUserProxyFactory.abi,
      GelatoUserProxyLib.GelatoUserProxyFactory.bytecode
    );
    const gelatoUserProxyFactory = await GelatoUserProxyFactory.deploy(
      gelatoCore.address
    );
    await gelatoUserProxyFactory.deployed();

    // Create GelatoUserProxy for testing => remember all Gelato interactions
    // go through our GelatoUserProxy
    const CREATE_2_SALT = 42069; // for create2 and address prediction
    await gelatoUserProxyFactory.createTwo(CREATE_2_SALT);
    gelatoUserProxyAddress = await gelatoUserProxyFactory.predictProxyAddress(
      testUserAddress,
      CREATE_2_SALT
    );
    gelatoUserProxy = await ethers.getContractAt(
      GelatoUserProxyLib.GelatoUserProxy.abi,
      gelatoUserProxyAddress
    );

    // Deploy GelatoActionPipeline to local testnet
    const GelatoActionPipeline = await ethers.getContractFactory(
      GelatoCoreLib.GelatoActionPipeline.abi,
      GelatoCoreLib.GelatoActionPipeline.bytecode
    );
    gelatoActionPipeline = await GelatoActionPipeline.deploy();

    // Deploy ProviderModuleGelatoUserProxy with constructorArgs
    const ProviderModuleGelatoUserProxy = await ethers.getContractFactory(
      GelatoUserProxyLib.ProviderModuleGelatoUserProxy.abi,
      GelatoUserProxyLib.ProviderModuleGelatoUserProxy.bytecode
    );
    providerModuleGelatoUserProxy = await ProviderModuleGelatoUserProxy.deploy(
      gelatoUserProxyFactory.address,
      gelatoActionPipeline.address
    );
    await providerModuleGelatoUserProxy.deployed();

    // Gelato SelfProvider setup:
    // 1) We assign our testUserAddress as Executor for test simulation
    // 2) We whitelist providerModuleGelatoUserProxy as our SelfProvider module
    // 3) We depost funds on GelatoCore to pay for automated CHI minting later
    const selfProviderSetupAction = new Action({
      addr: gelatoCore.address,
      data: await bre.run("abi-encode-withselector", {
        abi: GelatoCoreLib.GelatoCore.abi,
        functionname: "multiProvide",
        inputs: [testUserAddress, [], [providerModuleGelatoUserProxy.address]],
      }),
      operation: GelatoCoreLib.Operation.Call,
      value: GELATO_GAS_TANK_FUNDS,
    });

    await gelatoUserProxy.execAction(selfProviderSetupAction, {
      value: GELATO_GAS_TANK_FUNDS,
    });

    // ===== GELATO LOCAL SETUP END ==================

    // Deploy CHI token to local testnet
    const ChiToken = await ethers.getContractFactory("ChiToken");
    chiToken = await ChiToken.deploy();
    await chiToken.deployed();

    // Deploy ActionChiMint to  local testnet
    const ActionChiMint = await ethers.getContractFactory("ActionChiMint");
    actionChiMint = await ActionChiMint.deploy(chiToken.address);
    await actionChiMint.deployed();

    // Instantiate GelatoProvider type for our SelfProvider
    gelatoSelfProvider = new GelatoProvider({
      addr: gelatoUserProxyAddress,
      module: providerModuleGelatoUserProxy.address,
    });

    // Specify and Instantiate the Gelato Task
    taskAutoMintWhenTriggerGasPrice = new Task({
      actions: [
        new Action({
          addr: actionChiMint.address,
          data: await actionChiMint.getActionData(
            testUserAddress, // recipient of CHI Tokens
            CHI_TOKENS_MAX // CHI Tokens to be minted
          ),
          operation: GelatoCoreLib.Operation.Delegatecall,
          termsOkCheck: true,
        }),
      ],
      selfProviderGasLimit: SELF_PROVIDER_GAS_LIMIT,
      // This makes sure we only mint CHI when the gelatoGasPrice is at or below
      // our desired trigger gas price
      selfProviderGasPriceCeil: TRIGGER_GAS_PRICE,
    });
  });

  it("#1: Automatically mint CHI tokens, when gelatoGasPrice halves", async function () {
    await expect(
      gelatoUserProxy.submitTask(
        gelatoSelfProvider,
        taskAutoMintWhenTriggerGasPrice,
        0 // expiry date 0 => task is good til cancelled
      )
    ).to.emit(gelatoCore, "LogTaskSubmitted");

    // construct a Gelato TaskReceipt needed for canExec and exec testing
    const taskReceipt = new TaskReceipt({
      id: 1,
      provider: gelatoSelfProvider,
      userProxy: gelatoUserProxyAddress,
      tasks: [taskAutoMintWhenTriggerGasPrice],
    });

    // We store the CHI balance of our testUser
    const preUserBalanceCHI = await chiToken.balanceOf(testUserAddress);

    // ====== AUTOMATION SIMULATION (local testing) ======
    // On Ethereum mainnet or testnet, Gelato Executors would perform the logic
    // that follows for you and automate your Task execution. However,
    // in a local test simulation we have to do it ourselves, in order to test
    // our Task and Action logic.

    // We expect canExec to be false (SelfProviderGasPriceCeil)
    // because we only want to mint CHI, if the gelatoGasPrice moved down from
    // GELATO_GAS_PRICE_START to TRIGGER_GAS_PRICE
    expect(
      await gelatoCore.canExec(
        taskReceipt,
        taskReceipt.tasks[0].selfProviderGasLimit,
        GELATO_GAS_PRICE_START
      )
    ).to.be.equal("SelfProviderGasPriceCeil");

    // We manipulate the gelatoGasPrice on the gelatoGasPriceOracle
    // to simulate a gasPrice decrease to out trigger value threshold.
    await gelatoGasPriceOracle.setGasPrice(TRIGGER_GAS_PRICE);

    // Now we expect canExec to be true (OK) because now we want to
    // automatically mint CHI if the gelatoGasPrice moved down from
    // GELATO_GAS_PRICE_START to TRIGGER_GAS_PRICE (selfProviderGasPriceCeil)
    expect(
      await gelatoCore.canExec(
        taskReceipt,
        taskReceipt.tasks[0].selfProviderGasLimit, // 6 mio for 140 CHI
        taskReceipt.tasks[0].selfProviderGasPriceCeil // TRIGGER_GAS_PRICE
      )
    ).to.be.equal("OK");

    // Now we simulate the Executor's job and we try to execute our Task
    // and expect it to be successful.
    await expect(
      gelatoCore.exec(taskReceipt, {
        gasPrice: TRIGGER_GAS_PRICE,
        gasLimit: utils
          .bigNumberify(taskReceipt.tasks[0].selfProviderGasLimit)
          .add(30000),
      })
    ).to.emit(gelatoCore, "LogExecSuccess");

    // TestUser checks
    expect(await chiToken.balanceOf(testUserAddress)).to.be.equal(
      preUserBalanceCHI.add(CHI_TOKENS_MAX)
    );
  });
});
