from __future__ import annotations

import base64
import gc
import hashlib
import json
import os
import re
import sqlite3
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastembed import TextEmbedding


MODEL_NAME = "BAAI/bge-small-zh-v1.5"
MODEL_DIMENSIONS = 512
MODEL_ONNX_SHA256 = "1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38"
DATA_DIR = Path(
    os.environ.get(
        "AI_EMPLOYEE_OS_MEMORY_SPIKE_DIR",
        Path(__file__).parent / ".spike-data",
    )
)
MODEL_CACHE = Path(
    os.environ.get(
        "AI_EMPLOYEE_OS_MODEL_CACHE",
        Path(__file__).parent / ".model-cache",
    )
)


@dataclass(frozen=True)
class Memory:
    memory_id: str
    scope_type: str
    scope_id: str
    category: str
    version: int
    content: str
    tags: tuple[str, ...]
    embedding: np.ndarray


class LocalMemoryStore:
    """Encrypted-at-rest reference store with an ephemeral BM25 index."""

    def __init__(self, db_path: Path, key: bytes, model: TextEmbedding):
        if len(key) != 32:
            raise ValueError("AES-256-GCM requires a 32-byte key")
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self.db_path = db_path
        self.aes = AESGCM(key)
        self.model = model
        self.db = sqlite3.connect(db_path)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA secure_delete=ON")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS memories (
                memory_id TEXT PRIMARY KEY,
                scope_type TEXT NOT NULL,
                scope_id TEXT NOT NULL,
                category TEXT NOT NULL,
                version INTEGER NOT NULL,
                disabled INTEGER NOT NULL DEFAULT 0,
                nonce BLOB NOT NULL,
                ciphertext BLOB NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_memories_scope
                ON memories(scope_type, scope_id, category, disabled);
            """
        )
        self.db.commit()
        self.fts = sqlite3.connect(":memory:")
        self.fts.execute(
            "CREATE VIRTUAL TABLE memory_fts USING fts5(memory_id UNINDEXED, text)"
        )
        self._rebuild_fts()

    @staticmethod
    def _aad(
        memory_id: str,
        scope_type: str,
        scope_id: str,
        category: str,
        version: int,
    ) -> bytes:
        return "\x1f".join(
            [memory_id, scope_type, scope_id, category, str(version)]
        ).encode("utf-8")

    @staticmethod
    def _lexical_text(text: str) -> str:
        normalized = re.sub(r"\s+", "", text.lower())
        grams = [normalized[index : index + 2] for index in range(len(normalized) - 1)]
        words = re.findall(r"[a-z0-9_]+", text.lower())
        return " ".join([*grams, *words])

    def _document_embedding(self, text: str) -> np.ndarray:
        vector = next(iter(self.model.embed([text])))
        return np.asarray(vector, dtype=np.float32)

    def _query_embedding(self, text: str) -> np.ndarray:
        vector = next(iter(self.model.query_embed(text)))
        return np.asarray(vector, dtype=np.float32)

    def _encrypt_payload(
        self,
        *,
        memory_id: str,
        scope_type: str,
        scope_id: str,
        category: str,
        version: int,
        content: str,
        tags: tuple[str, ...],
        embedding: np.ndarray,
    ) -> tuple[bytes, bytes]:
        payload = json.dumps(
            {
                "content": content,
                "tags": list(tags),
                "embedding": base64.b64encode(embedding.tobytes()).decode("ascii"),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        nonce = os.urandom(12)
        aad = self._aad(memory_id, scope_type, scope_id, category, version)
        return nonce, self.aes.encrypt(nonce, payload, aad)

    def _decrypt_row(self, row: sqlite3.Row | tuple[Any, ...]) -> Memory:
        (
            memory_id,
            scope_type,
            scope_id,
            category,
            version,
            nonce,
            ciphertext,
        ) = row
        aad = self._aad(memory_id, scope_type, scope_id, category, version)
        payload = json.loads(self.aes.decrypt(nonce, ciphertext, aad))
        embedding = np.frombuffer(
            base64.b64decode(payload["embedding"]), dtype=np.float32
        ).copy()
        return Memory(
            memory_id=memory_id,
            scope_type=scope_type,
            scope_id=scope_id,
            category=category,
            version=version,
            content=payload["content"],
            tags=tuple(payload["tags"]),
            embedding=embedding,
        )

    def _active_rows(
        self,
        *,
        scope_type: str | None = None,
        scope_id: str | None = None,
        category: str | None = None,
    ) -> list[tuple[Any, ...]]:
        clauses = ["disabled = 0"]
        values: list[Any] = []
        for column, value in (
            ("scope_type", scope_type),
            ("scope_id", scope_id),
            ("category", category),
        ):
            if value is not None:
                clauses.append(f"{column} = ?")
                values.append(value)
        return self.db.execute(
            "SELECT memory_id, scope_type, scope_id, category, version, nonce, ciphertext "
            f"FROM memories WHERE {' AND '.join(clauses)}",
            values,
        ).fetchall()

    def _rebuild_fts(self) -> None:
        self.fts.execute("DELETE FROM memory_fts")
        for row in self._active_rows():
            memory = self._decrypt_row(row)
            self.fts.execute(
                "INSERT INTO memory_fts(memory_id, text) VALUES (?, ?)",
                (memory.memory_id, self._lexical_text(memory.content)),
            )
        self.fts.commit()

    def add(
        self,
        *,
        memory_id: str,
        scope_type: str,
        scope_id: str,
        category: str,
        content: str,
        tags: tuple[str, ...] = (),
    ) -> None:
        embedding = self._document_embedding(content)
        if embedding.shape != (MODEL_DIMENSIONS,):
            raise ValueError(f"unexpected embedding shape: {embedding.shape}")
        version = 1
        nonce, ciphertext = self._encrypt_payload(
            memory_id=memory_id,
            scope_type=scope_type,
            scope_id=scope_id,
            category=category,
            version=version,
            content=content,
            tags=tags,
            embedding=embedding,
        )
        now = datetime.now(UTC).isoformat()
        self.db.execute(
            """
            INSERT INTO memories(
                memory_id, scope_type, scope_id, category, version, disabled,
                nonce, ciphertext, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
            """,
            (
                memory_id,
                scope_type,
                scope_id,
                category,
                version,
                nonce,
                ciphertext,
                now,
                now,
            ),
        )
        self.db.commit()
        self.fts.execute(
            "INSERT INTO memory_fts(memory_id, text) VALUES (?, ?)",
            (memory_id, self._lexical_text(content)),
        )
        self.fts.commit()

    def search(
        self,
        query: str,
        *,
        scope_type: str,
        scope_id: str,
        category: str | None = None,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        memories = [
            self._decrypt_row(row)
            for row in self._active_rows(
                scope_type=scope_type,
                scope_id=scope_id,
                category=category,
            )
        ]
        if not memories:
            return []

        allowed_ids = {memory.memory_id for memory in memories}
        query_terms = self._lexical_text(query).split()
        lexical_rank: dict[str, float] = {}
        if query_terms:
            fts_query = " OR ".join(f'"{term}"' for term in query_terms)
            rows = self.fts.execute(
                "SELECT memory_id FROM memory_fts WHERE memory_fts MATCH ? "
                "ORDER BY bm25(memory_fts) LIMIT 100",
                (fts_query,),
            ).fetchall()
            filtered = [row[0] for row in rows if row[0] in allowed_ids]
            lexical_rank = {
                memory_id: 1.0 / (rank + 1) for rank, memory_id in enumerate(filtered)
            }

        query_vector = self._query_embedding(query)
        query_norm = float(np.linalg.norm(query_vector))
        scored: list[dict[str, Any]] = []
        for memory in memories:
            denominator = query_norm * float(np.linalg.norm(memory.embedding))
            cosine = (
                float(np.dot(query_vector, memory.embedding)) / denominator
                if denominator > 0
                else 0.0
            )
            lexical = lexical_rank.get(memory.memory_id, 0.0)
            scored.append(
                {
                    "memory_id": memory.memory_id,
                    "category": memory.category,
                    "content": memory.content,
                    "score": round(0.65 * cosine + 0.35 * lexical, 6),
                    "vector_score": round(cosine, 6),
                    "lexical_score": round(lexical, 6),
                }
            )
        scored.sort(key=lambda item: (-item["score"], item["memory_id"]))
        return scored[:limit]

    def delete(self, memory_id: str) -> bool:
        cursor = self.db.execute("DELETE FROM memories WHERE memory_id = ?", (memory_id,))
        self.db.commit()
        if cursor.rowcount == 0:
            return False
        self.db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        self.db.execute("VACUUM")
        self.db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        self._rebuild_fts()
        return True

    def count(self) -> int:
        return int(self.db.execute("SELECT COUNT(*) FROM memories").fetchone()[0])

    def ciphertext(self, memory_id: str) -> bytes:
        row = self.db.execute(
            "SELECT ciphertext FROM memories WHERE memory_id = ?", (memory_id,)
        ).fetchone()
        if row is None:
            raise KeyError(memory_id)
        return bytes(row[0])

    def close(self) -> None:
        self.fts.close()
        self.db.close()


def file_contains(root: Path, marker: bytes) -> bool:
    return any(
        marker in path.read_bytes()
        for path in root.glob("memory.sqlite*")
        if path.is_file()
    )


def build_model() -> TextEmbedding:
    MODEL_CACHE.mkdir(parents=True, exist_ok=True)
    model = TextEmbedding(
        model_name=MODEL_NAME,
        cache_dir=str(MODEL_CACHE),
        threads=1,
        providers=["CPUExecutionProvider"],
    )
    model_files = list(MODEL_CACHE.glob("**/model_optimized.onnx"))
    if len(model_files) != 1:
        raise RuntimeError(f"expected one ONNX model file, found {len(model_files)}")
    actual_sha256 = hashlib.sha256(model_files[0].read_bytes()).hexdigest()
    if actual_sha256 != MODEL_ONNX_SHA256:
        raise RuntimeError(
            f"model SHA-256 mismatch: expected {MODEL_ONNX_SHA256}, got {actual_sha256}"
        )
    return model


def download() -> None:
    model = build_model()
    vector = next(iter(model.query_embed("模型完整性检查")))
    payload = {
        "model": MODEL_NAME,
        "dimensions": len(vector),
        "expected_onnx_sha256": MODEL_ONNX_SHA256,
        "cache_dir": str(MODEL_CACHE),
    }
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    del vector
    del model
    gc.collect()


def verify() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db_path = DATA_DIR / "memory.sqlite"
    for candidate in DATA_DIR.glob("memory.sqlite*"):
        candidate.unlink()

    model = build_model()
    key = os.urandom(32)
    store = LocalMemoryStore(db_path, key, model)
    secret_marker = "LOCAL_MEMORY_SECRET_MARKER_8F0A27D1"
    store.add(
        memory_id="publish-rule",
        scope_type="employee",
        scope_id="employee-a",
        category="instruction",
        content=f"{secret_marker} 所有发布操作必须先运行完整测试，然后由用户确认。",
        tags=("发布", "验证"),
    )
    store.add(
        memory_id="release-event",
        scope_type="employee",
        scope_id="employee-a",
        category="episodic",
        content="项目计划在下周一发布新版客户端。",
    )
    store.add(
        memory_id="other-employee",
        scope_type="employee",
        scope_id="employee-b",
        category="instruction",
        content="报销申请需要提交纸质发票。",
    )

    assert not file_contains(DATA_DIR, secret_marker.encode("utf-8"))

    lexical_results = store.search(
        "发布前完整测试",
        scope_type="employee",
        scope_id="employee-a",
        category="instruction",
    )
    semantic_results = store.search(
        "上线之前需要完成哪些检查？",
        scope_type="employee",
        scope_id="employee-a",
        category="instruction",
    )
    episodic_results = store.search(
        "新版客户端什么时候上线？",
        scope_type="employee",
        scope_id="employee-a",
        category="episodic",
    )
    assert lexical_results[0]["memory_id"] == "publish-rule"
    assert semantic_results[0]["memory_id"] == "publish-rule"
    assert episodic_results[0]["memory_id"] == "release-event"
    assert all(item["memory_id"] != "other-employee" for item in lexical_results)

    deleted_ciphertext = store.ciphertext("publish-rule")
    assert store.delete("publish-rule")
    after_delete = store.search(
        "发布前完整测试",
        scope_type="employee",
        scope_id="employee-a",
        category="instruction",
    )
    assert after_delete == []
    assert store.count() == 2
    store.close()
    assert not file_contains(DATA_DIR, secret_marker.encode("utf-8"))
    assert not file_contains(DATA_DIR, deleted_ciphertext)

    def evidence(item: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in item.items() if key != "content"}

    payload = {
        "encrypted_at_rest": True,
        "model": MODEL_NAME,
        "dimensions": MODEL_DIMENSIONS,
        "lexical_top": evidence(lexical_results[0]),
        "semantic_top": evidence(semantic_results[0]),
        "category_top": evidence(episodic_results[0]),
        "scope_isolation": True,
        "deleted_not_recalled": after_delete == [],
        "deleted_plaintext_absent": not file_contains(
            DATA_DIR, secret_marker.encode("utf-8")
        ),
        "deleted_ciphertext_absent": not file_contains(DATA_DIR, deleted_ciphertext),
        "remaining_count": 2,
    }
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    del model
    gc.collect()


if __name__ == "__main__":
    {"download": download, "verify": verify}[sys.argv[1]]()
