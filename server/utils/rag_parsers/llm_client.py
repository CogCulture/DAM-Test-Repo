"""
llm_client.py
Unified LLM caller with automatic fallback from Claude (Anthropic) to ChatGPT (OpenAI).
Supports both text generation and multimodal vision inputs.
"""

import os
import sys
import json
import time

class UnifiedUsage:
    def __init__(self, input_tokens=0, output_tokens=0):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens

    def get(self, key, default=None):
        return getattr(self, key, default)

    def __getitem__(self, key):
        return getattr(self, key)

class UnifiedTextBlock:
    def __init__(self, text=""):
        self.text = text

class UnifiedResponse:
    def __init__(self, text="", input_tokens=0, output_tokens=0):
        self.content = [UnifiedTextBlock(text)]
        self.usage = UnifiedUsage(input_tokens, output_tokens)

def call_llm_with_fallback(
    messages: list,
    system: str = None,
    model: str = None,
    max_tokens: int = 4096,
    temperature: float = 0.1,
    anthropic_key: str = None,
    openai_model: str = "gpt-4o",
    max_retries: int = 2
) -> UnifiedResponse:
    """
    Primary: Calls Anthropic Claude.
    Fallback: If Anthropic fails (or is unconfigured) and OPENAI_API_KEY is present,
              automatically translates message payload and calls OpenAI ChatGPT.
    """
    anthropic_key = anthropic_key or os.environ.get("ANTHROPIC_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")
    claude_model = model or os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")

    anthropic_err = None

    # 1. Attempt Anthropic Claude if key is provided
    if anthropic_key:
        for attempt in range(max_retries):
            try:
                from anthropic import Anthropic
                client = Anthropic(api_key=anthropic_key)
                kwargs = {
                    "model": claude_model,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "messages": messages,
                }
                if system:
                    kwargs["system"] = system
                resp = client.messages.create(**kwargs)
                return resp
            except Exception as exc:
                anthropic_err = exc
                err_msg = str(exc).lower()
                is_rate_limit = "429" in err_msg or "rate limit" in err_msg or "overloaded" in err_msg
                is_server_err = "50" in err_msg or "server error" in err_msg
                if (is_rate_limit or is_server_err) and attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 3
                    time.sleep(wait_time)
                    continue
                break

    # 2. Fallback to OpenAI ChatGPT
    if openai_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=openai_key)
            target_openai_model = os.environ.get("OPENAI_MODEL", openai_model or "gpt-4o")

            print(json.dumps({
                "type": "progress",
                "text": f"[AI Fallback] Claude unavailable ({anthropic_err or 'No key'}). Using ChatGPT ({target_openai_model})...\n"
            }), flush=True)

            openai_messages = []
            if system:
                openai_messages.append({"role": "system", "content": system})

            for msg in messages:
                role = msg.get("role", "user")
                content = msg.get("content")
                if isinstance(content, str):
                    openai_messages.append({"role": role, "content": content})
                elif isinstance(content, list):
                    converted_parts = []
                    for part in content:
                        p_type = part.get("type")
                        if p_type == "text":
                            converted_parts.append({"type": "text", "text": part.get("text", "")})
                        elif p_type == "image":
                            source = part.get("source", {})
                            data = source.get("data", "")
                            m_type = source.get("media_type", "image/jpeg")
                            converted_parts.append({
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{m_type};base64,{data}"
                                }
                            })
                    openai_messages.append({"role": role, "content": converted_parts})

            chat_kwargs = {
                "model": target_openai_model,
                "messages": openai_messages,
            }
            if target_openai_model.startswith("o1") or target_openai_model.startswith("o3"):
                chat_kwargs["max_completion_tokens"] = max_tokens
            else:
                chat_kwargs["max_tokens"] = max_tokens
                chat_kwargs["temperature"] = temperature

            chat_resp = client.chat.completions.create(**chat_kwargs)

            out_text = chat_resp.choices[0].message.content or ""
            in_tokens = chat_resp.usage.prompt_tokens if chat_resp.usage else 0
            out_tokens = chat_resp.usage.completion_tokens if chat_resp.usage else 0

            return UnifiedResponse(out_text, in_tokens, out_tokens)


        except Exception as oai_err:
            raise RuntimeError(
                f"Both Claude and ChatGPT fallbacks failed. Claude: {anthropic_err} | OpenAI: {oai_err}"
            ) from oai_err

    # If neither succeeded and no OpenAI key
    if anthropic_err:
        raise anthropic_err
    raise RuntimeError("No LLM API keys configured. Please provide ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.")
