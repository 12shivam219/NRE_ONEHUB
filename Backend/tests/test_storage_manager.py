import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from utils.storage_manager import StorageQuotaManager, TrashManager


class MockResult:
    def __init__(self, data):
        self.data = data


class MockQuery:
    def __init__(self, client, table_name):
        self.client = client
        self.table_name = table_name
        self.action = "select"
        self.payload = None
        self.filters = []
        self.order_by = None
        self.single_mode = False

    def select(self, _columns):
        self.action = "select"
        return self

    def insert(self, payload):
        self.action = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.action = "update"
        self.payload = payload
        return self

    def delete(self):
        self.action = "delete"
        return self

    def eq(self, column, value):
        self.filters.append(("eq", column, value))
        return self

    def gte(self, column, value):
        self.filters.append(("gte", column, value))
        return self

    def order(self, column, ascending=True):
        self.order_by = (column, ascending)
        return self

    def single(self):
        self.single_mode = True
        return self

    async def execute(self):
        self.client.calls.append(
            {
                "table": self.table_name,
                "action": self.action,
                "payload": self.payload,
                "filters": list(self.filters),
                "order_by": self.order_by,
                "single": self.single_mode,
            }
        )
        response = self.client.next_response()
        if isinstance(response, Exception):
            raise response
        return MockResult(response)


class MockSupabaseClient:
    def __init__(self, responses=None):
        self._responses = list(responses or [])
        self.calls = []

    def table(self, table_name):
        return MockQuery(self, table_name)

    def next_response(self):
        if not self._responses:
            return None
        return self._responses.pop(0)


class TrashManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_soft_delete_document_success(self):
        client = MockSupabaseClient(
            responses=[
                [{"id": "trash-123"}],
                {"updated": True},
            ]
        )

        result = await TrashManager.soft_delete_document(
            supabase_client=client,
            document_id="doc-1",
            user_id="user-1",
            storage_path="user-1/resume.docx",
            filename="resume.docx",
            file_size=4096,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["trash_id"], "trash-123")
        self.assertEqual(client.calls[0]["table"], "trash")
        self.assertEqual(client.calls[0]["action"], "insert")
        self.assertEqual(client.calls[1]["table"], "documents")
        self.assertEqual(client.calls[1]["action"], "update")

    async def test_soft_delete_document_failure_returns_error(self):
        client = MockSupabaseClient(responses=[RuntimeError("insert failed")])

        result = await TrashManager.soft_delete_document(
            supabase_client=client,
            document_id="doc-1",
            user_id="user-1",
            storage_path="user-1/resume.docx",
            filename="resume.docx",
            file_size=4096,
        )

        self.assertFalse(result["success"])
        self.assertIn("insert failed", result["error"])

    async def test_restore_from_trash_success(self):
        client = MockSupabaseClient(
            responses=[
                {"id": "trash-1", "resource_id": "doc-7"},
                {"updated": True},
                {"deleted": True},
            ]
        )

        result = await TrashManager.restore_from_trash(
            supabase_client=client,
            trash_id="trash-1",
            user_id="user-1",
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["document_id"], "doc-7")
        self.assertEqual(client.calls[0]["table"], "trash")
        self.assertEqual(client.calls[0]["action"], "select")
        self.assertTrue(client.calls[0]["single"])

    async def test_restore_from_trash_not_found(self):
        client = MockSupabaseClient(responses=[None])

        result = await TrashManager.restore_from_trash(
            supabase_client=client,
            trash_id="missing-trash",
            user_id="user-1",
        )

        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "Trash entry not found")

    async def test_get_user_trash_returns_items_sorted(self):
        client = MockSupabaseClient(
            responses=[
                [
                    {"id": "trash-2"},
                    {"id": "trash-1"},
                ]
            ]
        )

        ok, err, items = await TrashManager.get_user_trash(client, "user-1")

        self.assertTrue(ok)
        self.assertIsNone(err)
        self.assertEqual(len(items), 2)
        self.assertEqual(client.calls[0]["table"], "trash")
        self.assertEqual(client.calls[0]["order_by"], ("deleted_at", False))
        self.assertIn(("eq", "user_id", "user-1"), client.calls[0]["filters"])
        self.assertTrue(any(f[0] == "gte" and f[1] == "expires_at" for f in client.calls[0]["filters"]))


class StorageQuotaManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_check_storage_quota_allows_upload_when_under_limit(self):
        client = MockSupabaseClient(
            responses=[
                {"storage_plan": "starter", "storage_quota_bytes": 1000},
                {"total_bytes": 600},
            ]
        )

        allowed, message = await StorageQuotaManager.check_storage_quota(
            supabase_client=client,
            user_id="user-1",
            file_size=300,
        )

        self.assertTrue(allowed)
        self.assertEqual(message, "")

    async def test_check_storage_quota_blocks_upload_when_over_limit(self):
        client = MockSupabaseClient(
            responses=[
                {"storage_plan": "starter", "storage_quota_bytes": 1000},
                {"total_bytes": 900},
            ]
        )

        allowed, message = await StorageQuotaManager.check_storage_quota(
            supabase_client=client,
            user_id="user-1",
            file_size=200,
        )

        self.assertFalse(allowed)
        self.assertIn("Storage quota exceeded", message)
        self.assertIn("File size", message)
        self.assertIn("Available", message)

    async def test_check_storage_quota_falls_back_to_allow_on_error(self):
        client = MockSupabaseClient(responses=[RuntimeError("database unavailable")])

        allowed, message = await StorageQuotaManager.check_storage_quota(
            supabase_client=client,
            user_id="user-1",
            file_size=100,
        )

        self.assertTrue(allowed)
        self.assertEqual(message, "")

    async def test_get_storage_usage_returns_calculated_metrics(self):
        quota = 10 * 1024 * 1024 * 1024
        used = 3 * 1024 * 1024 * 1024
        client = MockSupabaseClient(
            responses=[
                {"storage_plan": "pro", "storage_quota_bytes": quota},
                {"total_bytes": used, "document_count": 12},
            ]
        )

        usage = await StorageQuotaManager.get_storage_usage(
            supabase_client=client,
            user_id="user-1",
        )

        self.assertEqual(usage["plan"], "pro")
        self.assertEqual(usage["quota_bytes"], quota)
        self.assertEqual(usage["used_bytes"], used)
        self.assertEqual(usage["remaining_bytes"], quota - used)
        self.assertEqual(usage["usage_percent"], 30.0)
        self.assertEqual(usage["document_count"], 12)

    async def test_upgrade_plan_rejects_invalid_plan(self):
        client = MockSupabaseClient()
        ok, error, quota = await StorageQuotaManager.upgrade_plan(
            supabase_client=client,
            user_id="user-1",
            new_plan="unknown",
        )

        self.assertFalse(ok)
        self.assertEqual(error, "Invalid storage plan")
        self.assertIsNone(quota)

    async def test_upgrade_plan_updates_profile_for_valid_plan(self):
        client = MockSupabaseClient(responses=[{"updated": True}])
        ok, error, quota = await StorageQuotaManager.upgrade_plan(
            supabase_client=client,
            user_id="user-1",
            new_plan="enterprise",
        )

        self.assertTrue(ok)
        self.assertEqual(error, "")
        self.assertEqual(quota, StorageQuotaManager.STORAGE_TIERS["enterprise"])
        self.assertEqual(client.calls[0]["table"], "profiles")
        self.assertEqual(client.calls[0]["action"], "update")
        self.assertEqual(client.calls[0]["payload"]["storage_plan"], "enterprise")


if __name__ == "__main__":
    unittest.main()
