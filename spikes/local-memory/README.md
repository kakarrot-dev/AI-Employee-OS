# Phase 0 Local Memory Spike

该 Spike 验证 MemoryCore 不满足产品门禁后的最小本地替代路径：

- `BAAI/bge-small-zh-v1.5` 在本机生成 512 维中文向量。
- BM25（内存 FTS5）与向量混合召回。
- `scope_type + scope_id + category` 先过滤、后召回。
- 记忆正文、标签和向量使用 AES-256-GCM 加密落盘。
- 磁盘不保存明文 BM25 索引；解锁后从密文重建内存索引。
- 永久删除后执行 WAL 截断与 `VACUUM`，记录不再召回，目标密文与探针明文均不残留在应用管理的数据文件中。

这不是生产实现。Key 由测试进程随机生成；正式产品必须由 Keychain 管理主密钥，并补齐版本、冲突、墓碑、Migration、备份和并发协议。

## 固定依赖

- Python `>=3.12,<3.14`
- FastEmbed `0.8.0`（Apache-2.0）
- `BAAI/bge-small-zh-v1.5`（MIT；FastEmbed ONNX 约 91MB）
- Cryptography `46.0.3`
- NumPy `2.5.2`

模型文件 `model_optimized.onnx` 的本轮 SHA-256：

```text
1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38
```

## 运行

```bash
uv sync --project spikes/local-memory --frozen

uv run --project spikes/local-memory --frozen \
  python spikes/local-memory/local_memory_spike.py download

HF_HUB_OFFLINE=1 uv run --project spikes/local-memory --frozen \
  python spikes/local-memory/local_memory_spike.py verify
```

模型缓存与验证数据分别写入 `.model-cache/`、`.spike-data/`，均不提交。

## 边界

- 当前检索会解密指定 Scope 的候选并在进程内计算余弦相似度，适合验证契约，不代表大规模性能结论。
- 分类和 Scope 元数据留在 SQLite 中，正文、标签和向量加密；是否需要连稳定 ID 与分类元数据一起隐藏，需在威胁模型中确定。
- 应用无法清除用户自行创建的 Time Machine、磁盘镜像和外部备份，正式删除确认必须明确该边界。
