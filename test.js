cpk = await CPK.create({
    ethers,
    signer: myUserWallet,
    networks: {
      4: { masterCopyAddress: "0x6851d6fdfafd08c0295c392436245e5bc78b0185" },
    },
  });