from __future__ import annotations

import base64
import gc
import hashlib
import json
import math
import os
import re
import socket
import sqlite3
import subprocess
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastembed import TextEmbedding

MODEL_NAME = "BAAI/bge-small-zh-v1.5"
MODEL_DIMENSIONS = 512
MODEL_ONNX_SHA256 = "1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38"
SCOPES = {"global", "employee", "task"}
CATEGORIES = {"preference", "fact", "rule", "knowledge", "experience", "summary"}
STATUSES = {"active", "pending_verification", "conflicted", "disabled"}
SENSITIVE = [
    re.compile(r"\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{12,}\b"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"\b(?:api[_-]?key|authorization|cookie|password)\s*[:=]", re.I),
]


class NetworkDeniedSocket(socket.socket):
    def connect(self, address: object) -> None:
        raise PermissionError("memory_worker_network_denied")

    def connect_ex(self, address: object) -> int:
        raise PermissionError("memory_worker_network_denied")


def now() -> str:
    return datetime.now(UTC).isoformat()


def lexical_text(text: str) -> str:
    normalized = re.sub(r"[^\w\u3400-\u9fff]+", "", text.lower())
    grams = [normalized[index:index + 2] for index in range(max(0, len(normalized) - 1))]
    words = re.findall(r"[a-z0-9_]+", text.lower())
    return " ".join([*grams, *words])


def model_file(cache: Path) -> Path | None:
    matches = list(cache.glob("**/model_optimized.onnx"))
    if len(matches) != 1:
        return None
    if hashlib.sha256(matches[0].read_bytes()).hexdigest() != MODEL_ONNX_SHA256:
        raise RuntimeError("embedding_model_hash_mismatch")
    return matches[0]


def build_model(cache: Path, allow_download: bool) -> TextEmbedding | None:
    cache.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not allow_download and model_file(cache) is None:
        return None
    if not allow_download:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
    model = TextEmbedding(model_name=MODEL_NAME, cache_dir=str(cache), threads=1, providers=["CPUExecutionProvider"])
    if model_file(cache) is None:
        raise RuntimeError("embedding_model_missing")
    return model


def memory_key(helper: Path) -> bytes:
    if not helper.is_file() or not os.access(helper, os.X_OK):
        raise RuntimeError("memory_keychain_helper_unavailable")
    completed = subprocess.run([str(helper)], check=True, capture_output=True, timeout=10)
    key = base64.b64decode(completed.stdout.strip(), validate=True)
    if len(key) != 32:
        raise RuntimeError("invalid_memory_master_key")
    return key


class MemoryStore:
    def __init__(self, db_path: Path, key: bytes, model: TextEmbedding | None):
        db_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db_path = db_path
        self.aes = AESGCM(key)
        self.model = model
        self.db = sqlite3.connect(db_path)
        self.db.execute("PRAGMA busy_timeout=5000")
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA secure_delete=ON")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS memories (
                memory_id TEXT PRIMARY KEY, scope_type TEXT NOT NULL, scope_id TEXT NOT NULL,
                category TEXT NOT NULL, current_version INTEGER NOT NULL, status TEXT NOT NULL,
                conflict_group_id TEXT, nonce BLOB NOT NULL, ciphertext BLOB NOT NULL,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_memory_scope ON memories(scope_type, scope_id, category, status);
            CREATE TABLE IF NOT EXISTS memory_versions (
                memory_id TEXT NOT NULL, version INTEGER NOT NULL, nonce BLOB NOT NULL,
                ciphertext BLOB NOT NULL, created_at TEXT NOT NULL,
                PRIMARY KEY(memory_id, version), FOREIGN KEY(memory_id) REFERENCES memories(memory_id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS memory_queue (
                queue_id TEXT PRIMARY KEY, source_type TEXT NOT NULL, source_ref TEXT NOT NULL,
                scope_type TEXT NOT NULL, scope_id TEXT NOT NULL, state TEXT NOT NULL,
                nonce BLOB NOT NULL, ciphertext BLOB NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS memory_recalls (
                recall_id TEXT PRIMARY KEY, query_hash TEXT NOT NULL, memory_id TEXT NOT NULL,
                score REAL NOT NULL, reason TEXT NOT NULL, recalled_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS memory_tombstones (
                memory_id TEXT PRIMARY KEY, scope_type TEXT NOT NULL, scope_id TEXT NOT NULL,
                deleted_at TEXT NOT NULL
            );
        """)
        self.db.commit()

    @staticmethod
    def aad(memory_id: str, scope_type: str, scope_id: str, category: str, version: int) -> bytes:
        return "\x1f".join([memory_id, scope_type, scope_id, category, str(version)]).encode()

    def embedding(self, content: str, query: bool = False) -> np.ndarray | None:
        if self.model is None:
            return None
        value = next(iter(self.model.query_embed(content) if query else self.model.embed([content])))
        vector = np.asarray(value, dtype=np.float32)
        if vector.shape != (MODEL_DIMENSIONS,):
            raise RuntimeError("embedding_dimension_mismatch")
        return vector

    def encrypt(self, memory_id: str, scope_type: str, scope_id: str, category: str, version: int, payload: dict[str, Any]) -> tuple[bytes, bytes]:
        nonce = os.urandom(12)
        plaintext = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        return nonce, self.aes.encrypt(nonce, plaintext, self.aad(memory_id, scope_type, scope_id, category, version))

    def decrypt(self, row: tuple[Any, ...]) -> dict[str, Any]:
        memory_id, scope_type, scope_id, category, version, nonce, ciphertext = row[:7]
        payload = json.loads(self.aes.decrypt(nonce, ciphertext, self.aad(memory_id, scope_type, scope_id, category, version)))
        return {"id": memory_id, "scopeType": scope_type, "scopeId": scope_id, "category": category, "version": version, **payload}

    def require_record(self, memory_id: str) -> tuple[Any, ...]:
        row = self.db.execute("SELECT memory_id, scope_type, scope_id, category, current_version, nonce, ciphertext, status, conflict_group_id, created_at, updated_at FROM memories WHERE memory_id=?", (memory_id,)).fetchone()
        if row is None:
            raise ValueError("memory_not_found")
        return row

    def add(self, value: dict[str, Any]) -> dict[str, Any]:
        memory_id = str(value.get("id") or uuid.uuid4())
        scope_type, scope_id, category = str(value["scopeType"]), str(value["scopeId"]), str(value["category"])
        content = str(value["content"]).strip()
        tags = sorted({str(tag).strip() for tag in value.get("tags", []) if str(tag).strip()})
        status = str(value.get("status", "active"))
        if scope_type not in SCOPES or not scope_id or category not in CATEGORIES or status not in STATUSES or not content or len(content) > 50_000 or len(tags) > 32:
            raise ValueError("invalid_memory")
        if any(pattern.search(content) for pattern in SENSITIVE):
            raise ValueError("sensitive_memory_input")
        if self.db.execute("SELECT 1 FROM memories WHERE memory_id=?", (memory_id,)).fetchone():
            raise ValueError("memory_already_exists")
        vector = self.embedding(content)
        payload = {"content": content, "tags": tags, "sourceRefs": sorted({str(ref) for ref in value.get("sourceRefs", [])}), "embedding": base64.b64encode(vector.tobytes()).decode() if vector is not None else None, "indexVersion": MODEL_ONNX_SHA256 if vector is not None else "bm25-only"}
        version = 1
        nonce, ciphertext = self.encrypt(memory_id, scope_type, scope_id, category, version, payload)
        timestamp = now()
        conflict_with = value.get("conflictWith")
        conflict_group = None
        if conflict_with:
            other = self.require_record(str(conflict_with)); conflict_group = other[8] or str(uuid.uuid4()); status = "conflicted"
            self.db.execute("UPDATE memories SET status='conflicted', conflict_group_id=?, updated_at=? WHERE memory_id=?", (conflict_group, timestamp, str(conflict_with)))
        self.db.execute("INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?,?)", (memory_id, scope_type, scope_id, category, version, status, conflict_group, nonce, ciphertext, timestamp, timestamp))
        self.db.execute("INSERT INTO memory_versions VALUES(?,?,?,?,?)", (memory_id, version, nonce, ciphertext, timestamp))
        self.db.commit()
        return self.get(memory_id)

    def get(self, memory_id: str) -> dict[str, Any]:
        row = self.require_record(memory_id)
        value = self.decrypt(row[:7])
        return {**value, "status": row[7], "conflictGroupId": row[8], "createdAt": row[9], "updatedAt": row[10]}

    def list(self, filters: dict[str, Any]) -> list[dict[str, Any]]:
        clauses, values = ["1=1"], []
        for column, key in (("scope_type", "scopeType"), ("scope_id", "scopeId"), ("category", "category"), ("status", "status")):
            if filters.get(key): clauses.append(f"{column}=?"); values.append(str(filters[key]))
        rows = self.db.execute(f"SELECT memory_id FROM memories WHERE {' AND '.join(clauses)} ORDER BY updated_at DESC", values).fetchall()
        return [self.get(row[0]) for row in rows]

    def update(self, memory_id: str, changes: dict[str, Any]) -> dict[str, Any]:
        current = self.get(memory_id)
        scope_type = str(changes.get("scopeType", current["scopeType"])); scope_id = str(changes.get("scopeId", current["scopeId"])); category = str(changes.get("category", current["category"])); content = str(changes.get("content", current["content"])).strip(); tags = sorted({str(tag).strip() for tag in changes.get("tags", current["tags"]) if str(tag).strip()})
        if scope_type not in SCOPES or not scope_id or category not in CATEGORIES or not content or any(pattern.search(content) for pattern in SENSITIVE):
            raise ValueError("invalid_memory_update")
        version = int(current["version"]) + 1; vector = self.embedding(content)
        payload = {"content": content, "tags": tags, "sourceRefs": current["sourceRefs"], "embedding": base64.b64encode(vector.tobytes()).decode() if vector is not None else None, "indexVersion": MODEL_ONNX_SHA256 if vector is not None else "bm25-only"}
        nonce, ciphertext = self.encrypt(memory_id, scope_type, scope_id, category, version, payload); timestamp = now()
        self.db.execute("UPDATE memories SET scope_type=?, scope_id=?, category=?, current_version=?, nonce=?, ciphertext=?, updated_at=? WHERE memory_id=?", (scope_type, scope_id, category, version, nonce, ciphertext, timestamp, memory_id))
        self.db.execute("INSERT INTO memory_versions VALUES(?,?,?,?,?)", (memory_id, version, nonce, ciphertext, timestamp)); self.db.commit()
        return self.get(memory_id)

    def set_status(self, memory_id: str, status: str) -> dict[str, Any]:
        if status not in {"active", "disabled", "pending_verification"}: raise ValueError("invalid_memory_status")
        self.require_record(memory_id); self.db.execute("UPDATE memories SET status=?, updated_at=? WHERE memory_id=?", (status, now(), memory_id)); self.db.commit(); return self.get(memory_id)

    def resolve_conflict(self, chosen_id: str) -> dict[str, Any]:
        chosen = self.require_record(chosen_id); group = chosen[8]
        if chosen[7] != "conflicted" or not group: raise ValueError("memory_not_conflicted")
        self.db.execute("UPDATE memories SET status='disabled', updated_at=? WHERE conflict_group_id=?", (now(), group))
        self.db.execute("UPDATE memories SET status='active', conflict_group_id=NULL, updated_at=? WHERE memory_id=?", (now(), chosen_id)); self.db.commit(); return self.get(chosen_id)

    def search(self, request: dict[str, Any]) -> list[dict[str, Any]]:
        query = str(request["query"]).strip(); scopes = request.get("allowedScopes", []); categories = set(request.get("categories", [])); required_tags = set(request.get("tags", [])); limit = min(20, max(1, int(request.get("limit", 5)))); token_budget = min(8192, max(32, int(request.get("tokenBudget", 1024))))
        if not query or not scopes or any(scope.get("type") not in SCOPES or not scope.get("id") for scope in scopes) or any(category not in CATEGORIES for category in categories): raise ValueError("invalid_memory_search")
        candidates: list[dict[str, Any]] = []
        for scope in scopes:
            rows = self.db.execute("SELECT memory_id FROM memories WHERE scope_type=? AND scope_id=? AND status='active'", (scope["type"], scope["id"])).fetchall()
            for row in rows:
                value = self.get(row[0])
                if categories and value["category"] not in categories: continue
                if required_tags and not required_tags.intersection(value["tags"]): continue
                candidates.append(value)
        if not candidates: return []
        fts = sqlite3.connect(":memory:"); fts.execute("CREATE VIRTUAL TABLE memory_fts USING fts5(memory_id UNINDEXED, text)")
        for value in candidates: fts.execute("INSERT INTO memory_fts VALUES(?,?)", (value["id"], lexical_text(value["content"])))
        terms = lexical_text(query).split(); lexical_rank: dict[str, int] = {}
        if terms:
            expression = " OR ".join(f'"{term}"' for term in terms)
            for rank, row in enumerate(fts.execute("SELECT memory_id FROM memory_fts WHERE memory_fts MATCH ? ORDER BY bm25(memory_fts)", (expression,)).fetchall()): lexical_rank[row[0]] = rank + 1
        fts.close()
        query_vector = self.embedding(query, query=True); vector_values: list[tuple[str, float]] = []
        if query_vector is not None:
            query_norm = float(np.linalg.norm(query_vector))
            for value in candidates:
                encoded = value.get("embedding")
                if not encoded: continue
                vector = np.frombuffer(base64.b64decode(encoded), dtype=np.float32); denom = query_norm * float(np.linalg.norm(vector)); cosine = float(np.dot(query_vector, vector)) / denom if denom else 0.0; vector_values.append((value["id"], cosine))
        vector_values.sort(key=lambda item: (-item[1], item[0])); vector_rank = {memory_id: rank + 1 for rank, (memory_id, _) in enumerate(vector_values)}; vector_score = dict(vector_values)
        scored = []
        for value in candidates:
            lexical = 1 / (60 + lexical_rank[value["id"]]) if value["id"] in lexical_rank else 0.0; vector = 1 / (60 + vector_rank[value["id"]]) if value["id"] in vector_rank else 0.0; age_days = max(0.0, (datetime.now(UTC) - datetime.fromisoformat(value["updatedAt"])).total_seconds() / 86400); recency = 0.002 / (1 + age_days / 30); provenance = 0.001 if value.get("sourceRefs") else 0.0; score = lexical + vector + recency + provenance
            scored.append({**value, "score": round(score, 8), "vectorScore": round(vector_score.get(value["id"], 0.0), 6), "lexicalMatched": value["id"] in lexical_rank, "reason": "scope+category+hybrid+recency+provenance"})
        scored.sort(key=lambda item: (-item["score"], item["id"])); results, consumed = [], 0
        for value in scored:
            tokens = max(1, math.ceil(len(value["content"]) / 4))
            if consumed + tokens > token_budget: continue
            consumed += tokens; results.append({**value, "estimatedTokens": tokens});
            self.db.execute("INSERT INTO memory_recalls VALUES(?,?,?,?,?,?)", (str(uuid.uuid4()), hashlib.sha256(query.encode()).hexdigest(), value["id"], value["score"], value["reason"], now()))
            if len(results) >= limit: break
        self.db.commit(); return results

    def enqueue(self, value: dict[str, Any]) -> dict[str, Any]:
        source_type = str(value["sourceType"]); source_ref = str(value["sourceRef"]); scope_type = str(value["scopeType"]); scope_id = str(value["scopeId"]); content = str(value["content"])
        if source_type not in {"conversation", "task"} or scope_type not in SCOPES or not scope_id or not content or source_type == "sandbox_test" or any(pattern.search(content) for pattern in SENSITIVE): raise ValueError("invalid_memory_queue_item")
        queue_id = str(uuid.uuid4()); nonce = os.urandom(12); aad = f"queue\x1f{queue_id}\x1f{source_type}\x1f{source_ref}".encode(); ciphertext = self.aes.encrypt(nonce, json.dumps({"content": content}, ensure_ascii=False).encode(), aad); timestamp = now()
        self.db.execute("INSERT INTO memory_queue VALUES(?,?,?,?,?,?,?,?,?)", (queue_id, source_type, source_ref, scope_type, scope_id, "pending_authorization", nonce, ciphertext, timestamp)); self.db.commit(); return {"id": queue_id, "sourceType": source_type, "sourceRef": source_ref, "scopeType": scope_type, "scopeId": scope_id, "state": "pending_authorization", "createdAt": timestamp}

    def queue_list(self) -> list[dict[str, Any]]:
        return [{"id": row[0], "sourceType": row[1], "sourceRef": row[2], "scopeType": row[3], "scopeId": row[4], "state": row[5], "createdAt": row[6]} for row in self.db.execute("SELECT queue_id,source_type,source_ref,scope_type,scope_id,state,created_at FROM memory_queue ORDER BY created_at DESC")]

    def migrate_embeddings(self) -> dict[str, int]:
        if self.model is None: raise ValueError("embedding_model_not_ready")
        migrated = 0
        for row in self.db.execute("SELECT memory_id FROM memories").fetchall():
            value = self.get(row[0])
            if value.get("indexVersion") == MODEL_ONNX_SHA256: continue
            vector = self.embedding(value["content"]); payload = {"content": value["content"], "tags": value["tags"], "sourceRefs": value["sourceRefs"], "embedding": base64.b64encode(vector.tobytes()).decode(), "indexVersion": MODEL_ONNX_SHA256}; nonce, ciphertext = self.encrypt(value["id"], value["scopeType"], value["scopeId"], value["category"], value["version"], payload)
            self.db.execute("UPDATE memories SET nonce=?, ciphertext=?, updated_at=? WHERE memory_id=?", (nonce, ciphertext, now(), value["id"])); migrated += 1
        self.db.commit(); return {"migrated": migrated}

    def delete(self, memory_id: str) -> dict[str, Any]:
        row = self.require_record(memory_id); scope_type, scope_id = row[1], row[2]
        self.db.execute("DELETE FROM memory_recalls WHERE memory_id=?", (memory_id,)); self.db.execute("DELETE FROM memory_queue WHERE source_ref IN (?,?)", (memory_id, f"memory:{memory_id}")); self.db.execute("DELETE FROM memories WHERE memory_id=?", (memory_id,)); self.db.execute("INSERT OR REPLACE INTO memory_tombstones VALUES(?,?,?,?)", (memory_id, scope_type, scope_id, now())); self.db.commit(); self.db.execute("PRAGMA wal_checkpoint(TRUNCATE)"); self.db.execute("VACUUM"); self.db.execute("PRAGMA wal_checkpoint(TRUNCATE)"); return {"deleted": True, "memoryId": memory_id, "externalBackupsExcluded": True}

    def status(self, cache: Path) -> dict[str, Any]:
        ready = model_file(cache) is not None
        return {"state": "ready", "model": MODEL_NAME, "dimensions": MODEL_DIMENSIONS, "modelSha256": MODEL_ONNX_SHA256, "embedding": "hybrid" if ready else "bm25_only", "memoryCount": self.db.execute("SELECT COUNT(*) FROM memories").fetchone()[0], "pendingQueueCount": self.db.execute("SELECT COUNT(*) FROM memory_queue WHERE state='pending_authorization'").fetchone()[0], "checkedAt": now()}

    def close(self) -> None:
        self.db.close()


def main() -> None:
    if len(sys.argv) != 6 or sys.argv[1] != "command":
        raise SystemExit("usage: memory_worker.py command DB_PATH MODEL_CACHE KEYCHAIN_HELPER OPERATION")
    db_path, cache, helper, operation = Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve(), Path(sys.argv[4]).resolve(), sys.argv[5]
    payload = json.load(sys.stdin) if not sys.stdin.isatty() else {}
    if operation == "download":
        model = build_model(cache, allow_download=True); vector = next(iter(model.query_embed("模型完整性检查"))); print(json.dumps({"model": MODEL_NAME, "dimensions": len(vector), "modelSha256": MODEL_ONNX_SHA256, "state": "ready"}, sort_keys=True)); return
    model = build_model(cache, allow_download=False) if operation in {"add", "update", "search", "migrate_embeddings"} else None
    socket.socket = NetworkDeniedSocket
    store = MemoryStore(db_path, memory_key(helper), model)
    try:
        if operation == "status": result = store.status(cache)
        elif operation == "add": result = store.add(payload)
        elif operation == "get": result = store.get(str(payload["id"]))
        elif operation == "list": result = store.list(payload)
        elif operation == "update": result = store.update(str(payload["id"]), payload.get("changes", {}))
        elif operation == "disable": result = store.set_status(str(payload["id"]), "disabled")
        elif operation == "restore": result = store.set_status(str(payload["id"]), "active")
        elif operation == "resolve_conflict": result = store.resolve_conflict(str(payload["chosenId"]))
        elif operation == "search": result = store.search(payload)
        elif operation == "enqueue": result = store.enqueue(payload)
        elif operation == "queue_list": result = store.queue_list()
        elif operation == "migrate_embeddings": result = store.migrate_embeddings()
        elif operation == "delete": result = store.delete(str(payload["id"]))
        else: raise ValueError("unknown_memory_operation")
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    finally:
        store.close(); gc.collect()


if __name__ == "__main__":
    try: main()
    except Exception as error:
        print(json.dumps({"error": str(error).split(":")[0]}, sort_keys=True), file=sys.stderr)
        raise SystemExit(1)
