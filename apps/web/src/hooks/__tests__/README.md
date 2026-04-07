# Test Documentation

## Bug Condition Exploration Test

The test in `useAttachments.test.ts` is designed to FAIL on unfixed code to confirm the bug exists.

### Expected Failure on Unfixed Code

The test will fail with errors like:

- `expect(received).toBeDefined()` - because `data` field doesn't exist on PendingAttachment
- `expect(received).toBe(expected)` - because `data` is undefined

### Counterexamples Found (Manual Verification)

Without running the test, we can verify the bug by inspecting the code:

1. **In `useAttachments.ts` line 35**: `file: new File([], fileData.name, { type: fileData.type })`
   - Creates empty File object with 0 bytes
   - No data is stored

2. **In `useAttachments.ts` lines 40-42**: Only images get `preview` field

   ```typescript
   if (fileData.data && fileData.type.startsWith("image/")) {
     attachment.preview = fileData.data;
   }
   ```

   - Non-image files never get their data stored

3. **PendingAttachment interface (lines 13-18)**: No `data` field exists
   - Only has `id`, `file`, `preview?`, `error?`
   - No place to store data URL for non-images

### Conclusion

The bug is confirmed: non-image files lose their data because:

- The `data` field doesn't exist in PendingAttachment interface
- The `addFiles` function never stores the data URL (except in `preview` for images)
- Empty File objects are created instead of storing real data

This test will PASS after implementing the fix (adding `data` field and storing data URLs).

## Test Infrastructure Note

This project doesn't have vitest configured yet. To run these tests:

1. Install vitest: `pnpm add -D vitest @testing-library/react @testing-library/react-hooks`
2. Add vitest config
3. Add test script to package.json

For now, the bug is confirmed through code inspection.
