cpk = await CPK.create({
    ethers,
    signer: myUserWallet,
    networks: {
      4: {
        masterCopyAddress: "0x6851d6fdfafd08c0295c392436245e5bc78b0185",
        proxyFactoryAddress: "0x336c19296d3989e9e0c2561ef21c964068657c38",
        multiSendAddress: "0xB522a9f781924eD250A11C54105E51840B138AdD",
        fallbackHandlerAddress: "0x40A930851BD2e590Bd5A5C981b436de25742E980",
      },
    },
  });