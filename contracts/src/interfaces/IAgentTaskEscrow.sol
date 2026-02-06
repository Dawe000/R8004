// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAgentTaskEscrow {
    enum TaskStatus {
        None,
        Created,
        Accepted,
        ResultAsserted,
        DisputedAwaitingAgent,
        EscalatedToUMA,
        TimeoutCancelled,
        AgentFailed,
        Resolved
    }

    struct Task {
        uint256 id;
        address client;
        address agent;
        address paymentToken;
        uint256 paymentAmount;
        uint256 agentStake;
        uint256 createdAt;
        uint256 deadline;
        uint256 cooldownEndsAt;
        TaskStatus status;
        bytes32 resultHash;
        bytes agentSignature;
        uint256 clientDisputeBond;
        uint256 agentEscalationBond;
        string clientEvidenceURI;
        string agentEvidenceURI;
        bytes32 umaAssertionId;
        bool umaResultTruth;
    }

    event TaskCreated(uint256 indexed taskId, address indexed client, string descriptionURI);
    event TaskAccepted(uint256 indexed taskId, address indexed agent, uint256 stake);
    event PaymentDeposited(uint256 indexed taskId, address token, uint256 amount);
    event TaskResultAsserted(uint256 indexed taskId, bytes32 resultHash, address agent);
    event TaskDisputed(uint256 indexed taskId, address indexed client, uint256 bond, string evidenceURI);
    event TaskDisputeEscalated(uint256 indexed taskId, address indexed agent, uint256 bond, string evidenceURI, bytes32 assertionId);
    event TaskResolved(uint256 indexed taskId, TaskStatus status, bool agentWon);
    event TaskTimeoutCancelled(uint256 indexed taskId);
    event TaskAgentFailure(uint256 indexed taskId, string reason);

    function createTask(
        string calldata descriptionURI,
        address paymentToken,
        uint256 paymentAmount,
        uint256 deadline
    ) external returns (uint256 taskId);

    function acceptTask(uint256 taskId, uint256 stakeAmount) external;

    function depositPayment(uint256 taskId) external;

    function assertCompletion(
        uint256 taskId,
        bytes32 resultHash,
        bytes calldata agentSignature
    ) external;

    function disputeTask(
        uint256 taskId,
        string calldata clientEvidenceURI
    ) external payable;

    function escalateToUMA(
        uint256 taskId,
        string calldata agentEvidenceURI
    ) external payable;

    function timeoutCancellation(uint256 taskId, string calldata reason) external;

    function cannotComplete(uint256 taskId, string calldata reason) external;

    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;

    function getTask(uint256 taskId) external view returns (Task memory);
}
