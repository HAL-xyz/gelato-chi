// We require the Buidler Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `buidler run <script>` you'll find the Buidler
// Runtime Environment's members available in the global scope.
const bre = require("@nomiclabs/buidler");
const ethers = bre.ethers;
const { utils } = require("ethers");

// CPK Library
const CPK = require("contract-proxy-kit");

// running `npx buidler test` automatically makes use of buidler-waffle plugin
// => only dependency we need is "chaFi"
const { expect } = require("chai");

const GelatoCoreLib = require("@gelatonetwork/core");

const GELATO = bre.network.config.deployments.GelatoCore;
const EXECUTOR = bre.network.config.addressBook.gelatoExecutor.default;
const PROVIDER_MODULE_GNOSIS =
  bre.network.config.deployments.ProviderModuleGnosisSafeProxy;

// The gas limit for our automated CHI.mint TX
// ActionChiMint caps chiAmount to 140 CHI => 6 mio gas should always suffice
const SELF_PROVIDER_GAS_LIMIT = 6000000; // 6 mio gas

// These are the maximum CHI tokens mintable
const CHI_TOKENS_MAX = "140";

// Current Gelato Gas Price
let currentGelatoGasPrice;

// TRIGGER GAS PRICE
let triggerGasPrice;

describe("Submitting ActionCHIMint Task to Gelato via GnosisSafe", function () {
  // No timeout for Mocha due to Rinkeby mining latency
  this.timeout(0);

  // We use our User Wallet. Per our config this wallet is at the accounts index 0
  // and hence will be used by default for all transactions we send.
  let myUserWallet;
  let myUserAddress;

  // 2) We will deploy a GnosisSafeProxy using the Factory, or if we already deployed
  //  one, we will use that one.
  let cpk;

  let gelatoCore;

  before(async function () {
    // We get our User Wallet from the Buidler Runtime Env
    [myUserWallet] = await bre.ethers.getSigners();
    myUserAddress = await myUserWallet.getAddress();
    try {
      console.log("\n Fetching GnosisSafeProxy or creating if none!");
      cpk = await CPK.create({ ethers, signer: myUserWallet });
      expect(await cpk.getOwnerAccount()).to.be.equal(myUserAddress);
      console.log(
        `CPK Proxy is deployed at ${cpk.address} on ${bre.network.name}`
      );
    } catch (error) {
      console.error("\n CPK.create error ❌  \n", error);
      process.exit(1);
    }

    gelatoCore = await ethers.getContractAt(
      GelatoCoreLib.GelatoCore.abi,
      network.config.deployments.GelatoCore // the Rinkeby Address of the deployed GelatoCore
    );

    currentGelatoGasPrice = await bre.run("fetchGelatoGasPrice");
  });

  // Submit your Task to Gelato via your GelatoUserProxy
  it("User submits Task as SelfProvider", async function () {
    // First we want to make sure that the Task we want to submit actually has
    // a valid Provider, so we need to ask GelatoCore some questions about the Provider.

    // For our Task to be executable, our Provider must have sufficient funds on Gelato
    const providerIsLiquid = await gelatoCore.isProviderLiquid(
      cpk.address,
      ethers.utils.bigNumberify("8000000"), // we need roughtly estimatedGasPerExecution * 3 executions as balance on gelato
      currentGelatoGasPrice
    );
    if (!providerIsLiquid) {
      console.log(
        "\n ❌  Ooops! Your Provider needs to provide more funds to Gelato \n"
      );
      console.log("DEMO: run this command: `yarn provide` first");
      process.exit(1);
    }

    // For the Demo, make sure the Provider has the Gelato default Executor assigned
    const assignedExecutor = await gelatoCore.executorByProvider(cpk.address);
    if (assignedExecutor !== defaultExecutor) {
      console.log(
        "\n ❌  Ooops! Your Provider needs to assign the gelato default Executor \n"
      );
      console.log("DEMO: run this command: `yarn provide` first");
      process.exit(1);
    }

    // For the Demo, our Provider must use the deployed ProviderModuleGelatoUserProxy
    const userProxyModuleIsProvided = await gelatoCore.isModuleProvided(
      cpk.address,
      network.config.deployments.ProviderModuleGelatoUserProxy
    );
    if (!userProxyModuleIsProvided) {
      console.log(
        "\n ❌  Ooops! Your Provider still needs to add ProviderModuleGelatoUserProxy \n"
      );
      console.log("DEMO: run this command: `yarn provide` first");
      process.exit(1);
    }

    // The single Transaction that deploys your GelatoUserProxy and submits your Task Cycle
    if (
      providerIsLiquid &&
      assignedExecutor === defaultExecutor &&
      userProxyModuleIsProvided
    ) {
      // We also want to keep track of token balances in our UserWallet
      const myUserWalletDAIBalance = await bre.run("erc20-balance", {
        erc20name: "KNC",
        owner: myUserAddress,
      });

      // Since our Proxy will move a total of 3 KNC from our UserWallet to
      // trade them for ETH and pay the Provider fee, we need to make sure the we
      // have the KNC balance
      if (!myUserWalletDAIBalance.gte(3)) {
        console.log(
          "\n ❌ Ooops! You need at least 3 KNC in your UserWallet \n"
        );
        process.exit(1);
      }

      // We also monitor the KNC approval our GelatoUserProxy has from us
      const myUserProxyDAIAllowance = await bre.run("erc20-allowance", {
        owner: myUserAddress,
        erc20name: "KNC",
        spender: myUserProxyAddress,
      });

      // ###### 1st TX => APPROVE USER PROXY TO MOVE KNC

      // Since our Proxy will move a total of 3 KNC from our UserWallet to
      // trade them for ETH and pay the Provider fee, we need to make sure the we
      // that we have approved our UserProxy. We can already approve it before
      // we have even deployed it, due to create2 address prediction magic.
      if (!myUserProxyDAIAllowance.gte(utils.parseUnits("3", 18))) {
        try {
          console.log("\n Sending Transaction to approve UserProxy for KNC.");
          console.log("\n Waiting for KNC Approval Tx to be mined....");
          await bre.run("erc20-approve", {
            erc20name: "KNC",
            amount: utils.parseUnits("3", 18).toString(),
            spender: myUserProxyAddress,
          });
          console.log(
            "\n Gelato User Proxy now has your Approval to move 3 KNC  ✅ \n"
          );
        } catch (error) {
          console.error("\n UserProxy KNC Approval failed ❌  \n", error);
          process.exit(1);
        }
      } else {
        console.log(
          "\n Gelato User Proxy already has your Approval to move 3 KNC  ✅ \n"
        );
      }

      // To submit Tasks to  Gelato we need to instantiate a GelatoProvider object
      const myGelatoProvider = new GelatoProvider({
        addr: cpk.address, // This time, the provider is paying for the Task, hence we input the Providers address
        module: network.config.deployments.ProviderModuleGelatoUserProxy,
      });

      // We should also specify an expiryDate for our Task Cycle
      // Since we want to trade 3 times every 2 minutes, something like 15 minutes from
      //  now should be reasonably safe in case of higher network latency.
      // You can also simply input 0 to not have an expiry date
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const expiryDate = nowInSeconds + 900; // 15 minutes from now

      // ###### 2nd TX => Submit Task to gelato

      // We Submit our Task as a "Task Cycle" with 3 cycles to limit the number
      // of total Task executions to three.
      let taskSubmissionTx;
      try {
        console.log("\n Sending Transaction to submit Task!");
        taskSubmissionTx = await myUserProxy.execActionsAndSubmitTaskCycle(
          [actionUpdateConditionTime], // setup the Time Condition for first trade in 2 mins
          myGelatoProvider,
          [taskTradeOnKyber], // we only have one type of Task
          expiryDate, // auto-cancel if not completed in 15 minutes from now
          3, // the num of times we want our Task to be executed: 3 times every 2 minutes
          {
            gasLimit: 1000000,
            gasPrice: utils.parseUnits("10", "gwei"),
          }
        );
      } catch (error) {
        console.error("\n PRE taskSubmissionTx error ❌  \n", error);
        process.exit(1);
      }
      try {
        console.log("\n Waiting for taskSubmissionTx to get mined...");
        await taskSubmissionTx.wait();
        console.log(`\n Task with provider ${cpk.address} Submitted ✅ \n`);
        console.log("\n Task will be executed a total of 3 times \n");
      } catch (error) {
        console.error("\n POST taskSubmissionTx error ❌ ", error);
        process.exit(1);
      }
    }
  });
});
