"""
Storage management utilities - trash, soft delete, quota handling
"""

from typing import Optional, Tuple, Dict, Any
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class TrashManager:
    """Manage soft-deleted files and trash operations"""
    
    @staticmethod
    async def soft_delete_document(
        supabase_client: Any,
        document_id: str,
        user_id: str,
        storage_path: str,
        filename: str,
        file_size: int
    ) -> Dict[str, Any]:
        """Soft delete document - move to trash"""
        
        try:
            # Store in trash table
            trash_entry = {
                'user_id': user_id,
                'resource_type': 'document',
                'resource_id': document_id,
                'resource_name': filename,
                'size_bytes': file_size,
                'original_path_json': {'storage_path': storage_path},
                'deleted_at': datetime.utcnow().isoformat(),
                'expires_at': (datetime.utcnow() + timedelta(days=30)).isoformat(),
            }
            
            result = await supabase_client.table('trash').insert(trash_entry).execute()
            
            # Mark document as deleted (soft delete)
            await supabase_client.table('documents').update({
                'is_deleted': True,
                'deleted_at': datetime.utcnow().isoformat()
            }).eq('id', document_id).execute()
            
            return {'success': True, 'trash_id': result.data[0]['id'] if result.data else None}
        except Exception as e:
            logger.error(f"Failed to soft delete document: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    async def restore_from_trash(
        supabase_client: Any,
        trash_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Restore document from trash"""
        
        try:
            # Get trash entry
            trash_result = await supabase_client.table('trash').select('*').eq(
                'id', trash_id
            ).eq('user_id', user_id).single().execute()
            
            if not trash_result.data:
                return {'success': False, 'error': 'Trash entry not found'}
            
            trash_data = trash_result.data
            
            # Restore document
            await supabase_client.table('documents').update({
                'is_deleted': False,
                'deleted_at': None
            }).eq('id', trash_data['resource_id']).execute()
            
            # Remove from trash
            await supabase_client.table('trash').delete().eq('id', trash_id).execute()
            
            return {'success': True, 'document_id': trash_data['resource_id']}
        except Exception as e:
            logger.error(f"Failed to restore from trash: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    async def get_user_trash(
        supabase_client: Any,
        user_id: str
    ) -> Tuple[bool, Optional[str], Optional[list]]:
        """Get user's trash items"""
        
        try:
            result = await supabase_client.table('trash').select('*').eq(
                'user_id', user_id
            ).gte('expires_at', datetime.utcnow().isoformat()).order(
                'deleted_at', ascending=False
            ).execute()
            
            return True, None, result.data or []
        except Exception as e:
            logger.error(f"Failed to get trash: {e}")
            return False, str(e), None


class StorageQuotaManager:
    """Manage user storage quotas and limits"""
    
    STORAGE_TIERS = {
        'starter': 5 * 1024 * 1024 * 1024,      # 5 GB
        'pro': 50 * 1024 * 1024 * 1024,         # 50 GB
        'enterprise': 500 * 1024 * 1024 * 1024,  # 500 GB
    }
    
    @staticmethod
    async def check_storage_quota(
        supabase_client: Any,
        user_id: str,
        file_size: int
    ) -> Tuple[bool, str]:
        """Check if user can upload file"""
        
        try:
            # Get user quota from profiles
            user_result = await supabase_client.table('profiles').select(
                'storage_plan, storage_quota_bytes'
            ).eq('id', user_id).single().execute()
            
            if not user_result.data:
                return False, "User not found"
            
            user_data = user_result.data
            
            # Get current usage from user_storage_usage
            usage_result = await supabase_client.table('user_storage_usage').select(
                'total_bytes'
            ).eq('user_id', user_id).single().execute()
            
            current_usage = usage_result.data['total_bytes'] if usage_result.data else 0
            quota = user_data.get('storage_quota_bytes', StorageQuotaManager.STORAGE_TIERS['starter'])
            
            # Check if adding new file would exceed quota
            if current_usage + file_size > quota:
                remaining_mb = (quota - current_usage) / (1024 * 1024)
                file_size_mb = file_size / (1024 * 1024)
                return False, (
                    f"Storage quota exceeded. "
                    f"File size: {file_size_mb:.1f} MB, "
                    f"Available: {max(0, remaining_mb):.1f} MB"
                )
            
            return True, ""
        except Exception as e:
            logger.warning(f"Could not verify storage quota: {e}")
            # Don't block on quota check failure
            return True, ""
    
    @staticmethod
    async def get_storage_usage(
        supabase_client: Any,
        user_id: str
    ) -> Dict[str, Any]:
        """Get user's storage usage"""
        
        try:
            user_result = await supabase_client.table('profiles').select(
                'storage_plan, storage_quota_bytes'
            ).eq('id', user_id).single().execute()
            
            usage_result = await supabase_client.table('user_storage_usage').select(
                'total_bytes, document_count'
            ).eq('user_id', user_id).single().execute()
            
            if not user_result.data:
                return {'error': 'User not found'}
            
            user_data = user_result.data
            usage_data = usage_result.data if usage_result.data else {}
            
            quota_bytes = user_data.get('storage_quota_bytes', StorageQuotaManager.STORAGE_TIERS['starter'])
            used_bytes = usage_data.get('total_bytes', 0)
            usage_percent = (used_bytes / quota_bytes * 100) if quota_bytes > 0 else 0
            
            return {
                'plan': user_data.get('storage_plan', 'starter'),
                'quota_bytes': quota_bytes,
                'quota_gb': round(quota_bytes / (1024**3), 2),
                'used_bytes': used_bytes,
                'used_gb': round(used_bytes / (1024**3), 2),
                'remaining_bytes': max(0, quota_bytes - used_bytes),
                'remaining_gb': round(max(0, quota_bytes - used_bytes) / (1024**3), 2),
                'usage_percent': round(usage_percent, 1),
                'document_count': usage_data.get('document_count', 0),
            }
        except Exception as e:
            logger.error(f"Failed to get storage usage: {e}")
            return {'error': str(e)}
    
    @staticmethod
    async def upgrade_plan(
        supabase_client: Any,
        user_id: str,
        new_plan: str
    ) -> Tuple[bool, str, Optional[int]]:
        """Upgrade user's storage plan"""
        
        if new_plan not in StorageQuotaManager.STORAGE_TIERS:
            return False, "Invalid storage plan", None
        
        try:
            quota_bytes = StorageQuotaManager.STORAGE_TIERS[new_plan]
            
            await supabase_client.table('profiles').update({
                'storage_plan': new_plan,
                'storage_quota_bytes': quota_bytes
            }).eq('id', user_id).execute()
            
            return True, "", quota_bytes
        except Exception as e:
            logger.error(f"Failed to upgrade plan: {e}")
            return False, str(e), None
