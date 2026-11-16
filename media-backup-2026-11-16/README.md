# Media backup 2026-11-16 - PostMePlex object-storage files

Source: database dump db-backup-2026-11-16/postmeplex (59 BSON collections, bsondump).
Enumeration: every unique /api/files/... and postmeplex/... string in the dump.
Result: 7 unique object-storage paths (2 uploads, 4 voice, 1 branding).

- Uploads: 2 unique paths, in posts.bson only. Both are 8x8 PNG test images (test_storage migration e2e).
- Voice: 4 MP3 files, in ai_char_messages.bson, media_type audio.
- Branding: postmeplex/branding/default_avatar.png, 1024x1024 PNG, in notifications.bson.

Download: curl -f from https://www.postmeplex.com/api/files/<path>, 2026-11-16. Downloaded 7/7, failed 0. A fresh re-download matched every saved file by MD5.
Note: the live file endpoint is intermittently flaky for one upload - one request returned HTTP 404 {detail: File not found} and three in a row returned 404, then the same URL returned HTTP 200 on 3/3 later tries. backend/storage.py notes the storage key can go stale and is re-minted on 404 with a retry.

Not in this folder: media hosted elsewhere in the dump (Cloudinary URLs, demo/sample assets, picsum and soundhelix links) - those are not served by postmeplex.com/api/files and were not part of this object-storage rescue.
See media-paths.txt for the full list and download-success.log for sizes.
