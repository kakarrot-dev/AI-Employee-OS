import Foundation

@main
enum ClientModelChecks {
    static func main() {
        let document = """
        # 标题
        ## 范围
        - 条目
        1. 第一步
        > 引用
        ---
        ```swift
        let value = 1
        ```
        """
        expect(
            MarkdownBlock.parse(document) == [
                .heading(level: 1, text: "标题"),
                .heading(level: 2, text: "范围"),
                .bullet("条目"),
                .numbered("第一步"),
                .quote("引用"),
                .divider,
                .code("let value = 1")
            ],
            "Markdown document structure"
        )
        expect(
            MarkdownBlock.parse("```\nline one\nline two") == [.code("line one\nline two")],
            "unclosed code block preservation"
        )
        print("client model checks passed")
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ name: String) {
        guard condition() else {
            FileHandle.standardError.write(Data("client model check failed: \(name)\n".utf8))
            exit(1)
        }
    }
}
