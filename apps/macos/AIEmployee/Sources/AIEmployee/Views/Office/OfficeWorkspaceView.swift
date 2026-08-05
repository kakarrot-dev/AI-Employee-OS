import SwiftUI

struct OfficeWorkspaceView: View {
    @ObservedObject var store: TaskStore
    let openChat: () -> Void

    @State private var viewMode = OfficeViewMode.office
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    private var currentRun: TaskRun? {
        store.runs.first { $0.status == .running || $0.status == .pending }
    }

    private var employee: OfficeEmployeePresentation {
        OfficeEmployeePresentation.alex(run: currentRun, allRuns: store.runs)
    }

    var body: some View {
        ZStack {
            if viewMode == .office {
                OfficeSceneView(employee: employee, reduceMotion: reduceMotion, openChat: openChat)
            } else {
                OfficeEmployeeList(employee: employee, openChat: openChat)
            }
        }
        .background(palette.canvas)
        .navigationTitle("办公室")
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    viewMode = viewMode == .office ? .list : .office
                } label: {
                    Label(viewMode == .office ? "切换到列表" : "切换到办公室", systemImage: viewMode == .office ? "list.bullet" : "building.2")
                }
                .help(viewMode == .office ? "切换到员工列表" : "切换到办公室")

                Button(action: openChat) {
                    Label("交给 Alex 新工作", systemImage: "square.and.pencil")
                }
                .help("交给 Alex 新工作")
            }
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private enum OfficeViewMode: String, CaseIterable, Identifiable {
    case office = "办公室"
    case list = "列表"

    var id: String { rawValue }
}

private struct OfficeEmployeePresentation {
    let name: String
    let role: String
    let department: String
    let state: EmployeePresence
    let currentWork: String?
    let completedWorkCount: Int

    static func alex(run: TaskRun?, allRuns: [TaskRun]) -> Self {
        let state = EmployeePresence.resolve(activeRun: run, latestRun: allRuns.first)
        return Self(
            name: "Alex",
            role: "AI 产品经理",
            department: "产品部",
            state: state,
            currentWork: run?.input,
            completedWorkCount: allRuns.filter { $0.status == .succeeded }.count
        )
    }
}

private struct OfficeSceneView: View {
    let employee: OfficeEmployeePresentation
    let reduceMotion: Bool
    let openChat: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        GeometryReader { proxy in
            VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                HStack(alignment: .firstTextBaseline) {
                    Text(employee.department)
                        .font(.headline)
                        .foregroundStyle(palette.ink)
                    Text("1 名员工 · 5 个空工位")
                        .font(.caption)
                        .foregroundStyle(palette.muted)
                    Spacer()
                }

                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(), spacing: AppTheme.Spacing.lg), count: 3),
                    spacing: AppTheme.Spacing.lg
                ) {
                    OfficeDeskPod(employee: employee, reduceMotion: reduceMotion, openChat: openChat)
                    ForEach(0..<5, id: \.self) { index in
                        OfficeDeskPod(employee: nil, reduceMotion: true, openChat: {})
                            .accessibilityLabel("空工位 \(index + 2)")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .top)

                Spacer(minLength: 0)
            }
            .padding(.horizontal, max(AppTheme.Spacing.lg, proxy.size.width * 0.045))
            .padding(.top, AppTheme.Spacing.lg)
            .padding(.bottom, AppTheme.Spacing.xl)
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct OfficeDeskPod: View {
    let employee: OfficeEmployeePresentation?
    let reduceMotion: Bool
    let openChat: () -> Void

    @State private var showsPopover = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Group {
            if let employee {
                Button { showsPopover = true } label: {
                    workstation(employee: employee)
                }
                .buttonStyle(.plain)
                .help("\(employee.name) · \(employee.role)\n\(employee.currentWork.map { "正在处理：\($0)" } ?? "空闲，可以接收工作")")
                .accessibilityLabel("\(employee.name)，\(employee.role)，\(employee.state.title)")
                .popover(isPresented: $showsPopover, arrowEdge: .trailing) {
                    EmployeeOfficePopover(employee: employee, openChat: {
                        showsPopover = false
                        openChat()
                    })
                }
            } else {
                workstation(employee: nil)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 210)
    }

    private func workstation(employee: OfficeEmployeePresentation?) -> some View {
        VStack(spacing: 0) {
            ZStack {
                deskFrame

                if let employee {
                    EmployeeCharacter(state: employee.state, reduceMotion: reduceMotion)
                        .scaleEffect(0.82)
                        .offset(y: 24)
                } else {
                    emptyChair
                }
            }
            .frame(width: 208, height: 164)

            if let employee {
                NamePlate(name: employee.name, state: employee.state)
                    .offset(y: -3)
            } else {
                Color.clear.frame(height: 25)
            }
        }
        .contentShape(Rectangle())
    }

    private var deskFrame: some View {
        ZStack {
            Ellipse()
                .fill(.black.opacity(0.055))
                .frame(width: 188, height: 34)
                .offset(y: 55)

            RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                .fill(palette.surfaceCard)
                .frame(width: 188, height: 18)
                .overlay {
                    RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                        .stroke(palette.hairlineSoft, lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.055), radius: 5, y: 4)
                .offset(y: 10)

            HStack(spacing: 142) {
                Capsule().fill(palette.hairline).frame(width: 5, height: 55)
                Capsule().fill(palette.hairline).frame(width: 5, height: 55)
            }
            .offset(y: 43)

            monitor
                .offset(y: -32)

            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: 0xEAD49C))
                .frame(width: 27, height: 16)
                .rotationEffect(.degrees(-5))
                .offset(x: 57, y: 3)
        }
    }

    private var monitor: some View {
        VStack(spacing: 0) {
            RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                .fill(employee == nil ? palette.surfaceSoft : Color(hex: 0xC9D7D2))
                .frame(width: 104, height: 67)
                .overlay {
                    RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                        .stroke(palette.hairline, lineWidth: 1)
                }
                .overlay {
                    if employee != nil {
                        VStack(spacing: 5) {
                            Capsule().fill(palette.surfaceCard.opacity(0.9)).frame(width: 66, height: 7)
                            HStack(spacing: 5) {
                                RoundedRectangle(cornerRadius: 2).fill(palette.surfaceCard.opacity(0.72)).frame(width: 25, height: 28)
                                VStack(spacing: 4) {
                                    Capsule().fill(palette.accentTeal.opacity(0.42)).frame(width: 31, height: 5)
                                    Capsule().fill(palette.surfaceCard.opacity(0.82)).frame(width: 31, height: 5)
                                    Capsule().fill(palette.primary.opacity(0.35)).frame(width: 31, height: 5)
                                }
                            }
                        }
                    }
                }
            Rectangle().fill(palette.hairline).frame(width: 4, height: 12)
            Capsule().fill(palette.hairline).frame(width: 34, height: 4)
        }
    }

    private var emptyChair: some View {
        VStack(spacing: 0) {
            RoundedRectangle(cornerRadius: AppTheme.Radius.md, style: .continuous)
                .fill(palette.hairlineSoft)
                .frame(width: 49, height: 52)
            RoundedRectangle(cornerRadius: 5)
                .fill(palette.surfaceSoft)
                .frame(width: 58, height: 17)
            Capsule().fill(palette.hairline).frame(width: 5, height: 21)
        }
        .offset(y: 46)
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct OfficeFloor: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Canvas { context, size in
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(palette.canvas))
            let spacing: CGFloat = 64
            var grid = Path()
            for x in stride(from: -size.height, through: size.width + size.height, by: spacing) {
                grid.move(to: CGPoint(x: x, y: 0))
                grid.addLine(to: CGPoint(x: x + size.height, y: size.height))
            }
            for x in stride(from: 0, through: size.width + size.height, by: spacing) {
                grid.move(to: CGPoint(x: x, y: 0))
                grid.addLine(to: CGPoint(x: x - size.height, y: size.height))
            }
            context.stroke(grid, with: .color(palette.hairlineSoft.opacity(0.24)), lineWidth: 0.7)
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct SoftRugShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        path.closeSubpath()
        return path
    }
}

private struct DepartmentSign: View {
    let title: String
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(palette.ink)
                .padding(.horizontal, AppTheme.Spacing.sm)
                .padding(.vertical, 6)
                .background(palette.surfaceCard)
                .overlay { Rectangle().stroke(palette.hairline, lineWidth: 1) }
            Rectangle()
                .fill(palette.muted.opacity(0.6))
                .frame(width: 3, height: 22)
        }
        .shadow(color: .black.opacity(0.07), radius: 4, y: 3)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("部门：\(title)")
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct WorkstationView: View {
    let employee: OfficeEmployeePresentation
    let reduceMotion: Bool
    let openChat: () -> Void

    @State private var showsPopover = false
    @State private var pulse = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button {
            showsPopover = true
        } label: {
            ZStack {
                desk
                EmployeeCharacter(state: employee.state, reduceMotion: reduceMotion)
                    .offset(x: 7, y: -56)
                NamePlate(name: employee.name, state: employee.state)
                    .offset(x: -4, y: 64)
            }
            .frame(width: 230, height: 190)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(helpText)
        .accessibilityLabel("\(employee.name)，\(employee.role)，\(employee.state.title)\(employee.currentWork.map { "，正在处理\($0)" } ?? "")")
        .popover(isPresented: $showsPopover, arrowEdge: .trailing) {
            EmployeeOfficePopover(employee: employee, openChat: {
                showsPopover = false
                openChat()
            })
        }
    }

    private var desk: some View {
        ZStack {
            SoftRugShape()
                .fill(Color(hex: 0xC7AD84))
                .frame(width: 188, height: 102)
                .overlay { SoftRugShape().stroke(Color(hex: 0xA98B62), lineWidth: 1) }
                .shadow(color: .black.opacity(0.13), radius: 9, y: 8)

            RoundedRectangle(cornerRadius: 4)
                .fill(palette.surfaceCard)
                .frame(width: 52, height: 35)
                .rotationEffect(.degrees(45))
                .scaleEffect(y: 0.55)
                .offset(x: -10, y: -12)

            RoundedRectangle(cornerRadius: 3)
                .fill(palette.ink.opacity(0.82))
                .frame(width: 52, height: 30)
                .rotation3DEffect(.degrees(52), axis: (x: 1, y: 0, z: 0))
                .offset(x: -9, y: -44)

            Rectangle()
                .fill(palette.muted)
                .frame(width: 3, height: 18)
                .offset(x: -9, y: -26)

            ProductNotes()
                .offset(x: 48, y: -7)
        }
    }

    private var helpText: String {
        if let currentWork = employee.currentWork {
            return "\(employee.name) · \(employee.role)\n正在处理：\(currentWork)"
        }
        return "\(employee.name) · \(employee.role)\n空闲，可以接收工作"
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct EmployeeCharacter: View {
    let state: EmployeePresence
    let reduceMotion: Bool

    @State private var workingMotion = false
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            Ellipse()
                .fill(.black.opacity(0.075))
                .frame(width: 66, height: 17)
                .offset(y: 55)

            chair

            CartoonTorsoShape()
                .fill(Color(hex: 0x4C5651))
                .frame(width: 57, height: 61)
                .offset(y: 17 + (workingMotion ? 1 : 0))

            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(Color(hex: 0xC88F6A))
                .frame(width: 14, height: 12)
                .offset(y: -14)

            sleeve(side: -1)
            sleeve(side: 1)
            forearm(side: -1)
            forearm(side: 1)

            Capsule()
                .fill(palette.primary)
                .frame(width: 29, height: 7)
                .offset(y: -1)

            Circle()
                .fill(Color(hex: 0xD6A17A))
                .frame(width: 43, height: 45)
                .overlay {
                    Circle()
                        .stroke(Color(hex: 0xBC805B).opacity(0.42), lineWidth: 1)
                }
                .offset(y: -34)

            Circle().fill(Color(hex: 0xD6A17A)).frame(width: 9, height: 12).offset(x: -23, y: -31)
            Circle().fill(Color(hex: 0xD6A17A)).frame(width: 9, height: 12).offset(x: 23, y: -31)

            CartoonHairShape()
                .fill(Color(hex: 0x4A3830))
                .frame(width: 46, height: 34)
                .offset(y: -42)
        }
        .frame(width: 92, height: 116)
        .saturation(state == .disabled ? 0.15 : 0.82)
        .opacity(state == .disabled ? 0.58 : 1)
        .onAppear {
            guard state == .working, !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.15).repeatForever(autoreverses: true)) {
                workingMotion = true
            }
        }
    }

    private var chair: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(Color(hex: 0xD8D4CA))
                .frame(width: 62, height: 61)
                .overlay {
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .stroke(palette.hairline, lineWidth: 1)
                }
                .offset(y: 23)
            Capsule().fill(palette.hairline).frame(width: 6, height: 25).offset(y: 57)
            Capsule().fill(palette.hairline).frame(width: 38, height: 5).offset(y: 67)
        }
    }

    private func sleeve(side: CGFloat) -> some View {
        Capsule()
            .fill(Color(hex: 0x4C5651))
            .frame(width: 16, height: 29)
            .rotationEffect(.degrees(Double(side) * 20), anchor: .top)
            .offset(x: side * 22, y: 19)
    }

    private func forearm(side: CGFloat) -> some View {
        let activity = state == .working && workingMotion ? 3.0 : 0.0
        return ZStack(alignment: .top) {
            Capsule()
                .fill(Color(hex: 0xD6A17A))
                .frame(width: 10, height: 17)
            Circle()
                .fill(Color(hex: 0xD6A17A))
                .frame(width: 12, height: 12)
                .offset(y: -3)
        }
        .rotationEffect(.degrees(Double(side) * (-25 + activity)), anchor: .top)
        .offset(x: side * 28, y: 10 + (workingMotion ? -1 : 0))
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct CartoonTorsoShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addCurve(
            to: CGPoint(x: rect.maxX, y: rect.maxY - 8),
            control1: CGPoint(x: rect.maxX - 8, y: rect.minY),
            control2: CGPoint(x: rect.maxX, y: rect.midY)
        )
        path.addQuadCurve(to: CGPoint(x: rect.maxX - 9, y: rect.maxY), control: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + 9, y: rect.maxY))
        path.addQuadCurve(to: CGPoint(x: rect.minX, y: rect.maxY - 8), control: CGPoint(x: rect.minX, y: rect.maxY))
        path.addCurve(
            to: CGPoint(x: rect.midX, y: rect.minY),
            control1: CGPoint(x: rect.minX, y: rect.midY),
            control2: CGPoint(x: rect.minX + 8, y: rect.minY)
        )
        path.closeSubpath()
        return path
    }
}

private struct CartoonHairShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + 2, y: rect.maxY - 6))
        path.addCurve(
            to: CGPoint(x: rect.midX, y: rect.minY),
            control1: CGPoint(x: rect.minX + 1, y: rect.minY + 8),
            control2: CGPoint(x: rect.midX - 10, y: rect.minY)
        )
        path.addCurve(
            to: CGPoint(x: rect.maxX - 2, y: rect.maxY - 6),
            control1: CGPoint(x: rect.midX + 10, y: rect.minY),
            control2: CGPoint(x: rect.maxX - 1, y: rect.minY + 8)
        )
        path.addQuadCurve(
            to: CGPoint(x: rect.minX + rect.width * 0.70, y: rect.maxY - 3),
            control: CGPoint(x: rect.minX + rect.width * 0.84, y: rect.maxY)
        )
        path.addQuadCurve(
            to: CGPoint(x: rect.midX, y: rect.maxY - 7),
            control: CGPoint(x: rect.minX + rect.width * 0.61, y: rect.maxY - 1)
        )
        path.addQuadCurve(
            to: CGPoint(x: rect.minX + rect.width * 0.30, y: rect.maxY - 3),
            control: CGPoint(x: rect.minX + rect.width * 0.39, y: rect.maxY - 1)
        )
        path.addQuadCurve(
            to: CGPoint(x: rect.minX + 2, y: rect.maxY - 6),
            control: CGPoint(x: rect.minX + rect.width * 0.16, y: rect.maxY)
        )
        path.closeSubpath()
        return path
    }
}

private struct NamePlate: View {
    let name: String
    let state: EmployeePresence
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(stateColor).frame(width: 6, height: 6)
            Text(name)
                .font(.caption.weight(.semibold))
                .foregroundStyle(palette.ink)
        }
        .padding(.horizontal, 10)
        .frame(height: 25)
        .background(palette.surfaceCard)
        .overlay { RoundedRectangle(cornerRadius: 4).stroke(palette.hairline, lineWidth: 1) }
        .shadow(color: .black.opacity(0.07), radius: 3, y: 2)
    }

    private var stateColor: Color {
        switch state {
        case .available: palette.success
        case .working: palette.accentTeal
        case .attention: palette.warning
        case .failed: palette.error
        case .disabled: palette.muted
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct ProductNotes: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 2).fill(Color(hex: 0xEBD39D)).frame(width: 24, height: 18)
            RoundedRectangle(cornerRadius: 1).fill(Color(hex: 0xBFD4CE)).frame(width: 15, height: 12).offset(x: 16, y: 8)
        }
        .rotationEffect(.degrees(-8))
    }
}

private struct EmployeeOfficePopover: View {
    let employee: OfficeEmployeePresentation
    let openChat: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text(employee.name).font(.headline)
                Text("\(employee.role) · \(employee.department)")
                    .font(.callout)
                    .foregroundStyle(palette.muted)
            }

            Label(employee.state.title, systemImage: employee.state.systemImage)
                .font(.callout.weight(.medium))
                .foregroundStyle(stateColor)

            if let currentWork = employee.currentWork {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    Text("当前工作").font(.caption).foregroundStyle(palette.muted)
                    Text(currentWork).font(.body.weight(.medium)).lineLimit(2)
                }
                Button("查看工作", action: openChat)
                    .buttonStyle(.borderedProminent)
            } else {
                Text(employee.completedWorkCount == 0 ? "还没有工作记录" : "最近完成 \(employee.completedWorkCount) 项工作")
                    .font(.callout)
                    .foregroundStyle(palette.muted)
                Button("分派工作", action: openChat)
                    .buttonStyle(.borderedProminent)
            }

            Divider()
            Button("员工详情", action: openChat).buttonStyle(.plain)
        }
        .padding(AppTheme.Spacing.md)
        .frame(width: 260, alignment: .leading)
    }

    private var stateColor: Color {
        switch employee.state {
        case .available: palette.success
        case .working: palette.accentTeal
        case .attention: palette.warning
        case .failed: palette.error
        case .disabled: palette.muted
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct OfficePlant: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4).fill(Color(hex: 0xAD7D57)).frame(width: 34, height: 31).offset(y: 26)
            ForEach([-18.0, 0, 18.0], id: \.self) { rotation in
                Capsule().fill(Color(hex: 0x6F8062)).frame(width: 20, height: 55).rotationEffect(.degrees(rotation)).offset(y: -7)
            }
        }
        .frame(width: 80, height: 90)
        .shadow(color: .black.opacity(0.09), radius: 6, y: 5)
    }
}

private struct LowCabinet: View {
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6).fill(palette.surfaceSoft).frame(width: 110, height: 48)
            HStack(spacing: 1) {
                Rectangle().fill(palette.hairline).frame(width: 1, height: 34)
                Rectangle().fill(.clear).frame(width: 48)
                Rectangle().fill(palette.hairline).frame(width: 1, height: 34)
            }
        }
        .rotation3DEffect(.degrees(5), axis: (x: 1, y: 0, z: 0))
        .shadow(color: .black.opacity(0.08), radius: 7, y: 5)
    }
    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}

private struct SharedTable: View {
    var body: some View {
        ZStack {
            SoftRugShape().fill(Color(hex: 0xD4B88F)).frame(width: 150, height: 78)
            Circle().fill(Color(hex: 0xF0E7D3)).frame(width: 22, height: 22).offset(x: -20)
            RoundedRectangle(cornerRadius: 2).fill(Color(hex: 0xB9C9C2)).frame(width: 28, height: 18).offset(x: 26, y: 4)
        }
        .shadow(color: .black.opacity(0.08), radius: 6, y: 5)
    }
}

private struct OfficeEmployeeList: View {
    let employee: OfficeEmployeePresentation
    let openChat: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            Text(employee.department)
                .font(.headline)
                .foregroundStyle(palette.ink)
            Button(action: openChat) {
                HStack(spacing: AppTheme.Spacing.md) {
                    Circle().fill(stateColor).frame(width: 8, height: 8)
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                        Text(employee.name).font(.body.weight(.medium))
                        Text(employee.currentWork ?? "空闲，可以接收工作")
                            .font(.callout)
                            .foregroundStyle(palette.muted)
                            .lineLimit(1)
                    }
                    Spacer()
                    Text(employee.state.title).font(.callout).foregroundStyle(stateColor)
                    Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                }
                .padding(.vertical, AppTheme.Spacing.sm)
            }
            .buttonStyle(.plain)
            Divider().overlay(palette.hairlineSoft)
            Spacer()
        }
        .padding(.horizontal, AppTheme.Spacing.xl)
        .padding(.top, AppTheme.Spacing.xl)
        .frame(maxWidth: 820, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(palette.canvas)
    }

    private var stateColor: Color {
        switch employee.state {
        case .available: palette.success
        case .working: palette.accentTeal
        case .attention: palette.warning
        case .failed: palette.error
        case .disabled: palette.muted
        }
    }

    private var palette: AppTheme.Palette { AppTheme.palette(for: colorScheme) }
}
