# CDS 共享原语

来源：`Caho1/open-claude-ui@f504349419118a32804ce3a7fae74593070bf945`，MIT；许可见 `third_party/open-claude-ui/LICENSE`。

- `CdsButton.tsx`：采用上游同名源码；增加 `cds-button`、`data-cds` 和尺寸/变体属性，供本项目的 CDS 样式与验收识别。
- `StatusIndicators.tsx`：参考同名源码的状态灯结构与 2.4 s / 1.2 s CSS 动效；业务状态与文字仍由调用方传入。
- `SegmentedControl.tsx`：采用同名源码的 2 px 内边距、28/36 px 高度与等分滑块公式；使用 CSS 过渡，补齐 roving tabindex 和方向键行为。
- `ConfirmationDialog.tsx`：采用同名源码的 16 px 弹窗圆角、CDS 投影、2 px 背景模糊与 45% 遮罩；以 Portal、焦点约束和恢复替代 Framer Motion，支持嵌套。

`components/client-ui.tsx` 仅适配原业务 props；共享组件的全部正式视觉由 `design-system/primitives.css` 重新定义，不引入旧原型样式。

上游没有原生 checkbox/radio 组件；`ModelSwitcherWithTokenGauge.tsx:213-227` 只有品牌色的 36 × 20 px switch（16 px 滑块）。本项目的原生勾选框与单选框采用 16 px 原子尺寸及 CDS 品牌色、焦点令牌，保留原生键盘、选中和禁用行为；这是桌面与弹窗表单适配，并非复制上游 checkbox 实现。
