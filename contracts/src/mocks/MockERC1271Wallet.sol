// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title MockERC1271Wallet
 * @notice Mock ERC-1271 wallet for testing - validates signatures from a single owner EOA
 * @dev Includes execute() so owner can run arbitrary calls from the wallet (e.g. acceptTask, assertCompletion)
 */
contract MockERC1271Wallet is IERC1271 {
    address public owner;

    bytes4 private constant EIP1271_MAGIC_VALUE = 0x1626ba7e;
    bytes4 private constant EIP1271_INVALID = 0xffffffff;

    constructor(address _owner) {
        owner = _owner;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view override returns (bytes4) {
        address recovered = ECDSA.recover(hash, signature);
        return recovered == owner ? EIP1271_MAGIC_VALUE : EIP1271_INVALID;
    }

    /// @dev Execute arbitrary call from this wallet - callable by owner only (for testing)
    function execute(address target, bytes calldata data) external returns (bytes memory) {
        require(msg.sender == owner, "MockERC1271Wallet: only owner");
        (bool ok, bytes memory result) = target.call(data);
        require(ok, "MockERC1271Wallet: call failed");
        return result;
    }
}
