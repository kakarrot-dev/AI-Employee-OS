# open-claude-ui 来源与适配边界

- 上游仓库：https://github.com/Caho1/open-claude-ui
- 固定版本：`f504349419118a32804ce3a7fae74593070bf945`
- 许可证：MIT，原文保存在本目录的 `LICENSE`。

采用文件：

- `code-examples/cds-theme.css` 原样复制到 `src/renderer/src/open-claude-ui/cds-theme.css`，作为客户端外观的来源。
- 参考 `code-examples/useClaudeScrollPinning.ts` 的滚动策略，在 `src/renderer/src/open-claude-ui/useClaudeScrollPinning.ts` 中适配：40 px 底部容差、150 ms 用户输入保护、120 px 跳转按钮门限。
- 参考 `ClaudeDesktopHeader.tsx` 的窗口安全区和拖拽隔离，`ChatComposer.tsx` / `ChatComposerChin.tsx` 的输入与工具栏，以及 `ChatMessageBubbles.tsx` 的用户气泡和无边框回答，以实际 CdsButton、Lucide 图标及既有窄 Runtime Bridge 实现 `DesktopShell`、`DesktopComposer` 和生产样式。

- `CdsButton.tsx` 采用实际源码并增加样式识别属性；分段选择、状态指示、确认弹窗、附件与工具确认卡按对应源码适配，保留键盘导航、焦点恢复和现有业务回调。
- 布局、字体栈、字号与响应式来源及本地适配见 `docs/audits/2026-10-16-open-claude-ui-client-contract.md`。正式客户端不再导入旧桌面或原型样式。

滚动 Hook 增加严格类型、输入结束后的重新测量、会话切换重置、容器和内容尺寸观察，以及减少动态效果偏好。程序滚动不使用会吞掉下一次手动滚动的单次标志。

机器可读来源见 `provenance.json`；本地发布元数据生成器将该记录和完整 LICENSE 一起放入包内 `legal` 目录。

适配范围为桌面客户端的布局、字体字阶、组件、主题、响应式与滚动交互；当前项目的会话、员工、任务、权限、Runtime 和存储契约仍由当前项目负责。上游 README 对逆向来源的描述仅属于上游声明。
