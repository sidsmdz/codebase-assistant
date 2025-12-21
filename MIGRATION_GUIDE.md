# Database Migration Guide

## Issue: Missing `description_length` Column

If you're seeing this error:
```
Error: no such column: description_length
```

This means your database was created with an older schema before the `description_length` column was added.

## Solution

### Option 1: Delete and Re-index (Recommended)

This is the simplest approach if you don't have important custom patterns saved.

**Steps:**

1. **Find your database location:**
   - Run command: `OpenCat: Show Knowledge Base Stats`
   - Note the "Path" shown in the message

2. **Delete the database file:**
   ```bash
   # Linux/Mac
   rm ~/.config/Code/User/globalStorage/your-publisher-name.opencat/opencat.db

   # Or find it from the stats path and delete it manually
   ```

3. **Reload VS Code:**
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "Developer: Reload Window"
   - Press Enter

4. **Re-index your workspace:**
   - Run command: `OpenCat: Index Workspace`

### Option 2: Manual Migration (If you have important data)

If you have custom saved patterns you don't want to lose:

**Steps:**

1. **Locate your database** (from stats command)

2. **Install sqlite3 command-line tool:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install sqlite3

   # Mac
   brew install sqlite3

   # Windows
   # Download from https://www.sqlite.org/download.html
   ```

3. **Add the missing column:**
   ```bash
   # Replace PATH_TO_DB with your actual path
   sqlite3 PATH_TO_DB "ALTER TABLE doc_stats ADD COLUMN description_length INTEGER DEFAULT 0;"
   ```

4. **Reload VS Code:**
   - Press `Ctrl+Shift+P`
   - Type "Developer: Reload Window"

5. **Verify it works:**
   - Run command: `OpenCat: Show Knowledge Base Stats`
   - Should show stats without errors

## Verification

After migration, test that everything works:

1. **Check Stats:**
   ```
   Command Palette → OpenCat: Show Knowledge Base Stats
   ```
   Should show:
   - Patterns count
   - AST Nodes count
   - Indexed Terms count
   - No errors in console

2. **Try a Search:**
   - Open OpenCat chat
   - Try a search like "getUserById method"
   - Should return results without errors

3. **Check Console:**
   - Open VS Code Developer Tools: `Help → Toggle Developer Tools`
   - Check Console tab for any errors

## Future Database Changes

To avoid this issue in the future, the extension now includes:

- ✅ Proper schema versioning
- ✅ Automatic column addition for new fields
- ✅ Better error messages

## Still Having Issues?

If you're still seeing errors after migration:

1. **Check the Console:**
   - `Help → Toggle Developer Tools → Console`
   - Look for detailed error messages

2. **Try Option 1 (Delete & Re-index):**
   - Sometimes it's faster to start fresh

3. **Check file permissions:**
   - Ensure VS Code can write to the globalStorage directory

## What Was Fixed

The database schema was updated to include the `description_length` field:

**Old Schema:**
```sql
CREATE TABLE doc_stats (
    pattern_id TEXT PRIMARY KEY,
    name_length INTEGER DEFAULT 0,
    code_length INTEGER DEFAULT 0,
    comment_length INTEGER DEFAULT 0,
    total_terms INTEGER DEFAULT 0
);
```

**New Schema:**
```sql
CREATE TABLE doc_stats (
    pattern_id TEXT PRIMARY KEY,
    name_length INTEGER DEFAULT 0,
    code_length INTEGER DEFAULT 0,
    comment_length INTEGER DEFAULT 0,
    description_length INTEGER DEFAULT 0,  -- ADDED
    total_terms INTEGER DEFAULT 0
);
```

This column is needed for BM25 to properly calculate relevance scores across the description field.
