import Foundation
import Combine

@MainActor
final class CapabilityStore: ObservableObject {
    private let service: RuntimeService
    @Published private(set) var capabilities = RuntimeCapabilities.disconnected
    @Published private(set) var skills: [RuntimeSkillItem] = []
    @Published private(set) var tools: [RuntimeToolItem] = []
    @Published private(set) var boundSkillsByEmployee: [String: [RuntimeSkillItem]] = [:]
    @Published private(set) var selectedToolIDsByEmployee: [String: Set<String>] = [:]
    @Published private(set) var loadError: String?
    @Published private(set) var isLoading = false
    @Published var actionError: String?

    init(service: RuntimeService) {
        self.service = service
        if WorkLibraryDemoData.current != nil || ContactsDemoData.current != nil {
            return
        }
        Task { await reload() }
    }

    var tasksEnabled: Bool {
        if WorkLibraryDemoData.current != nil { return true }
        return capabilities.tasksEnabled
    }

    var isRuntimeConnectedForSkills: Bool { !skills.isEmpty }
    var isRuntimeConnectedForTools: Bool { !tools.isEmpty }

    func reload() async {
        guard WorkLibraryDemoData.current == nil, ContactsDemoData.current == nil else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            async let caps = service.capabilities()
            async let skillList = service.skillsList(nil)
            async let toolList = service.toolsList()
            capabilities = try await caps
            skills = try await skillList.skills
            tools = try await toolList.tools
            loadError = nil
        } catch {
            capabilities = .disconnected
            skills = []
            tools = []
            loadError = error.localizedDescription
        }
    }

    func reloadBoundSkills(for employeeID: String) async {
        guard WorkLibraryDemoData.current == nil, ContactsDemoData.current == nil else { return }
        do {
            let response = try await service.skillsList(employeeID)
            boundSkillsByEmployee[employeeID] = response.skills
            actionError = nil
        } catch {
            actionError = error.localizedDescription
        }
    }

    func syncSkills(for employeeID: String, selectedIDs: Set<String>) async {
        guard WorkLibraryDemoData.current == nil, ContactsDemoData.current == nil else { return }
        let catalog = Dictionary(uniqueKeysWithValues: skills.map { ($0.id, $0) })
        let current = Set(boundSkillsByEmployee[employeeID]?.map(\.id) ?? [])
        let toBind = selectedIDs.subtracting(current)
        let toUnbind = current.subtracting(selectedIDs)
        do {
            for id in toBind {
                guard let skill = catalog[id] else { continue }
                _ = try await service.bindSkill(employeeID, skill.id, skill.version)
            }
            for id in toUnbind {
                _ = try await service.unbindSkill(employeeID, id)
            }
            await reloadBoundSkills(for: employeeID)
            await reload()
            actionError = nil
        } catch {
            actionError = error.localizedDescription
        }
    }

    func setSelectedTools(for employeeID: String, ids: Set<String>) {
        selectedToolIDsByEmployee[employeeID] = ids
    }

    func capabilityProfile(for employeeID: String) -> EmployeeCapabilityProfile {
        let skillCatalog = skills.map(Self.skillItem)
        let toolCatalog = tools.map(Self.toolItem)
        let selectedSkills = (boundSkillsByEmployee[employeeID] ?? []).map(Self.skillItem)
        let selectedToolIDs = selectedToolIDsByEmployee[employeeID] ?? Set(tools.map(\.id))
        let selectedTools = toolCatalog.filter { selectedToolIDs.contains($0.id) }
        return EmployeeCapabilityProfile(
            selectedSkills: selectedSkills,
            selectedTools: selectedTools,
            permissions: [],
            skillCatalog: skillCatalog,
            toolCatalog: toolCatalog
        )
    }

    func libraryItems(for scope: CapabilityLibraryScope) -> [CapabilityLibraryItem] {
        if let demo = CapabilityLibraryDemoData.current(for: scope) {
            return demo
        }
        switch scope {
        case .skills:
            return skills.map { item in
                CapabilityLibraryItem(
                    id: item.id,
                    name: item.name,
                    version: item.version,
                    summary: item.summary.isEmpty ? "已安装 Skill Package" : item.summary,
                    category: "\(item.category) · 已安装",
                    status: item.available ? "可用" : "不可用",
                    icon: "sparkles",
                    markdown: "# \(item.name)\n\n\(item.summary)\n\n版本：\(item.version)\n路径：\(item.path ?? "—")\n\n此页面只读。Skill 需在仓库 `packages/skills` 中创建并安装，客户端不提供创建入口。",
                    directory: [],
                    documents: [:],
                    dependencySections: [
                        .init(title: "安装信息", rows: [
                            .init(label: "状态", value: item.status),
                            .init(label: "版本", value: item.version)
                        ])
                    ],
                    capabilitySections: [],
                    actions: []
                )
            }
        case .tools:
            return tools.map { item in
                CapabilityLibraryItem(
                    id: item.id,
                    name: item.name,
                    version: item.version,
                    summary: item.summary.isEmpty ? "已安装 Tool Package" : item.summary,
                    category: "\(item.category) · 已安装",
                    status: item.available ? "可用" : "不可用",
                    icon: "wrench.and.screwdriver",
                    markdown: "# \(item.name)\n\n\(item.summary)\n\n类型：\(item.type)\n版本：\(item.version)\n\n此页面只读。Tool 需在仓库 `packages/tools` 中创建并安装，客户端不提供创建入口。",
                    directory: [],
                    documents: [:],
                    dependencySections: [
                        .init(title: "安装信息", rows: [
                            .init(label: "类型", value: item.type),
                            .init(label: "状态", value: item.status),
                            .init(label: "版本", value: item.version)
                        ])
                    ],
                    capabilitySections: [],
                    actions: []
                )
            }
        }
    }

    private static func skillItem(_ item: RuntimeSkillItem) -> EmployeeCapabilityItem {
        EmployeeCapabilityItem(
            id: item.id, kind: .skill, name: item.name, version: item.version,
            detail: item.summary.isEmpty ? "已安装 Skill" : item.summary,
            metadata: item.category, isAvailable: item.available
        )
    }

    private static func toolItem(_ item: RuntimeToolItem) -> EmployeeCapabilityItem {
        EmployeeCapabilityItem(
            id: item.id, kind: .tool, name: item.name, version: item.version,
            detail: item.summary.isEmpty ? "已安装 Tool" : item.summary,
            metadata: item.type, isAvailable: item.available
        )
    }
}
