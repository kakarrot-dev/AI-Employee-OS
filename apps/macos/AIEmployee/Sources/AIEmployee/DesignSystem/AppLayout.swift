import Foundation

enum AppPaneRole: String, Hashable {
    case globalNavigation
    case collection
    case primaryContent
    case inspector
}

enum AppLayoutFamily: Equatable {
    case page
    case browser
    case workspace
}

enum AppShellClass: Equatable {
    case compact
    case regular
}

enum AppVerticalDensity: Equatable {
    case compact
    case regular
}

enum AppWorkspacePresentation: Equatable {
    case singlePane
    case split
    case splitWithInspector
}

struct AppPaneMetrics: Equatable {
    let minWidth: CGFloat
    let idealWidth: CGFloat
    let maxWidth: CGFloat

    init(minWidth: CGFloat, idealWidth: CGFloat, maxWidth: CGFloat) {
        precondition(minWidth <= idealWidth && idealWidth <= maxWidth)
        self.minWidth = minWidth
        self.idealWidth = idealWidth
        self.maxWidth = maxWidth
    }
}

struct AppLayoutProfile: Equatable {
    let id: String
    let family: AppLayoutFamily
    let collection: AppPaneMetrics?
    let primary: AppPaneMetrics
    let inspector: AppPaneMetrics?
    let compactHorizontalInset: CGFloat
    let regularHorizontalInset: CGFloat

    static let office = AppLayoutProfile(
        id: "office",
        family: .page,
        collection: nil,
        primary: AppPaneMetrics(minWidth: 480, idealWidth: 820, maxWidth: 1_180),
        inspector: nil,
        compactHorizontalInset: 20,
        regularHorizontalInset: 32
    )

    static let archive = AppLayoutProfile(
        id: "archive",
        family: .page,
        collection: nil,
        primary: AppPaneMetrics(minWidth: 480, idealWidth: 720, maxWidth: 920),
        inspector: nil,
        compactHorizontalInset: 16,
        regularHorizontalInset: 28
    )

    static let contacts = browser(
        id: "contacts",
        collection: AppPaneMetrics(minWidth: 232, idealWidth: 260, maxWidth: 280),
        contentMaxWidth: 820
    )

    static let knowledge = browser(id: "knowledge", contentMaxWidth: 820)
    static let capabilities = browser(id: "capabilities", contentMaxWidth: 780)
    static let settings = browser(
        id: "settings",
        collection: AppPaneMetrics(minWidth: 220, idealWidth: 232, maxWidth: 240),
        contentMaxWidth: 620
    )
    static let skillPackage = browser(
        id: "skill-package",
        collection: AppPaneMetrics(minWidth: 200, idealWidth: 220, maxWidth: 230),
        contentMaxWidth: 700
    )

    static let work = workspace(
        id: "work",
        collection: AppPaneMetrics(minWidth: 210, idealWidth: 236, maxWidth: 270),
        primary: AppPaneMetrics(minWidth: 500, idealWidth: 680, maxWidth: 820),
        inspector: AppPaneMetrics(minWidth: 220, idealWidth: 240, maxWidth: 270)
    )

    static let employeeChat = workspace(
        id: "employee-chat",
        collection: AppPaneMetrics(minWidth: 230, idealWidth: 250, maxWidth: 280),
        primary: AppPaneMetrics(minWidth: 480, idealWidth: 680, maxWidth: 820),
        inspector: AppPaneMetrics(minWidth: 280, idealWidth: 320, maxWidth: 420)
    )

    private static func browser(
        id: String,
        collection: AppPaneMetrics = AppPaneMetrics(minWidth: 232, idealWidth: 260, maxWidth: 286),
        contentMaxWidth: CGFloat
    ) -> AppLayoutProfile {
        AppLayoutProfile(
            id: id,
            family: .browser,
            collection: collection,
            primary: AppPaneMetrics(minWidth: 480, idealWidth: min(680, contentMaxWidth), maxWidth: contentMaxWidth),
            inspector: nil,
            compactHorizontalInset: 16,
            regularHorizontalInset: 28
        )
    }

    private static func workspace(
        id: String,
        collection: AppPaneMetrics,
        primary: AppPaneMetrics,
        inspector: AppPaneMetrics
    ) -> AppLayoutProfile {
        AppLayoutProfile(
            id: id,
            family: .workspace,
            collection: collection,
            primary: primary,
            inspector: inspector,
            compactHorizontalInset: 16,
            regularHorizontalInset: 24
        )
    }
}

struct AppLayoutContext: Equatable {
    let windowSize: CGSize
    let shellClass: AppShellClass
    let verticalDensity: AppVerticalDensity
    let globalNavigationVisible: Bool

    static let `default` = AppLayoutContext(
        windowSize: CGSize(width: 1_280, height: 820),
        shellClass: .regular,
        verticalDensity: .regular,
        globalNavigationVisible: true
    )

    static func == (lhs: AppLayoutContext, rhs: AppLayoutContext) -> Bool {
        lhs.windowSize.width == rhs.windowSize.width
            && lhs.windowSize.height == rhs.windowSize.height
            && lhs.shellClass == rhs.shellClass
            && lhs.verticalDensity == rhs.verticalDensity
            && lhs.globalNavigationVisible == rhs.globalNavigationVisible
    }
}

struct ResolvedLayout: Equatable {
    let profile: AppLayoutProfile
    let context: AppLayoutContext
    let presentation: AppWorkspacePresentation
    let visiblePanes: Set<AppPaneRole>
    let availableSize: CGSize
    let collectionWidth: CGFloat?
    let primaryWidth: CGFloat
    let inspectorWidth: CGFloat?
    let inspectorAvailable: Bool
    let horizontalInset: CGFloat
    let verticalInset: CGFloat

    var isCompact: Bool { context.shellClass == .compact }
    var showsCollection: Bool { visiblePanes.contains(.collection) }
    var showsInspector: Bool { visiblePanes.contains(.inspector) }

    func resolvingSinglePane(_ role: AppPaneRole) -> ResolvedLayout {
        guard presentation == .singlePane, role == .collection || role == .primaryContent else { return self }
        var panes = visiblePanes
        panes.remove(.collection)
        panes.remove(.primaryContent)
        panes.remove(.inspector)
        panes.insert(role)
        return ResolvedLayout(
            profile: profile,
            context: context,
            presentation: presentation,
            visiblePanes: panes,
            availableSize: availableSize,
            collectionWidth: collectionWidth,
            primaryWidth: primaryWidth,
            inspectorWidth: inspectorWidth,
            inspectorAvailable: inspectorAvailable,
            horizontalInset: horizontalInset,
            verticalInset: verticalInset
        )
    }

    static func == (lhs: ResolvedLayout, rhs: ResolvedLayout) -> Bool {
        lhs.profile == rhs.profile
            && lhs.context == rhs.context
            && lhs.presentation == rhs.presentation
            && lhs.visiblePanes == rhs.visiblePanes
            && lhs.availableSize.width == rhs.availableSize.width
            && lhs.availableSize.height == rhs.availableSize.height
            && lhs.collectionWidth == rhs.collectionWidth
            && lhs.primaryWidth == rhs.primaryWidth
            && lhs.inspectorWidth == rhs.inspectorWidth
            && lhs.inspectorAvailable == rhs.inspectorAvailable
            && lhs.horizontalInset == rhs.horizontalInset
            && lhs.verticalInset == rhs.verticalInset
    }
}

enum AppLayoutResolver {
    static let compactShellWidth: CGFloat = 960
    static let compactHeight: CGFloat = 600
    private static let dividerWidth: CGFloat = 1

    static func defaultGlobalNavigationVisible(
        windowSize: CGSize,
        prefersGlobalNavigation: Bool
    ) -> Bool {
        windowSize.width >= compactShellWidth && prefersGlobalNavigation
    }

    static func context(
        windowSize: CGSize,
        globalNavigationVisible: Bool
    ) -> AppLayoutContext {
        AppLayoutContext(
            windowSize: windowSize,
            shellClass: windowSize.width < compactShellWidth ? .compact : .regular,
            verticalDensity: windowSize.height < compactHeight ? .compact : .regular,
            globalNavigationVisible: globalNavigationVisible
        )
    }

    static func resolve(
        profile: AppLayoutProfile,
        availableSize: CGSize,
        context: AppLayoutContext,
        prefersInspector: Bool = false
    ) -> ResolvedLayout {
        let horizontalInset = context.shellClass == .compact
            ? profile.compactHorizontalInset
            : profile.regularHorizontalInset
        let verticalInset: CGFloat = context.verticalDensity == .compact ? 20 : 28
        var visiblePanes: Set<AppPaneRole> = [.primaryContent]
        if context.globalNavigationVisible { visiblePanes.insert(.globalNavigation) }

        guard profile.family != .page, let collection = profile.collection else {
            return ResolvedLayout(
                profile: profile,
                context: context,
                presentation: .singlePane,
                visiblePanes: visiblePanes,
                availableSize: availableSize,
                collectionWidth: nil,
                primaryWidth: availableSize.width,
                inspectorWidth: nil,
                inspectorAvailable: false,
                horizontalInset: horizontalInset,
                verticalInset: verticalInset
            )
        }

        let dualMinimum = collection.minWidth + dividerWidth + profile.primary.minWidth
        let canShowCollection = context.shellClass == .regular && availableSize.width >= dualMinimum
        guard canShowCollection else {
            return ResolvedLayout(
                profile: profile,
                context: context,
                presentation: .singlePane,
                visiblePanes: visiblePanes,
                availableSize: availableSize,
                collectionWidth: nil,
                primaryWidth: availableSize.width,
                inspectorWidth: nil,
                inspectorAvailable: false,
                horizontalInset: horizontalInset,
                verticalInset: verticalInset
            )
        }

        visiblePanes.insert(.collection)
        var collectionWidth = min(collection.idealWidth, availableSize.width - dividerWidth - profile.primary.minWidth)
        var inspectorWidth: CGFloat?
        var presentation = AppWorkspacePresentation.split
        var inspectorAvailable = false

        if profile.family == .workspace, let inspector = profile.inspector {
            let tripleMinimum = dualMinimum + dividerWidth + inspector.minWidth
            inspectorAvailable = availableSize.width >= tripleMinimum
            if prefersInspector, inspectorAvailable {
                presentation = .splitWithInspector
                visiblePanes.insert(.inspector)

                let secondaryBudget = availableSize.width - profile.primary.minWidth - (dividerWidth * 2)
                var desiredCollection = collection.idealWidth
                var desiredInspector = inspector.idealWidth
                var overflow = max(0, desiredCollection + desiredInspector - secondaryBudget)

                let inspectorReduction = min(overflow, desiredInspector - inspector.minWidth)
                desiredInspector -= inspectorReduction
                overflow -= inspectorReduction
                desiredCollection -= min(overflow, desiredCollection - collection.minWidth)

                collectionWidth = desiredCollection
                inspectorWidth = desiredInspector
            }
        }

        let usedSecondaryWidth = collectionWidth
            + (inspectorWidth ?? 0)
            + (inspectorWidth == nil ? dividerWidth : dividerWidth * 2)

        return ResolvedLayout(
            profile: profile,
            context: context,
            presentation: presentation,
            visiblePanes: visiblePanes,
            availableSize: availableSize,
            collectionWidth: collectionWidth,
            primaryWidth: availableSize.width - usedSecondaryWidth,
            inspectorWidth: inspectorWidth,
            inspectorAvailable: inspectorAvailable,
            horizontalInset: horizontalInset,
            verticalInset: verticalInset
        )
    }
}
