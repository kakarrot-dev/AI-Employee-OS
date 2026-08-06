import Foundation
import Combine

@MainActor
final class EmployeeStore: ObservableObject {
    private let service: RuntimeService
    @Published var employees: [Employee] = []
    @Published var selection: String?
    @Published var isLoading = true
    @Published var isPresentingEditor = false
    @Published var editingEmployee: Employee?
    @Published var error: String?
    @Published var notice: UXToastNotice?

    init(service: RuntimeService) {
        self.service = service
        Task { await reload() }
    }

    var selected: Employee? { employees.first { $0.id == selection } }

    func reload() async {
        isLoading = true
        do {
            employees = try await service.employeeList().employees
            if selection == nil || !employees.contains(where: { $0.id == selection }) { selection = employees.first(where: { $0.status == "active" })?.id }
            error = nil
        } catch { self.error = error.localizedDescription }
        isLoading = false
    }

    func create() { editingEmployee = .draft(); isPresentingEditor = true }
    func edit(_ employee: Employee) { editingEmployee = employee; isPresentingEditor = true }

    func save(_ employee: Employee) async -> Bool {
        do {
            _ = try await service.employeeSave(employee)
            selection = employee.id
            await reload()
            isPresentingEditor = false
            notice = UXToastNotice(message: "员工资料已保存", tone: .success)
            return true
        } catch { self.error = error.localizedDescription; return false }
    }

    func remove(_ employee: Employee) async {
        do {
            _ = try await service.employeeDelete(employee.id)
            await reload()
            notice = UXToastNotice(message: "员工资料已更新", tone: .success)
        }
        catch { self.error = error.localizedDescription }
    }

    func effectivePrompt(for id: String) async throws -> EffectivePromptResponse { try await service.effectivePrompt(id) }
}
