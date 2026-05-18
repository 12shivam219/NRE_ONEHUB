import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import jwt

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api_server.auth_utils import issue_onlyoffice_config_token


class OnlyOfficeAuthUtilsTests(unittest.TestCase):
    def test_config_token_prefers_onlyoffice_jwt_secret(self):
        with patch.dict(
            os.environ,
            {
                "ONLYOFFICE_JWT_SECRET": "office-secret",
                "ONLYOFFICE_CALLBACK_SECRET": "callback-secret",
                "SUPABASE_JWT_SECRET": "supabase-secret",
            },
            clear=False,
        ):
            token = issue_onlyoffice_config_token(
                {"document": {"key": "doc-1-key"}, "editorConfig": {"user": {"id": "user-1"}}}
            )

        claims = jwt.decode(token, "office-secret", algorithms=["HS256"])
        self.assertEqual(claims["document"]["key"], "doc-1-key")
        self.assertEqual(claims["editorConfig"]["user"]["id"], "user-1")
        self.assertIn("exp", claims)

        with self.assertRaises(jwt.InvalidSignatureError):
            jwt.decode(token, "callback-secret", algorithms=["HS256"])

    def test_config_token_falls_back_to_callback_secret(self):
        with patch.dict(
            os.environ,
            {
                "ONLYOFFICE_JWT_SECRET": "",
                "ONLYOFFICE_CALLBACK_SECRET": "callback-secret",
                "SUPABASE_JWT_SECRET": "supabase-secret",
            },
            clear=False,
        ):
            token = issue_onlyoffice_config_token(
                {"document": {"key": "doc-2-key"}, "editorConfig": {"user": {"id": "user-2"}}}
            )

        claims = jwt.decode(token, "callback-secret", algorithms=["HS256"])
        self.assertEqual(claims["document"]["key"], "doc-2-key")

        with self.assertRaises(jwt.InvalidSignatureError):
            jwt.decode(token, "supabase-secret", algorithms=["HS256"])

    def test_config_token_uses_supabase_secret_as_legacy_fallback(self):
        with patch.dict(
            os.environ,
            {
                "ONLYOFFICE_JWT_SECRET": "",
                "ONLYOFFICE_CALLBACK_SECRET": "",
                "SUPABASE_JWT_SECRET": "supabase-secret",
            },
            clear=False,
        ):
            token = issue_onlyoffice_config_token(
                {"document": {"key": "doc-3-key"}, "editorConfig": {"user": {"id": "user-3"}}}
            )

        claims = jwt.decode(token, "supabase-secret", algorithms=["HS256"])
        self.assertEqual(claims["editorConfig"]["user"]["id"], "user-3")


if __name__ == "__main__":
    unittest.main()
