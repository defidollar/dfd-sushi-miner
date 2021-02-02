pragma solidity 0.6.11;

import {Proxy} from "./Proxy.sol";
import {GovernableProxy} from "./GovernableProxy.sol";

contract UpgradableProxy is GovernableProxy, Proxy {
    bytes32 constant IMPLEMENTATION_SLOT = keccak256("proxy.implementation");

    event ProxyUpdated(address indexed previousImpl, address indexed newImpl);

    fallback() external {
        delegatedFwd(implementation(), msg.data);
    }

    function implementation() override public view returns(address _impl) {
        bytes32 position = IMPLEMENTATION_SLOT;
        assembly {
            _impl := sload(position)
        }
    }

    // ACLed on onlyOwner via the call to updateImplementation()
    function updateAndCall(address _newProxyTo, bytes memory data) public {
        updateImplementation(_newProxyTo);
        // sometimes required to initialize the contract
        (bool success, bytes memory returnData) = address(this).call(data);
        require(success, string(returnData));
    }

    function updateImplementation(address _newProxyTo) public onlyOwner {
        require(_newProxyTo != address(0x0), "INVALID_PROXY_ADDRESS");
        require(isContract(_newProxyTo), "DESTINATION_ADDRESS_IS_NOT_A_CONTRACT");
        emit ProxyUpdated(implementation(), _newProxyTo);
        setImplementation(_newProxyTo);
    }

    function setImplementation(address _newProxyTo) private {
        bytes32 position = IMPLEMENTATION_SLOT;
        assembly {
            sstore(position, _newProxyTo)
        }
    }

    function isContract(address _target) internal view returns (bool) {
        if (_target == address(0)) {
            return false;
        }
        uint size;
        assembly {
            size := extcodesize(_target)
        }
        return size > 0;
    }
}
