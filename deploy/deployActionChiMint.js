module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const chiToken = await deployments.get("ChiToken");

  // the following will only deploy "GenericMetaTxProcessor" if the contract was never deployed or if the code changed since last deployment
  await deploy("ActionChiMint", {
    from: deployer,
    gas: 4000000,
    args: [chiToken.address],
  });
};

module.exports.dependencies = ["ChiToken"];
