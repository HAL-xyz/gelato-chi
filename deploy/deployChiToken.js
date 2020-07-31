module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // the following will only deploy "GenericMetaTxProcessor" if the contract was never deployed or if the code changed since last deployment
  await deploy("ChiToken", {
    from: deployer,
    gas: 4000000,
  });
};

module.exports.tags = ["ChiToken"];
