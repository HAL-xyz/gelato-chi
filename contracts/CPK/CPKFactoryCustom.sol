// https://github.com/gnosis/contract-proxy-kit/blob/master/contracts/CPKFactory.sol
// Adjusted to fix bug: https://github.com/gnosis/contract-proxy-kit/issues/90
// Adjusted to have payable modifier
pragma solidity >=0.6.0 <0.7.0;

import { Enum } from "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import { Proxy } from "@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxy.sol";
import { GnosisSafe } from "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";

contract CPKFactoryCustom {
    event ProxyCreation(Proxy proxy);

    function proxyCreationCode() external pure returns (bytes memory) {
        return type(Proxy).creationCode;
    }

    function createProxyAndExecTransaction(
        address masterCopy,
        uint256 saltNonce,
        address fallbackHandler,
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation
    )
        external
        payable
        returns (bool execTransactionSuccess)
    {
        GnosisSafe proxy;
        bytes memory deploymentData = abi.encodePacked(
            type(Proxy).creationCode,
            abi.encode(masterCopy)
        );
        bytes32 salt = keccak256(abi.encode(msg.sender, saltNonce));
        // solium-disable-next-line security/no-inline-assembly

        // Deploy Proxy with create2
        assembly {
            proxy := create2(0x0, add(0x20, deploymentData), mload(deploymentData), salt)
        }
        require(address(proxy) != address(0), "create2 call failed");

        {
            address[] memory tmp = new address[](1);
            tmp[0] = address(this);

            // Setup Proxy with CPKFactory as owner
            try proxy.setup(
                tmp,
                1,
                address(0),
                "",
                fallbackHandler,
                address(0),
                0,
                address(0)
            ) {
            } catch Error(string memory error) {
                revert(
                    string(abi.encodePacked("CPKFactoryCustom.create.setup:", error))
                );
            } catch {
                revert("CPKFactoryCustom.create.setup:unknown error");
            }
        }

        // Exec arbitrary Logic (could use multisend)
        try proxy.execTransaction{value: msg.value}(
            to,
            value,
            data,
            operation,
            0,
            0,
            0,
            address(0),
            address(0),
            abi.encodePacked(uint(address(this)), uint(0), uint8(1))
        ) returns (bool success) {
            execTransactionSuccess = success;
        } catch Error(string memory error) {
            revert(
                string(abi.encodePacked("CPKFactoryCustom.create.execTransaction:", error))
            );
        } catch {
            revert("CPKFactoryCustom.create.execTransaction:unknown error");
        }

        // SwapOwner from CPKFactory to msg.sender
        try proxy.execTransaction(
            address(proxy), 0,
            abi.encodeWithSignature(
                "swapOwner(address,address,address)",
                address(1),  // prevOwner in linked list (SENTINEL)
                address(this),  // oldOwner (CPKFactory)
                msg.sender  // newOwner (User/msg.sender)
            ),
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            address(0),
            abi.encodePacked(uint(address(this)), uint(0), uint8(1))
        ) returns (bool success) {
            emit ProxyCreation(Proxy(address(proxy)));
        } catch Error(string memory error) {
            revert(
                string(abi.encodePacked("CPKFactoryCustom.create.swapOwner:", error))
            );
        } catch {
            revert("CPKFactoryCustom.create.swapOwner:unknown error");
        }
   }
}