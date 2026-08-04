"""Minimal worker health surface; reasoning integration follows the contract baseline."""


def health() -> dict[str, str]:
    return {"status": "ok", "service": "python-agent"}


if __name__ == "__main__":
    print(health())
