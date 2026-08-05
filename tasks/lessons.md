# Lessons

- 客户端「不创建 Package」≠「不能选择/绑定」。禁用添加按钮时，必须同时提供从已安装 catalog 选择并持久化的路径；否则能力页会变成只读死胡同。
- Tool 在数据模型里是全局安装（无 `agent_tools`），不要假装成与 Skill 对等的 per-agent 绑定，除非先改 canonical schema。
- Skill/Tool 的选择入口在「编辑资料」，Profile 能力页只读展示。不要再把添加/移除放回 Profile。
- `.preferredColorScheme(nil)` 从强制深/浅色切回「跟随系统」会半屏错色；跟随系统时读 `AppleInterfaceStyle` 并始终传入明确 `.light`/`.dark`，并监听 `AppleInterfaceThemeChangedNotification`。
