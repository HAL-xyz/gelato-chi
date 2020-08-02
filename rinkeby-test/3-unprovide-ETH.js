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

describe("Unproviding ETH deposited on Gelato via GnosisSafe", function () {
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
  });

  it("Withdraws funds from Gelato", async function () {
    const fundsOnGelato = await gelatoCore.providerFunds(cpk.address);
    console.log(
      `Current funds on Gelato: ${utils.formatEther(fundsOnGelato)} ETH`
    );

    const prevFundsInUserProxy = await ethers.provider.getBalance(cpk.address);
    console.log(
      `Current funds in GnosisSafe: ${utils.formatEther(
        prevFundsInUserProxy
      )} ETH`
    );

    if (fundsOnGelato.eq("0")) {
      console.log(
        `❌ GnosisSafe ${cpk.address} has no funds on Gelato on ${bre.network.name}`
      );
      process.exit(1);
    }

    console.log(`\n Withdrawing ${utils.formatEther(fundsOnGelato)} ETH`);
    try {
      const tx = await cpk.execTransactions([
        {
          operation: CPK.CALL,
          to: GELATO,
          value: 0,
          data: await bre.run("abi-encode-withselector", {
            abi: GelatoCoreLib.GelatoCore.abi,
            functionname: "unprovideFunds",
            inputs: [fundsOnGelato],
          }),
        },
      ]);
      // Wait for mining
      console.log(`Tx Hash: ${tx.hash}`);

      const fundsInUserProxy = await ethers.provider.getBalance(cpk.address);
      expect(fundsInUserProxy).to.be.equal(
        prevFundsInUserProxy.add(fundsOnGelato)
      );
      console.log(`New funds in GnosisSafe at ${cpk.address}`);
      console.log(`${utils.formatEther(fundsInUserProxy)} ETH`);
    } catch (error) {
      console.error("\n Gelato unprovideFunds error ❌  \n", error);
      process.exit(1);
    }
  });
});
