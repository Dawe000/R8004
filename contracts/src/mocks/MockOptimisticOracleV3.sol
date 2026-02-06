// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockOptimisticOracleV3
 * @notice Minimal mock OOv3 for testing - allows controlled resolution via pushResolution
 * In production, use real UMA OptimisticOracleV3
 */
interface IAssertionResolvedCallback {
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;
}

contract MockOptimisticOracleV3 {
    mapping(bytes32 => address) public callbackRecipient;
    mapping(bytes32 => bool) public settled;
    uint256 public nextAssertionIdCounter;

    event AssertionMade(bytes32 indexed assertionId, bytes claim, address asserter, address callbackRecipient);
    event AssertionDisputed(bytes32 indexed assertionId, address disputer);
    event AssertionResolved(bytes32 indexed assertionId, bool assertedTruthfully);

    function assertTruth(
        bytes memory claim,
        address asserter,
        address _callbackRecipient,
        address,   // escalationManager - ignored
        uint64,    // liveness - ignored
        address,   // currency - ignored (mock doesn't hold bonds)
        uint256,   // bond - ignored
        bytes32,   // identifier - ignored
        bytes32    // domainId - ignored
    ) external returns (bytes32 assertionId) {
        assertionId = keccak256(abi.encodePacked(claim, asserter, block.timestamp, nextAssertionIdCounter++));
        callbackRecipient[assertionId] = _callbackRecipient;
        require(_callbackRecipient != address(0), "MockOOv3: callback recipient required");
        emit AssertionMade(assertionId, claim, asserter, _callbackRecipient);
        return assertionId;
    }

    function disputeAssertion(bytes32 assertionId, address disputer) external {
        require(!settled[assertionId], "MockOOv3: already settled");
        emit AssertionDisputed(assertionId, disputer);
    }

    function settleAssertion(bytes32 assertionId) external returns (bool) {
        require(!settled[assertionId], "MockOOv3: already settled");
        settled[assertionId] = true;
        // For non-disputed: call callback with true (asserter wins)
        address recipient = callbackRecipient[assertionId];
        if (recipient != address(0)) {
            IAssertionResolvedCallback(recipient).assertionResolvedCallback(assertionId, true);
        }
        emit AssertionResolved(assertionId, true);
        return true;
    }

    /**
     * @notice Resolve a disputed assertion - callable by anyone for testing
     * Simulates UMA DVM/MockOracle deciding the outcome
     */
    function pushResolution(bytes32 assertionId, bool assertedTruthfully) external {
        require(!settled[assertionId], "MockOOv3: already settled");
        settled[assertionId] = true;
        address recipient = callbackRecipient[assertionId];
        require(recipient != address(0), "MockOOv3: no callback recipient");
        IAssertionResolvedCallback(recipient).assertionResolvedCallback(assertionId, assertedTruthfully);
        emit AssertionResolved(assertionId, assertedTruthfully);
    }
}
