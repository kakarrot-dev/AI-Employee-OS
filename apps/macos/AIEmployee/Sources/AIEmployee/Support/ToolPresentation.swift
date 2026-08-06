import Foundation

enum ToolPresentation {
    static func displayName(id: String, fallback: String) -> String {
        switch id {
        case "file-tool": "本地文件"
        case "agent-reach-tool": "Agent Reach 网络搜索"
        default: fallback
        }
    }

    static func displaySummary(id: String, fallback: String) -> String {
        switch id {
        case "file-tool": "在授权目录内读取、创建和精确编辑 UTF-8 文件。"
        case "agent-reach-tool": "通过受控 Exa 后端搜索公开网页并保留来源。"
        default: fallback.isEmpty ? "已安装 Tool Package" : fallback
        }
    }

    static func actionTitle(_ name: String) -> String {
        switch name {
        case "read_file": "读取文件"
        case "create_file": "创建文件"
        case "edit_file": "编辑文件"
        case "search_web": "网络搜索"
        default: name
        }
    }

    static func actionSummary(_ name: String, fallback: String) -> String {
        switch name {
        case "read_file": "读取授权路径中的 UTF-8 文本。"
        case "create_file": "创建新文件，且不会覆盖已有文件。"
        case "edit_file": "唯一匹配旧文本后进行原子替换。"
        case "search_web": "搜索公开网页并返回带来源的结果。"
        default: fallback.isEmpty ? "已声明的工具动作。" : fallback
        }
    }

    static func riskLabel(_ level: Int) -> String {
        switch level {
        case 0: "自动执行"
        case 1: "记录审计"
        case 2: "每次确认"
        case 3: "禁止"
        default: "未知"
        }
    }

    static func confirmationLabel(_ value: String) -> String {
        switch value {
        case "never": "无需确认"
        case "always": "每次确认"
        default: value
        }
    }

    static func sideEffectLabel(_ value: String) -> String {
        switch value {
        case "none": "无副作用"
        case "reversible": "可逆"
        case "irreversible": "不可逆"
        default: value
        }
    }

    static func idempotencyLabel(_ value: String) -> String {
        switch value {
        case "safe": "安全"
        case "keyed": "幂等键"
        case "unsafe": "非幂等"
        default: value
        }
    }
}
