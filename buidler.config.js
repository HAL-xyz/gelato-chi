// Libraries
// const assert = require("assert");
const { utils } = require("ethers");

// Classes
const Action = require("./src/classes/gelato/Action");
const Condition = require("./src/classes/gelato/Condition");
const GelatoProvider = require("./src/classes/gelato/GelatoProvider");
const Task = require("./src/classes/gelato/Task");
const TaskSpec = require("./src/classes/gelato/TaskSpec");
const TaskReceipt = require("./src/classes/gelato/TaskReceipt");

// Objects/Enums
const Operation = require("./src/enums/gelato/Operation");
const DataFlow = require("./src/enums/gelato/DataFlow");

// Helpers
// Async
const sleep = require("./src/helpers/async/sleep");
// Gelato
const convertTaskReceiptArrayToObj = require("./src/helpers/gelato/convertTaskReceiptArrayToObj");
const convertTaskReceiptObjToArray = require("./src/helpers/gelato/convertTaskReceiptObjToArray");
// Nested Arrays
const nestedArraysAreEqual = require("./src/helpers/nestedArrays/nestedArraysAreEqual");
// Nested Objects
const checkNestedObj = require("./src/helpers/nestedObjects/checkNestedObj");
const getNestedObj = require("./src/helpers/nestedObjects/getNestedObj");

// Process Env Variables
require("dotenv").config();
const INFURA_ID = process.env.DEMO_INFURA_ID;
const USER_PK = process.env.DEMO_USER_PK;
// // assert.ok(INFURA_ID, "no Infura ID in process.env");
// // assert.ok(USER_PK, "no User private key (USER_PK) found in .env");

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
        // Rinkeby: erc20s
        erc20: {
          CHI: "",
          "": "CHI",
        },
        // Rinkeby: Gelato
        gelatoExecutor: {
          default: "0xa5A98a6AD379C7B578bD85E35A3eC28AD72A336b", // PermissionedExecutors
        },
      },
      // Rinkeby: Deployments
      deployments: {
        // ==== Actions ====
        ActionChiMint: "",
        // ===== Gelato Core ====
        GelatoCore: "0x733aDEf4f8346FD96107d8d6605eA9ab5645d632",
        // === GelatoUserProxies ===
        GelatoUserProxyFactory: "0x0309EC714C7E7c4C5B94bed97439940aED4F0624",
        // ===== Provider Modules ====
        ProviderModuleGelatoUserProxy:
          "0x66a35534126B4B0845A2aa03825b95dFaaE88B0C",
      },
    },
  },
  solc: {
    version: "0.6.10",
    optimizer: { enabled: true },
  },
};

// ================================= BRE extension ==================================
extendEnvironment((bre) => {
  // Classes
  bre.Action = Action;
  bre.Condition = Condition;
  bre.GelatoProvider = GelatoProvider;
  bre.Task = Task;
  bre.TaskSpec = TaskSpec;
  bre.TaskReceipt = TaskReceipt;
  // Objects/Enums
  bre.Operation = Operation;
  bre.DataFlow = DataFlow;
  // Functions
  // Gelato
  bre.convertTaskReceiptArrayToObj = convertTaskReceiptArrayToObj;
  bre.convertTaskReceiptObjToArray = convertTaskReceiptObjToArray;
  // Nested Arrays
  bre.nestedArraysAreEqual = nestedArraysAreEqual;
  // Nested Objects
  bre.checkNestedObj = checkNestedObj;
  bre.getNestedObj = getNestedObj;
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

      if (!checkNestedObj(interFace, "functions", taskArgs.functionname))
        throw new Error("\nfunctionname is not on contract's interface");

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
