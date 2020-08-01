// We require the Buidler Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `buidler run <script>` you'll find the Buidler
// Runtime Environment's members available in the global scope.
const bre = require("@nomiclabs/buidler");

// Ethers v4 needed for CPK
const { ethers } = require("ethers");

// CPK Library
const CPK = require("contract-proxy-kit");

// running `npx buidler test` automatically makes use of buidler-waffle plugin
// => only dependency we need is "chai"
const { expect } = require("chai");

describe("Step1: Create a GnosisSafe via CPK, if not already created", function () {
  // No timeout for Mocha due to Rinkeby mining latency
  this.timeout(0);

  // We use our User Wallet. Per our config this wallet is at the accounts index 0
  // and hence will be used by default for all transactions we send.
  let myUserWallet;
  let myUserAddress;

  // 2) We will deploy a GnosisSafeProxy using the Factory, or if we already deployed
  //  one, we will use that one.
  let myUserProxy;

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
      myUserProxy = await CPK.create({ ethers, signer: myUserWallet });
    } catch (error) {
      console.error("\n proxyDeployment error ❌  \n", error);
      process.exit(1);
    }

    expect(await myUserProxy.getOwnerAccount()).to.be.equal(myUserAddress);

    console.log(
      `CPK Proxy is deployed at ${myUserProxy.address} on ${bre.network.name}`
    );
  });
});
