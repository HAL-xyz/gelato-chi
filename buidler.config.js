// ES6 module imports via require
require("@babel/register");

// Libraries
const assert = require("assert");

// Process Env Variables
require("dotenv").config();
const INFURA_ID = process.env.DEMO_INFURA_ID;
const USER_PK = process.env.DEMO_USER_PK;
assert.ok(INFURA_ID, "no Infura ID in process.env");
assert.ok(USER_PK, "no User private key (USER_PK) found in .env");

// ================================= CONFIG =========================================
module.exports = {
  defaultNetwork: "buidlerevm",
  networks: {
    rinkeby: {
      // Standard
      accounts: [USER_PK],
      chainId: 4,
      // gas: 4000000,  // 4 million
      // gasPrice: "auto",
      url: `https://rinkeby.infura.io/v3/${INFURA_ID}`,
      // Custom
      // Rinkeby: addressBook
      addressBook: {
        // Rinkeby: erc20s
        erc20: {
          CHI: "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa",
          "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa": "DAI",
        },
        // Rinkeby: Gelato
        gelatoExecutor: {
          default: "0xa5A98a6AD379C7B578bD85E35A3eC28AD72A336b", // PermissionedExecutors
        },
      },
      // Rinkeby: Deployments
      deployments: {
        // ==== Actions ====
        ActionMintChi: "0xe2B2f27D674F49fB3d67D6D21F5d85EFe2B95635",
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
    version: "0.6.12",
    optimizer: { enabled: true },
  },
};

// ================================= BRE extension ==================================
extendEnvironment((bre) => {
  bre.getUserWallet = async () => {
    const [userWallet] = await bre.ethers.getSigners();
    return userWallet;
  };
  bre.getUserAddress = async () => {
    const [userWallet] = await bre.ethers.getSigners();
    const userAddress = await userWallet.getAddress();
    return userAddress;
  };
});

// ================================= PLUGINS =========================================
usePlugin("@nomiclabs/buidler-ethers");
usePlugin("@nomiclabs/buidler-waffle");
