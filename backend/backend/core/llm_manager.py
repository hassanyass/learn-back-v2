import os
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Iterable


class LLMFallbackExhaustedError(RuntimeError):
    """Raised when no provider/key combination can complete the request."""


class LLMRateLimitError(Exception):
    """Local rate-limit signal for provider call adapters."""


def _parse_key_pool(env_name: str) -> list[str]:
    raw = os.getenv(env_name, "").strip()
    if not raw:
        return []
    return [key.strip() for key in raw.split(",") if key.strip()]


def _is_http_429_error(exc: Exception) -> bool:
    status_code = getattr(exc, "status_code", None)
    if status_code == 429:
        return True

    response = getattr(exc, "response", None)
    if response is not None and getattr(response, "status_code", None) == 429:
        return True

    return False


@dataclass
class ProviderPool:
    name: str
    keys: list[str]
    call: Callable[[str, str], Awaitable[Any]]


class LLMManager:
    """
    Key-rotating LLM fallback manager.

    Rotation order:
    1) Primary provider key pool (default: Groq)
    2) Secondary provider key pool (default: OpenAI or OSS API)
    """

    def __init__(
        self,
        primary_call: Callable[[str, str], Awaitable[Any]],
        secondary_call: Callable[[str, str], Awaitable[Any]] | None = None,
        primary_keys: Iterable[str] | None = None,
        secondary_keys: Iterable[str] | None = None,
        primary_name: str = "groq",
        secondary_name: str = "secondary",
    ) -> None:
        self.primary = ProviderPool(
            name=primary_name,
            keys=list(primary_keys) if primary_keys is not None else _parse_key_pool("GROQ_API_KEYS"),
            call=primary_call,
        )
        self.secondary = (
            ProviderPool(
                name=secondary_name,
                keys=list(secondary_keys)
                if secondary_keys is not None
                else _parse_key_pool("SECONDARY_LLM_API_KEYS"),
                call=secondary_call,
            )
            if secondary_call is not None
            else None
        )

    async def call_with_fallback(self, prompt: str) -> Any:
        errors: list[str] = []

        primary_result = await self._try_provider(self.primary, prompt, errors)
        if primary_result is not None:
            return primary_result

        if self.secondary is not None:
            secondary_result = await self._try_provider(self.secondary, prompt, errors)
            if secondary_result is not None:
                return secondary_result

        joined_errors = "; ".join(errors) if errors else "no provider keys configured"
        raise LLMFallbackExhaustedError(
            f"All LLM providers exhausted. Detail: {joined_errors}"
        )

    async def _try_provider(
        self,
        provider: ProviderPool,
        prompt: str,
        errors: list[str],
    ) -> Any | None:
        if not provider.keys:
            errors.append(f"{provider.name}: missing API keys")
            return None

        for idx, key in enumerate(provider.keys):
            try:
                return await provider.call(prompt, key)
            except Exception as exc:
                if isinstance(exc, LLMRateLimitError) or _is_http_429_error(exc):
                    errors.append(f"{provider.name}[{idx}]: rate limited (429), rotating key")
                    continue

                errors.append(f"{provider.name}[{idx}]: non-retriable error ({exc})")
                break

        return None
