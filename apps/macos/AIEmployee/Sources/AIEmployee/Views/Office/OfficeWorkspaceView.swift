import SwiftUI

struct OfficeWorkspaceView: View {
    @ObservedObject var store: TaskStore
    let openChat: () -> Void

    @State private var searchText = ""
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
        ZStack(alignment: .top) {
            if viewMode == .office {
                OfficeSceneView(employee: employee, reduceMotion: reduceMotion, openChat: openChat)
            } else {
                OfficeEmployeeList(employee: employee, openChat: openChat)
            }

            OfficeControlBar(searchText: $searchText, viewMode: $viewMode)
                .padding(.top, AppTheme.Spacing.md)
        }
        .background(palette.canvas)
        .navigationTitle("办公室")
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

private struct OfficeControlBar: View {
    @Binding var searchText: String
    @Binding var viewMode: OfficeViewMode

    var body: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            HStack(spacing: AppTheme.Spacing.xs) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("搜索员工", text: $searchText)
                    .textFieldStyle(.plain)
                    .frame(width: 132)
            }
            .padding(.horizontal, AppTheme.Spacing.sm)
            .frame(height: 30)

            Divider().frame(height: 18)

            Picker("视图", selection: $viewMode) {
                ForEach(OfficeViewMode.allCases) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: 132)
        }
        .padding(AppTheme.Spacing.xs)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(.white.opacity(0.56), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.09), radius: 14, y: 5)
    }
}

private struct OfficeSceneView: View {
    let employee: OfficeEmployeePresentation
    let reduceMotion: Bool
    let openChat: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                OfficeFloor()

                SoftRugShape()
                    .fill(palette.primary.opacity(0.055))
                    .frame(width: min(proxy.size.width * 0.62, 680), height: min(proxy.size.height * 0.5, 390))
                    .offset(x: -40, y: 44)

                DepartmentSign(title: employee.department)
                    .position(x: proxy.size.width * 0.29, y: proxy.size.height * 0.39)

                WorkstationView(employee: employee, reduceMotion: reduceMotion, openChat: openChat)
                    .position(x: proxy.size.width * 0.5, y: proxy.size.height * 0.55)

                OfficePlant()
                    .position(x: proxy.size.width * 0.73, y: proxy.size.height * 0.66)

                LowCabinet()
                    .position(x: proxy.size.width * 0.27, y: proxy.size.height * 0.69)

                SharedTable()
                    .position(x: proxy.size.width * 0.71, y: proxy.size.height * 0.39)
            }
            .clipped()
        }
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
            context.stroke(grid, with: .color(palette.hairlineSoft.opacity(0.45)), lineWidth: 0.7)
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
                .fill(.black.opacity(0.09))
                .frame(width: 48, height: 16)
                .offset(y: 57)

            Capsule()
                .fill(Color(hex: 0x5B635E))
                .frame(width: 28, height: 52)
                .rotationEffect(.degrees(-5))
                .offset(y: 21)

            Capsule()
                .fill(Color(hex: 0xC99872))
                .frame(width: 11, height: 38)
                .rotationEffect(.degrees(state == .working && workingMotion ? -31 : -20), anchor: .top)
                .offset(x: -15, y: 17)

            Capsule()
                .fill(Color(hex: 0xC99872))
                .frame(width: 11, height: 38)
                .rotationEffect(.degrees(state == .working && workingMotion ? 31 : 20), anchor: .top)
                .offset(x: 15, y: 17)

            Circle()
                .fill(Color(hex: 0xD5A47D))
                .frame(width: 35, height: 35)
                .offset(y: -20)

            HairShape()
                .fill(Color(hex: 0x3D352F))
                .frame(width: 39, height: 23)
                .offset(y: -29)

            statusDot
                .offset(x: 27, y: -32)
        }
        .saturation(state == .disabled ? 0.15 : 0.82)
        .opacity(state == .disabled ? 0.58 : 1)
        .onAppear {
            guard state == .working, !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.15).repeatForever(autoreverses: true)) {
                workingMotion = true
            }
        }
    }

    private var statusDot: some View {
        ZStack {
            if state == .working && !reduceMotion {
                Circle()
                    .stroke(stateColor.opacity(workingMotion ? 0.08 : 0.42), lineWidth: 2)
                    .frame(width: workingMotion ? 24 : 14, height: workingMotion ? 24 : 14)
            }
            Circle().fill(stateColor).frame(width: 9, height: 9)
        }
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

private struct HairShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + 2, y: rect.maxY))
        path.addCurve(
            to: CGPoint(x: rect.maxX - 2, y: rect.maxY),
            control1: CGPoint(x: rect.minX, y: rect.minY),
            control2: CGPoint(x: rect.maxX, y: rect.minY)
        )
        path.addLine(to: CGPoint(x: rect.maxX - 6, y: rect.midY))
        path.addCurve(
            to: CGPoint(x: rect.minX + 2, y: rect.maxY),
            control1: CGPoint(x: rect.midX, y: rect.minY - 2),
            control2: CGPoint(x: rect.minX, y: rect.midY)
        )
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
        .padding(.top, 88)
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
