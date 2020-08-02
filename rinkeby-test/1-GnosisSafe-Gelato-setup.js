// We require the Buidler Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `buidler run <script>` you'll find the Buidler
// Runtime Environment's members available in the global scope.
const bre = require("@nomiclabs/buidler");
const ethers = bre.ethers;
const { constants, utils } = require("ethers");

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

const FUNDS_TO_DEPOSIT = utils.parseEther("0.1");

describe("Create a GnosisSafe via CPK and setup with Gelato", function () {
  // No timeout for Mocha due to Rinkeby mining latency
  this.timeout(0);

  // We use our User Wallet. Per our config this wallet is at the accounts index 0
  // and hence will be used by default for all transactions we send.
  let myUserWallet;
  let myUserAddress;

  // 2) We will deploy a GnosisSafeProxy using the Factory, or if we already deployed
  //  one, we will use that one.
  let cpk;
  let gnosisSafe;

  before(async function () {
    // We get our User Wallet from the Buidler Runtime Env
    [myUserWallet] = await bre.ethers.getSigners();
    myUserAddress = await myUserWallet.getAddress();
  });

  it("Creates a GnosisSafeProxy", async function () {
    // Transaction to deploy your GnosisSafeProxy
    // If we have not deployed our GnosisSafeProxy yet, we deploy it
    try {
      console.log("\n Sending Transaction to create GnosisSafeProxy!");
      cpk = await CPK.create({ ethers, signer: myUserWallet });
    } catch (error) {
      console.error("\n proxyDeployment error ❌  \n", error);
      process.exit(1);
    }

    expect(await cpk.getOwnerAccount()).to.be.equal(myUserAddress);

    console.log(
      `CPK Proxy is deployed at ${cpk.address} on ${bre.network.name}`
    );
  });

  describe("Setup with Gelato", function () {
    before(async function () {
      // We instantiate the UserProxyGnosisSafe
      gnosisSafe = await bre.ethers.getContractAt("IGnosisSafe", cpk.address);
    });

    it("Whitelists GelatoCore as a GnosisSafe module and sets up Gelato", async function () {
      let enabledModules = await gnosisSafe.getModules();
      let gelato = enabledModules.find((element) => element === GELATO);
      let gelatoIsWhitelisted = gelato ? true : false;

      if (!gelatoIsWhitelisted) {
        try {
          console.log("\n Sending Transaction to whitelist GelatoCore module!");
          const tx = await cpk.execTransactions([
            {
              operation: CPK.CALL,
              to: cpk.address,
              value: "0",
              data: await bre.run("abi-encode-withselector", {
                abi: bre.GnosisSafe.abi,
                functionname: "enableModule",
                inputs: [GELATO],
              }),
            },
          ]);

          // Wait for mining
          await tx.wait();

          // Success!
          enabledModules = await gnosisSafe.getModules();
          expect(
            enabledModules.find((element) => element === GELATO)
          ).to.be.equal(GELATO);
          console.log(`✅ Gelato whitelisted.`);
        } catch (error) {
          console.error("\n Gelato Whitelisting error ❌  \n", error);
          process.exit(1);
        }
      } else {
        console.log(`✅ Gelato ALREADY whitelisted.`);
      }
    });

    it("Deposit 1 ETH on GelatoCore, select default Gelato Executor and tell Gelato what kind of a proxy will interact with it via UserProxy", async function () {
      // Instantiate GelatoCore contract instance for sanity checks
      const gelatoCore = await ethers.getContractAt(
        GelatoCoreLib.GelatoCore.abi,
        network.config.deployments.GelatoCore // the Rinkeby Address of the deployed GelatoCore
      );

      // For the Demo, make sure the Provider has the Gelato default Executor assigned
      const assignedExecutor = await gelatoCore.executorByProvider(
        gnosisSafe.address // As the User is being his own provider, we will use the userProxy's address as the provider address
      );

      let isDefaultExecutorAssigned =
        utils.getAddress(assignedExecutor) === utils.getAddress(EXECUTOR)
          ? true
          : false;
      if (isDefaultExecutorAssigned)
        console.log("\n ✅Default Executor ALREADY assigned");

      // If the user wants to use Gelato through their GnosisSafe, he needs to register the ProviderModuleGnosisSafeProxy to make his GnosisSafe compatible with Gelato

      // Here we check if the User already enabled the ProviderModuleGnosisSafeProxy.
      //  If not, we will enable it in the upcoming Tx.
      const isUserProxyModuleWhitelisted = await gelatoCore.isModuleProvided(
        gnosisSafe.address,
        PROVIDER_MODULE_GNOSIS
      );

      if (isUserProxyModuleWhitelisted)
        console.log("\n ✅ UserProxyModule ALREADY whitelisted");

      // Providing Funds
      console.log("Providing Funds to UserProxy Provider balance");
      await gelatoCore.provideFunds(gnosisSafe.address, {
        value: FUNDS_TO_DEPOSIT,
      });
      expect(await gelatoCore.provideFunds(gnosisSafe.address)).to.be.gte(
        FUNDS_TO_DEPOSIT
      );

      /*
      Function that the User Proxy should call:
        gelatoCore.multiProvide(
          address _executor,
          TaskSpec[] memory _taskSpecs,
          IGelatoProviderModule[] memory _modules
        )
      */

      // The single Transaction that 1) Deposits ETH on gelato, 2) selects the default gelato execution network and 3) tells gelato you are a GnosisSafe
      let tx;
      if (!isDefaultExecutorAssigned || !isUserProxyModuleWhitelisted) {
        try {
          console.log(
            "\n Sending Transaction to setup UserProxy as SelfProvider"
          );
          tx = await cpk.execTransactions([
            {
              to: GELATO,
              operation: CPK.CALL,
              value: "0",
              data: await bre.run("abi-encode-withselector", {
                abi: GelatoCoreLib.GelatoCore.abi,
                functionname: "multiProvide",
                inputs: [
                  isDefaultExecutorAssigned ? constants.AddressZero : EXECUTOR,
                  [], // this can be left empty, as it is only relevant for external providers
                  isUserProxyModuleWhitelisted ? [] : [PROVIDER_MODULE_GNOSIS],
                ],
              }),
            },
          ]);

          // Wait for mining
          await tx.wait();

          // Success
          console.log("\nUser Proxy succesfully set up ✅ \n");
          console.log("TX:", tx.hash);
          console.log(`
            \n Deposited ${utils.formatEther(FUNDS_TO_DEPOSIT)} ETH on gelato
            \n Selected default execution network: ${EXECUTOR}
            \n Whitelisted following provider module: ${PROVIDER_MODULE_GNOSIS} \n`);
        } catch (error) {
          console.error("\n Gelato UserProxy Setup Error ❌  \n", error);
          process.exit(1);
        }
      }
    });
  });
});