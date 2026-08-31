# Deep Agents Phase 0 Spike

该 Spike 使用确定性 Fake Model，不调用真实 Provider，验证：

- Root Agent 委派临时员工并只接收最终 Handoff。
- Tool 审批前无副作用，批准后跨进程恢复且只执行一次。
- 拒绝 Tool 后副作用仍为零。
- `task` Tool 节点完成后的静态安全停止与跨进程恢复。
- Root/Sub-agent Streaming Namespace。
- 硬杀进程后未完成节点会重放，非幂等副作用可能重复。
- `create_deep_agent` 默认 Tool Surface 不能直接作为产品权限边界。

## 运行

```bash
uv sync --project spikes/deep-agents --frozen

uv run --project spikes/deep-agents --frozen \
  python spikes/deep-agents/orchestration_spike.py approval_pause
uv run --project spikes/deep-agents --frozen \
  python spikes/deep-agents/orchestration_spike.py approval_resume

uv run --project spikes/deep-agents --frozen \
  python spikes/deep-agents/orchestration_spike.py rejection

uv run --project spikes/deep-agents --frozen \
  python spikes/deep-agents/orchestration_spike.py safe_pause
uv run --project spikes/deep-agents --frozen \
  python spikes/deep-agents/orchestration_spike.py safe_resume

uv run --project spikes/deep-agents --frozen \
  python spikes/deep-agents/orchestration_spike.py stream
uv run --project spikes/deep-agents --frozen \
  python spikes/deep-agents/orchestration_spike.py tool_surface

uv run --project spikes/deep-agents --frozen \
  python spikes/deep-agents/hard_cancel_spike.py verify
```

运行数据写入 `spikes/deep-agents/.spike-data/`，该目录不提交。

## 预期关键结果

```text
approval_pause  -> effect_count=0, interrupt_count=1, next=["tools"]
approval_resume -> effect_count=1, interrupt_count=0, next=[]
rejection       -> effect_count=0
safe_pause      -> task_result="employee produced handoff", next=["model"]
safe_resume     -> final_message="manager accepted employee result", next=[]
hard_cancel     -> before_next=["risky"], effect_count=2
```

`hard_cancel` 的重复副作用是预期的反例，用来证明硬取消不能作为可恢复暂停。
