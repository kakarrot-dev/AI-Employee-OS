import SwiftUI

@MainActor
final class AppLayoutCoordinator: ObservableObject {
    @Published private(set) var context = AppLayoutContext.default

    func update(windowSize: CGSize, globalNavigationVisible: Bool) {
        let next = AppLayoutResolver.context(
            windowSize: windowSize,
            globalNavigationVisible: globalNavigationVisible
        )
        if next != context { context = next }
    }

    func projectedContext(windowSize: CGSize, globalNavigationVisible: Bool) -> AppLayoutContext {
        AppLayoutResolver.context(
            windowSize: windowSize,
            globalNavigationVisible: globalNavigationVisible
        )
    }

    func resolve(
        profile: AppLayoutProfile,
        availableSize: CGSize,
        prefersInspector: Bool = false
    ) -> ResolvedLayout {
        AppLayoutResolver.resolve(
            profile: profile,
            availableSize: availableSize,
            context: context,
            prefersInspector: prefersInspector
        )
    }
}

private struct AppLayoutContextKey: EnvironmentKey {
    static let defaultValue = AppLayoutContext.default
}

private struct ResolvedAppLayoutKey: EnvironmentKey {
    static let defaultValue = AppLayoutResolver.resolve(
        profile: .office,
        availableSize: AppLayoutContext.default.windowSize,
        context: .default
    )
}

extension EnvironmentValues {
    var appLayoutContext: AppLayoutContext {
        get { self[AppLayoutContextKey.self] }
        set { self[AppLayoutContextKey.self] = newValue }
    }

    var resolvedAppLayout: ResolvedLayout {
        get { self[ResolvedAppLayoutKey.self] }
        set { self[ResolvedAppLayoutKey.self] = newValue }
    }
}

struct AdaptivePage<Content: View>: View {
    let profile: AppLayoutProfile
    @ViewBuilder let content: (ResolvedLayout) -> Content

    @Environment(\.appLayoutContext) private var context

    var body: some View {
        GeometryReader { proxy in
            let layout = AppLayoutResolver.resolve(
                profile: profile,
                availableSize: proxy.size,
                context: context
            )
            ScrollView {
                content(layout)
                    .frame(maxWidth: profile.primary.maxWidth, alignment: .leading)
                    .padding(.horizontal, layout.horizontalInset)
                    .padding(.vertical, layout.verticalInset)
                    .frame(maxWidth: .infinity, alignment: .top)
            }
            .environment(\.resolvedAppLayout, layout)
        }
    }
}

struct AdaptiveBrowser<Collection: View, Detail: View>: View {
    let profile: AppLayoutProfile
    @Binding var compactShowsDetail: Bool
    @ViewBuilder let collection: () -> Collection
    @ViewBuilder let detail: (_ showsBack: Bool) -> Detail

    @Environment(\.appLayoutContext) private var context

    var body: some View {
        GeometryReader { proxy in
            let layout = AppLayoutResolver.resolve(
                profile: profile,
                availableSize: proxy.size,
                context: context
            )
            Group {
                if layout.presentation == .singlePane {
                    if compactShowsDetail {
                        detail(true)
                            .environment(\.resolvedAppLayout, layout.resolvingSinglePane(.primaryContent))
                    } else {
                        collection()
                            .environment(\.resolvedAppLayout, layout.resolvingSinglePane(.collection))
                    }
                } else {
                    HSplitView {
                        collection()
                            .frame(
                                minWidth: profile.collection?.minWidth,
                                idealWidth: profile.collection?.idealWidth,
                                maxWidth: profile.collection?.maxWidth,
                                maxHeight: .infinity
                            )
                        detail(false)
                            .frame(minWidth: profile.primary.minWidth, maxWidth: .infinity, maxHeight: .infinity)
                    }
                    .environment(\.resolvedAppLayout, layout)
                }
            }
        }
    }
}

struct AdaptiveWorkspace<Collection: View, Primary: View, Inspector: View>: View {
    let profile: AppLayoutProfile
    @Binding var compactShowsPrimary: Bool
    @Binding var prefersInspector: Bool
    let onLayoutChange: (ResolvedLayout) -> Void
    @ViewBuilder let collection: () -> Collection
    @ViewBuilder let primary: (_ showsBack: Bool, _ layout: ResolvedLayout) -> Primary
    @ViewBuilder let inspector: () -> Inspector

    @Environment(\.appLayoutContext) private var context

    init(
        profile: AppLayoutProfile,
        compactShowsPrimary: Binding<Bool>,
        prefersInspector: Binding<Bool>,
        onLayoutChange: @escaping (ResolvedLayout) -> Void = { _ in },
        @ViewBuilder collection: @escaping () -> Collection,
        @ViewBuilder primary: @escaping (_ showsBack: Bool, _ layout: ResolvedLayout) -> Primary,
        @ViewBuilder inspector: @escaping () -> Inspector
    ) {
        self.profile = profile
        _compactShowsPrimary = compactShowsPrimary
        _prefersInspector = prefersInspector
        self.onLayoutChange = onLayoutChange
        self.collection = collection
        self.primary = primary
        self.inspector = inspector
    }

    var body: some View {
        GeometryReader { proxy in
            let layout = AppLayoutResolver.resolve(
                profile: profile,
                availableSize: proxy.size,
                context: context,
                prefersInspector: prefersInspector
            )
            let presentedLayout = layout.presentation == .singlePane
                ? layout.resolvingSinglePane(compactShowsPrimary ? .primaryContent : .collection)
                : layout
            Group {
                switch layout.presentation {
                case .singlePane:
                    if compactShowsPrimary {
                        primary(true, presentedLayout)
                    } else {
                        collection()
                    }
                case .split:
                    HSplitView {
                        collectionPane
                        primary(false, presentedLayout)
                            .frame(minWidth: profile.primary.minWidth, maxWidth: .infinity, maxHeight: .infinity)
                    }
                case .splitWithInspector:
                    HSplitView {
                        collectionPane
                        primary(false, presentedLayout)
                            .frame(minWidth: profile.primary.minWidth, maxWidth: .infinity, maxHeight: .infinity)
                        inspector()
                            .frame(
                                minWidth: profile.inspector?.minWidth,
                                idealWidth: profile.inspector?.idealWidth,
                                maxWidth: profile.inspector?.maxWidth,
                                maxHeight: .infinity
                            )
                    }
                }
            }
            .environment(\.resolvedAppLayout, presentedLayout)
            .onAppear { onLayoutChange(presentedLayout) }
            .onChange(of: presentedLayout) { _, next in onLayoutChange(next) }
        }
    }

    private var collectionPane: some View {
        collection()
            .frame(
                minWidth: profile.collection?.minWidth,
                idealWidth: profile.collection?.idealWidth,
                maxWidth: profile.collection?.maxWidth,
                maxHeight: .infinity
            )
    }
}
