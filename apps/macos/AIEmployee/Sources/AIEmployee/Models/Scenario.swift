import Foundation

struct ScenarioSummary: Codable, Identifiable, Sendable {
    let id: String
    let title: String
    let description: String
    let status: String
    let currentVersion: Int
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, title, description, status
        case currentVersion = "current_version"
        case updatedAt = "updated_at"
    }
}

struct ScenarioBudget: Codable, Sendable, Equatable {
    var maxInputTokens: Int = 4_000
    var maxOutputTokens: Int = 2_000
    var maxToolRounds: Int = 4
    var maxElapsedMS: Int = 120_000

    enum CodingKeys: String, CodingKey {
        case maxInputTokens = "max_input_tokens"
        case maxOutputTokens = "max_output_tokens"
        case maxToolRounds = "max_tool_rounds"
        case maxElapsedMS = "max_elapsed_ms"
    }
}

struct AcceptanceCriterion: Codable, Sendable, Equatable {
    var criterionID: String
    var description: String
    var evidenceType: String
    var required: Bool

    enum CodingKeys: String, CodingKey {
        case criterionID = "criterion_id"
        case description
        case evidenceType = "evidence_type"
        case required
    }
}

struct ScenarioNode: Codable, Identifiable, Sendable, Equatable {
    var nodeID: String
    var role: String
    var goal: String
    var suggestedAgentID: String
    var requiredCapabilities: [String]
    var inputRefs: [String]
    var acceptanceCriteria: [AcceptanceCriterion]
    var budget: ScenarioBudget
    var failurePolicy: String

    var id: String { nodeID }

    enum CodingKeys: String, CodingKey {
        case nodeID = "node_id"
        case role, goal
        case suggestedAgentID = "suggested_agent_id"
        case requiredCapabilities = "required_capabilities"
        case inputRefs = "input_refs"
        case acceptanceCriteria = "acceptance_criteria"
        case budget
        case failurePolicy = "failure_policy"
    }
}

struct ScenarioEdge: Codable, Sendable, Equatable {
    var predecessorNodeID: String
    var successorNodeID: String
    var required: Bool = true

    enum CodingKeys: String, CodingKey {
        case predecessorNodeID = "predecessor_node_id"
        case successorNodeID = "successor_node_id"
        case required
    }
}

struct ScenarioProposal: Codable, Sendable, Equatable {
    var schemaVersion = "1.0.0"
    var proposalID: String
    var title: String
    var objective: String
    var overallAcceptanceCriteria: [AcceptanceCriterion]
    var coordinatorAgentID: String
    var nodes: [ScenarioNode]
    var edges: [ScenarioEdge]
    var assumptions: [String] = []
    var risks: [String] = []
    var questionsForUser: [String] = []

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case proposalID = "proposal_id"
        case title, objective
        case overallAcceptanceCriteria = "overall_acceptance_criteria"
        case coordinatorAgentID = "coordinator_agent_id"
        case nodes, edges, assumptions, risks
        case questionsForUser = "questions_for_user"
    }
}

struct ScenarioSaved: Codable, Sendable {
    let id: String
    let versionID: String
    let version: Int
    let source: String
    let sha256: String
    let definition: ScenarioProposal
    let confirmedAt: String

    enum CodingKeys: String, CodingKey {
        case id, version, source, sha256, definition
        case versionID = "version_id"
        case confirmedAt = "confirmed_at"
    }
}

struct ScenarioProposalResponse: Codable, Sendable {
    let proposal: ScenarioProposal
    let proposalHash: String
    let executionOrder: [String]
    let persisted: Bool

    enum CodingKeys: String, CodingKey {
        case proposal
        case proposalHash = "proposal_hash"
        case executionOrder = "execution_order"
        case persisted
    }
}

struct BusinessFlowPlan: Codable, Sendable {
    let scenarioID: String
    let scenarioVersionID: String
    let planHash: String
    let executionOrder: [String]

    enum CodingKeys: String, CodingKey {
        case scenarioID = "scenario_id"
        case scenarioVersionID = "scenario_version_id"
        case planHash = "plan_hash"
        case executionOrder = "execution_order"
    }
}

struct WorkOrderProjection: Codable, Identifiable, Sendable {
    let id: String
    let nodeID: String
    let childTaskID: String
    let assigneeAgentID: String
    let role: String
    let goal: String
    let status: String
    let revision: Int
    let runID: String?
    let runPhase: String?
    let actionID: String?

    enum CodingKeys: String, CodingKey {
        case id, role, goal, status, revision
        case nodeID = "node_id"
        case childTaskID = "child_task_id"
        case assigneeAgentID = "assignee_agent_id"
        case runID = "run_id"
        case runPhase = "run_phase"
        case actionID = "action_id"
    }
}

struct BusinessFlowProjection: Codable, Identifiable, Sendable {
    let businessFlowID: String
    let rootTaskID: String
    let scenarioID: String
    let scenarioVersionID: String
    let scenarioSHA256: String
    let title: String
    let objective: String
    let status: String
    let rootDeliverableID: String?
    let workOrders: [WorkOrderProjection]

    var id: String { businessFlowID }

    enum CodingKeys: String, CodingKey {
        case title, objective, status
        case businessFlowID = "business_flow_id"
        case rootTaskID = "root_task_id"
        case scenarioID = "scenario_id"
        case scenarioVersionID = "scenario_version_id"
        case scenarioSHA256 = "scenario_sha256"
        case rootDeliverableID = "root_deliverable_id"
        case workOrders = "work_orders"
    }
}

struct BusinessFlowRunState: Codable, Sendable {
    let taskID: String
    let runID: String
    let status: String
    let phase: String
    let reason: String?
    let actionID: String?

    enum CodingKeys: String, CodingKey {
        case taskID = "task_id"
        case runID = "run_id"
        case status, phase, reason
        case actionID = "action_id"
    }
}

struct BusinessFlowContinueResponse: Decodable, Sendable {
    let flow: BusinessFlowProjection
    let run: BusinessFlowRunState?

    private enum CodingKeys: String, CodingKey { case flow, run, businessFlowID = "business_flow_id" }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if container.contains(.businessFlowID) {
            flow = try BusinessFlowProjection(from: decoder)
            run = nil
        } else {
            flow = try container.decode(BusinessFlowProjection.self, forKey: .flow)
            run = try container.decodeIfPresent(BusinessFlowRunState.self, forKey: .run)
        }
    }
}
