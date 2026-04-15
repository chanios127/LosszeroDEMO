import os

from llm.base import LLMProvider
from llm.claude import ClaudeProvider
from llm.lm_studio import LMStudioProvider


def get_provider() -> LLMProvider:
    provider_name = os.environ.get("LLM_PROVIDER", "claude").lower()
    if provider_name == "lm_studio":
        return LMStudioProvider()
    if provider_name == "claude":
        return ClaudeProvider()
    raise ValueError(f"Unknown LLM_PROVIDER: {provider_name!r}. Use 'claude' or 'lm_studio'.")
