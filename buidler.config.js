// Libraries
const assert = require("assert");
const { utils } = require("ethers");
const GelatoCoreLib = require("@gelatonetwork/core");

// Contracts
const GnosisSafe = require("./artifacts/IGnosisSafe.json");

// Process Env Variables
require("dotenv").config();
const INFURA_ID = process.env.INFURA_ID;
const USER_PK = process.env.USER_PK;
assert.ok(INFURA_ID, "no Infura ID in process.env");
assert.ok(USER_PK, "no User private key (USER_PK) found in .env");

// ================================= CONFIG =========================================
module.exports = {
  defaultNetwork: "buidlerevm",
  etherscan: {
    // The url for the Etherscan API you want to use.
    // For example, here we're using the one for the Rinkeby test network
    url: "https://api-rinkeby.etherscan.io/api",
    // Your API key for Etherscan (Obtain one at https://etherscan.io/)
    apiKey: process.env.ETHERSCAN_KEY,
  },
  namedAccounts: {
    deployer: {
      default: 0, // here this will by default take the first account as deployer
    },
  },
  networks: {
    rinkeby: {
      // Standard
      accounts: USER_PK ? [USER_PK] : [],
      chainId: 4,
      url: `https://rinkeby.infura.io/v3/${INFURA_ID}`,
      // Custom
      // Rinkeby: addressBook
      addressBook: {
        // Rinkeby: Gelato
        gelatoExecutor: {
          default: "0xa5A98a6AD379C7B578bD85E35A3eC28AD72A336b", // PermissionedExecutors
        },
      },
      // Rinkeby: Deployments
      deployments: {
        // ===== Gelato Core ====
        GelatoCore: "0x733aDEf4f8346FD96107d8d6605eA9ab5645d632",
        // === GelatoUserProxies ===
        GelatoUserProxyFactory: "0x0309EC714C7E7c4C5B94bed97439940aED4F0624",
        // ===== Provider Modules ====
        ProviderModuleGelatoUserProxy:
          "0x66a35534126B4B0845A2aa03825b95dFaaE88B0C",
        ProviderModuleGnosisSafeProxy:
          "0x2661B579243c49988D9eDAf114Bfac5c5E249287",
      },
    },
  },
  solc: {
    version: "0.6.12",
    optimizer: { enabled: true },
  },
};

// ================================= BRE extension ==================================
extendEnvironment((bre) => {
  // Contracts
  bre.GnosisSafe = GnosisSafe;
  // Libraries
  bre.GelatoCoreLib = GelatoCoreLib;
});

// ================================= PLUGINS =========================================
usePlugin("@nomiclabs/buidler-ethers");
usePlugin("@nomiclabs/buidler-waffle");
usePlugin("buidler-deploy");
usePlugin("@nomiclabs/buidler-etherscan");

// ================================= TASKS =========================================
task("abi-encode-withselector")
  .addPositionalParam(
    "abi",
    "Contract ABI in array form",
    undefined,
    types.json
  )
  .addPositionalParam("functionname")
  .addOptionalVariadicPositionalParam(
    "inputs",
    "Array of function params",
    undefined,
    types.json
  )
  .addFlag("log")
  .setAction(async (taskArgs) => {
    try {
      if (taskArgs.log) console.log(taskArgs);

      if (!taskArgs.abi)
        throw new Error("abi-encode-withselector: no abi passed");

      const interFace = new utils.Interface(taskArgs.abi);

      // if (
      //   !GelatoCoreLib.checkNestedObj(
      //     interFace,
      //     "functions",
      //     taskArgs.functionname
      //   )
      // )
      //   throw new Error("\nfunctionname is not on contract's interface");

      let payloadWithSelector;

      if (taskArgs.inputs) {
        let iterableInputs;
        try {
          iterableInputs = [...taskArgs.inputs];
        } catch (error) {
          iterableInputs = [taskArgs.inputs];
        }
        payloadWithSelector = interFace.functions[taskArgs.functionname].encode(
          iterableInputs
        );
      } else {
        payloadWithSelector = interFace.functions[taskArgs.functionname].encode(
          []
        );
      }

      if (taskArgs.log)
        console.log(`\nEncodedPayloadWithSelector:\n${payloadWithSelector}\n`);
      return payloadWithSelector;
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  });

task(
  "fetchGelatoGasPrice",
  `Returns the current gelato gas price used for calling canExec and exec`
)
  .addOptionalParam("gelatocoreaddress")
  .addFlag("log", "Logs return values to stdout")
  .setAction(async (taskArgs) => {
    try {
      const gelatoCore = await ethers.getContractAt(
        GelatoCoreLib.GelatoCore.abi,
        taskArgs.gelatocoreaddress
          ? taskArgs.gelatocoreaddress
          : network.config.deployments.GelatoCore
      );

      const oracleAbi = ["function latestAnswer() view returns (int256)"];

      const gelatoGasPriceOracleAddress = await gelatoCore.gelatoGasPriceOracle();

      // Get gelatoGasPriceOracleAddress
      const gelatoGasPriceOracle = await ethers.getContractAt(
        oracleAbi,
        gelatoGasPriceOracleAddress
      );

      // lastAnswer is used by GelatoGasPriceOracle as well as the Chainlink Oracle
      const gelatoGasPrice = await gelatoGasPriceOracle.latestAnswer();

      if (taskArgs.log) {
        console.log(
          `\ngelatoGasPrice: ${utils.formatUnits(
            gelatoGasPrice.toString(),
            "gwei"
          )} gwei\n`
        );
      }

      return gelatoGasPrice;
    } catch (error) {
      console.error(error, "\n");
      process.exit(1);
    }
  });
