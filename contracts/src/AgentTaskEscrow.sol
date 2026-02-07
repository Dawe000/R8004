// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import "./interfaces/IAgentTaskEscrow.sol";

/**
 * @title AgentTaskEscrow
 * @notice ERC8001 Agent Task System - escrow for agent tasks with UMA dispute resolution
 */
contract AgentTaskEscrow is IAgentTaskEscrow {
    using SafeERC20 for IERC20;

    struct OOv3Config {
        address oracle;
        uint64 liveness;
        bytes32 identifier;
        uint256 minimumBond;
    }

    mapping(uint256 => Task) public tasks;
    mapping(uint256 => bool) public paymentDeposited;
    uint256 public nextTaskId;
    address public marketMaker;
    uint256 public marketMakerFeeBps;

    uint256 public cooldownPeriod;
    uint256 public agentResponseWindow;
    uint256 public disputeBondBps;
    uint256 public escalationBondBps;

    OOv3Config public umaConfig;

    error TaskNotFound(uint256 taskId);
    error TaskAlreadyAccepted(uint256 taskId);
    error TaskAlreadyAsserted(uint256 taskId);
    error NotTaskAgent(uint256 taskId, address caller);
    error NotTaskClient(uint256 taskId, address caller);
    error InvalidTaskStatus(uint256 taskId, TaskStatus current, TaskStatus required);
    error InsufficientStake(uint256 required, uint256 provided);
    error InsufficientBond(uint256 required, uint256 provided);
    error CooldownNotExpired(uint256 taskId, uint256 expiresAt);
    error DeadlineNotPassed(uint256 taskId, uint256 deadline);
    error InvalidSignature(address expected, address recovered);
    error InvalidResultHash(bytes32 expected, bytes32 provided);
    error InvalidCaller();

    constructor(
        address _marketMaker,
        uint256 _marketMakerFeeBps,
        uint256 _cooldownPeriod,
        uint256 _agentResponseWindow,
        uint256 _disputeBondBps,
        uint256 _escalationBondBps,
        address _umaOracle,
        uint64 _umaLiveness,
        bytes32 _umaIdentifier,
        uint256 _umaMinimumBond
    ) {
        marketMaker = _marketMaker;
        marketMakerFeeBps = _marketMakerFeeBps;
        cooldownPeriod = _cooldownPeriod;
        agentResponseWindow = _agentResponseWindow;
        disputeBondBps = _disputeBondBps;
        escalationBondBps = _escalationBondBps;
        umaConfig = OOv3Config(_umaOracle, _umaLiveness, _umaIdentifier, _umaMinimumBond);
    }

    function createTask(
        string calldata descriptionURI,
        address paymentToken,
        uint256 paymentAmount,
        uint256 deadline
    ) external returns (uint256 taskId) {
        taskId = nextTaskId++;
        tasks[taskId] = Task({
            id: taskId,
            client: msg.sender,
            agent: address(0),
            paymentToken: paymentToken,
            paymentAmount: paymentAmount,
            agentStake: 0,
            createdAt: block.timestamp,
            deadline: deadline,
            cooldownEndsAt: 0,
            status: TaskStatus.Created,
            resultHash: bytes32(0),
            agentSignature: "",
            clientDisputeBond: 0,
            agentEscalationBond: 0,
            clientEvidenceURI: "",
            agentEvidenceURI: "",
            resultURI: "",
            umaAssertionId: bytes32(0),
            umaResultTruth: false
        });
        emit TaskCreated(taskId, msg.sender, descriptionURI);
        return taskId;
    }

    function acceptTask(uint256 taskId, uint256 stakeAmount) external {
        Task storage t = tasks[taskId];
        if (t.status != TaskStatus.Created) revert TaskAlreadyAccepted(taskId);
        t.agent = msg.sender;
        t.agentStake = stakeAmount;
        t.status = TaskStatus.Accepted;
        IERC20(t.paymentToken).safeTransferFrom(msg.sender, address(this), stakeAmount);
        emit TaskAccepted(taskId, msg.sender, stakeAmount);
    }

    function depositPayment(uint256 taskId) external {
        Task storage t = tasks[taskId];
        if (t.status != TaskStatus.Accepted) revert InvalidTaskStatus(taskId, t.status, TaskStatus.Accepted);
        if (msg.sender != t.client) revert NotTaskClient(taskId, msg.sender);
        IERC20(t.paymentToken).safeTransferFrom(msg.sender, address(this), t.paymentAmount);
        paymentDeposited[taskId] = true;
        emit PaymentDeposited(taskId, t.paymentToken, t.paymentAmount);
    }

    function assertCompletion(
        uint256 taskId,
        bytes32 resultHash,
        bytes calldata agentSignature,
        string calldata resultURI
    ) external {
        Task storage t = tasks[taskId];
        if (t.status != TaskStatus.Accepted) revert InvalidTaskStatus(taskId, t.status, TaskStatus.Accepted);
        if (msg.sender != t.agent) revert NotTaskAgent(taskId, msg.sender);

        bytes32 messageHash = keccak256(abi.encode(taskId, resultHash));
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        if (!SignatureChecker.isValidSignatureNow(t.agent, ethSignedHash, agentSignature)) {
            revert InvalidSignature(t.agent, address(0));
        }

        t.resultHash = resultHash;
        t.agentSignature = agentSignature;
        t.resultURI = resultURI;
        t.cooldownEndsAt = block.timestamp + cooldownPeriod;
        t.status = TaskStatus.ResultAsserted;
        emit TaskResultAsserted(taskId, resultHash, msg.sender);
    }

    function disputeTask(uint256 taskId, string calldata clientEvidenceURI) external payable {
        Task storage t = tasks[taskId];
        if (t.status != TaskStatus.ResultAsserted) revert InvalidTaskStatus(taskId, t.status, TaskStatus.ResultAsserted);
        if (msg.sender != t.client) revert NotTaskClient(taskId, msg.sender);
        if (block.timestamp >= t.cooldownEndsAt) revert CooldownNotExpired(taskId, t.cooldownEndsAt);

        uint256 bond = _computeDisputeBond(t.paymentAmount);
        if (IERC20(t.paymentToken).balanceOf(msg.sender) < bond) revert InsufficientBond(bond, IERC20(t.paymentToken).balanceOf(msg.sender));
        IERC20(t.paymentToken).safeTransferFrom(msg.sender, address(this), bond);

        t.clientDisputeBond = bond;
        t.clientEvidenceURI = clientEvidenceURI;
        t.status = TaskStatus.DisputedAwaitingAgent;
        emit TaskDisputed(taskId, msg.sender, bond, clientEvidenceURI);
    }

    function escalateToUMA(uint256 taskId, string calldata agentEvidenceURI) external payable {
        Task storage t = tasks[taskId];
        if (t.status != TaskStatus.DisputedAwaitingAgent) revert InvalidTaskStatus(taskId, t.status, TaskStatus.DisputedAwaitingAgent);
        if (msg.sender != t.agent) revert NotTaskAgent(taskId, msg.sender);

        uint256 bond = _computeEscalationBond(t.paymentAmount);
        if (bond < umaConfig.minimumBond) bond = umaConfig.minimumBond;
        IERC20(t.paymentToken).safeTransferFrom(msg.sender, address(this), bond);

        t.agentEscalationBond = bond;
        t.agentEvidenceURI = agentEvidenceURI;
        t.status = TaskStatus.EscalatedToUMA;

        bytes memory claim = _encodeClaim(taskId, t.client, t.agent, t.resultHash, t.clientEvidenceURI, agentEvidenceURI);

        (bool ok, bytes memory data) = umaConfig.oracle.call(
            abi.encodeWithSignature(
                "assertTruth(bytes,address,address,address,uint64,address,uint256,bytes32,bytes32)",
                claim,
                address(this),
                address(this),
                address(0),
                umaConfig.liveness,
                t.paymentToken,
                bond,
                umaConfig.identifier,
                bytes32(0)
            )
        );
        require(ok, "OOv3 assertTruth failed");
        bytes32 assertionId = abi.decode(data, (bytes32));
        t.umaAssertionId = assertionId;

        emit TaskDisputeEscalated(taskId, msg.sender, bond, agentEvidenceURI, assertionId);
    }

    function timeoutCancellation(uint256 taskId, string calldata) external {
        Task storage t = tasks[taskId];
        if (t.status != TaskStatus.Created && t.status != TaskStatus.Accepted) revert InvalidTaskStatus(taskId, t.status, TaskStatus.Accepted);
        if (t.deadline == 0) revert DeadlineNotPassed(taskId, 0);
        if (block.timestamp < t.deadline) revert DeadlineNotPassed(taskId, t.deadline);
        if (msg.sender != t.client) revert NotTaskClient(taskId, msg.sender);

        t.status = TaskStatus.TimeoutCancelled;

        if (paymentDeposited[taskId]) {
            IERC20(t.paymentToken).safeTransfer(t.client, t.paymentAmount);
        }
        if (t.agentStake > 0) {
            IERC20(t.paymentToken).safeTransfer(t.client, t.agentStake);
        }
        emit TaskTimeoutCancelled(taskId);
    }

    function cannotComplete(uint256 taskId, string calldata) external {
        Task storage t = tasks[taskId];
        if (t.status != TaskStatus.Accepted) revert InvalidTaskStatus(taskId, t.status, TaskStatus.Accepted);
        if (msg.sender != t.agent) revert NotTaskAgent(taskId, msg.sender);

        t.status = TaskStatus.AgentFailed;
        IERC20(t.paymentToken).safeTransfer(t.agent, t.agentStake);
        if (paymentDeposited[taskId]) {
            IERC20(t.paymentToken).safeTransfer(t.client, t.paymentAmount);
        }
        emit TaskAgentFailure(taskId, "");
    }

    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external {
        if (msg.sender != umaConfig.oracle) revert InvalidCaller();

        uint256 taskId = _findTaskByAssertion(assertionId);
        Task storage t = tasks[taskId];
        if (t.status != TaskStatus.EscalatedToUMA) revert InvalidTaskStatus(taskId, t.status, TaskStatus.EscalatedToUMA);
        if (t.umaAssertionId != assertionId) revert InvalidCaller();

        t.umaResultTruth = assertedTruthfully;
        t.status = TaskStatus.Resolved;
        _settleEscalatedTask(taskId, assertedTruthfully);
        emit TaskResolved(taskId, TaskStatus.Resolved, assertedTruthfully);
    }

    function settleNoContest(uint256 taskId) external {
        Task storage t = tasks[taskId];
        if (t.status != TaskStatus.ResultAsserted) revert InvalidTaskStatus(taskId, t.status, TaskStatus.ResultAsserted);
        if (block.timestamp < t.cooldownEndsAt) revert CooldownNotExpired(taskId, t.cooldownEndsAt);

        t.status = TaskStatus.Resolved;
        _settleHappyPath(taskId);
        emit TaskResolved(taskId, TaskStatus.Resolved, true);
    }

    function settleAgentConceded(uint256 taskId) external {
        Task storage t = tasks[taskId];
        if (t.status != TaskStatus.DisputedAwaitingAgent) revert InvalidTaskStatus(taskId, t.status, TaskStatus.DisputedAwaitingAgent);
        if (block.timestamp < t.cooldownEndsAt + agentResponseWindow) revert CooldownNotExpired(taskId, t.cooldownEndsAt + agentResponseWindow);

        t.status = TaskStatus.Resolved;
        _settleClientWins(taskId);
        emit TaskResolved(taskId, TaskStatus.Resolved, false);
    }

    function getTask(uint256 taskId) external view returns (Task memory) {
        return tasks[taskId];
    }

    mapping(bytes32 => uint256) private _assertionToTask;

    function _encodeClaim(
        uint256 taskId,
        address client,
        address agent,
        bytes32 resultHash,
        string memory clientEvidenceURI,
        string memory agentEvidenceURI
    ) internal pure returns (bytes memory) {
        return abi.encode(
            "AGENT_TASK_COMPLETION_V1",
            taskId,
            client,
            agent,
            resultHash,
            clientEvidenceURI,
            agentEvidenceURI
        );
    }

    function _findTaskByAssertion(bytes32 assertionId) internal view returns (uint256) {
        for (uint256 i = 0; i < nextTaskId; i++) {
            if (tasks[i].umaAssertionId == assertionId) return i;
        }
        revert TaskNotFound(type(uint256).max);
    }

    function _computeDisputeBond(uint256 paymentAmount) internal view returns (uint256) {
        return (paymentAmount * disputeBondBps) / 10000;
    }

    function _computeEscalationBond(uint256 paymentAmount) internal view returns (uint256) {
        return (paymentAmount * escalationBondBps) / 10000;
    }

    function _settleHappyPath(uint256 taskId) internal {
        Task storage t = tasks[taskId];
        uint256 fee = (t.paymentAmount * marketMakerFeeBps) / 10000;
        uint256 agentPayout = t.paymentAmount - fee + t.agentStake;

        IERC20(t.paymentToken).safeTransfer(t.agent, agentPayout);
        if (fee > 0 && marketMaker != address(0)) {
            IERC20(t.paymentToken).safeTransfer(marketMaker, fee);
        }
    }

    function _settleClientWins(uint256 taskId) internal {
        Task storage t = tasks[taskId];
        IERC20(t.paymentToken).safeTransfer(t.client, t.paymentAmount + t.clientDisputeBond);
        IERC20(t.paymentToken).safeTransfer(t.client, t.agentStake);
    }

    function _settleEscalatedTask(uint256 taskId, bool agentWon) internal {
        Task storage t = tasks[taskId];
        if (agentWon) {
            uint256 fee = (t.paymentAmount * marketMakerFeeBps) / 10000;
            uint256 agentPayout = t.paymentAmount - fee + t.agentStake + t.agentEscalationBond + t.clientDisputeBond;
            IERC20(t.paymentToken).safeTransfer(t.agent, agentPayout);
            if (fee > 0 && marketMaker != address(0)) {
                IERC20(t.paymentToken).safeTransfer(marketMaker, fee);
            }
        } else {
            uint256 clientPayout = t.paymentAmount + t.clientDisputeBond + t.agentStake + t.agentEscalationBond;
            IERC20(t.paymentToken).safeTransfer(t.client, clientPayout);
        }
    }
}
