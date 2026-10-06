import unittest
from unittest.mock import MagicMock, patch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server", "utils", "rag_parsers"))
from llm_client import call_llm_with_fallback, UnifiedResponse

class TestLLMClientFallback(unittest.TestCase):

    @patch("anthropic.Anthropic")
    def test_anthropic_temperature_type_error_recovery(self, mock_anthropic_cls):
        mock_client = MagicMock()
        mock_anthropic_cls.return_value = mock_client

        call_count = 0
        def fake_create(**kwargs):
            nonlocal call_count
            call_count += 1
            if "temperature" in kwargs:
                raise TypeError("Messages.create() got an unexpected keyword argument 'temperature'")
            resp = MagicMock()
            resp.content = [MagicMock(text="success text")]
            resp.usage = MagicMock(input_tokens=10, output_tokens=20)
            return resp

        mock_client.messages.create.side_effect = fake_create

        res = call_llm_with_fallback(
            messages=[{"role": "user", "content": "hello"}],
            anthropic_key="fake-key",
            temperature=0.1
        )
        self.assertEqual(res.content[0].text, "success text")
        self.assertEqual(call_count, 2)

    @patch.dict(os.environ, {"OPENAI_API_KEY": "fake-oai-key", "OPENAI_MODEL": "gpt6-luna"})
    @patch("openai.OpenAI")
    def test_openai_hallucinated_model_fallback(self, mock_openai_cls):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client

        # Simulate gpt6-luna (if passed) failing with 404 model_not_found, but gpt-4o succeeding
        def fake_chat_create(**kwargs):
            model = kwargs.get("model")
            if model == "gpt6-luna":
                raise Exception("Error code: 404 - {'error': {'message': 'The model `gpt6-luna` does not exist', 'code': 'model_not_found'}}")
            resp = MagicMock()
            resp.choices = [MagicMock(message=MagicMock(content=f"answer from {model}"))]
            resp.usage = MagicMock(prompt_tokens=5, completion_tokens=15)
            return resp

        mock_client.chat.completions.create.side_effect = fake_chat_create

        res = call_llm_with_fallback(
            messages=[{"role": "user", "content": "analyze image"}],
            anthropic_key=None
        )
        self.assertIn("gpt-4o", res.content[0].text)

if __name__ == "__main__":
    unittest.main()
