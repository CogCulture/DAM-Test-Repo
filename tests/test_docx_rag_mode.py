import os
import sys
import unittest


PARSERS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "server", "utils", "rag_parsers")
if PARSERS_DIR not in sys.path:
    sys.path.insert(0, PARSERS_DIR)

from processor import run_anthropic_analysis


class _Usage:
    input_tokens = 12
    output_tokens = 7


class _Text:
    text = "Interactive result"


class _Response:
    content = [_Text()]
    usage = _Usage()


class _Messages:
    def __init__(self):
        self.calls = []

    def create(self, **params):
        self.calls.append(params)
        return _Response()


class _Client:
    def __init__(self):
        self.messages = _Messages()


class DocxRagModeTests(unittest.TestCase):
    def test_non_batch_mode_uses_interactive_messages_api(self):
        client = _Client()
        requests = [{
            "custom_id": "docx_1",
            "params": {
                "model": "claude-test",
                "max_tokens": 256,
                "messages": [{"role": "user", "content": "Document"}],
            },
        }]

        text, input_tokens, output_tokens = run_anthropic_analysis(
            client,
            requests,
            use_batch=False,
        )

        self.assertEqual(text, "Interactive result")
        self.assertEqual((input_tokens, output_tokens), (12, 7))
        self.assertEqual(len(client.messages.calls), 1)
        self.assertEqual(client.messages.calls[0]["model"], "claude-test")


if __name__ == "__main__":
    unittest.main()
