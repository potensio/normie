/**
 * Bug Condition Exploration Test for useAttachments
 *
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists
 *
 * Property 1: Bug Condition - Non-Image Files Lose Data
 * Tests that non-image files (text, PDF, code) retain their data URLs after addFiles
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAttachments } from "../useAttachments";

describe("useAttachments - Bug Condition Exploration", () => {
  describe("Property 1: Non-Image Files Should Retain Data", () => {
    it("should store data URL for text files", async () => {
      const { result } = renderHook(() => useAttachments());

      const textFile = {
        path: "/test/notes.txt",
        name: "notes.txt",
        size: 5000,
        type: "text/plain",
        data: "data:text/plain;base64,SGVsbG8gV29ybGQ=",
      };

      await act(async () => {
        await result.current.addFiles([textFile]);
      });

      // EXPECTED TO FAIL on unfixed code: data field doesn't exist or is undefined
      expect(result.current.attachments).toHaveLength(1);
      expect(result.current.attachments[0].data).toBeDefined();
      expect(result.current.attachments[0].data).toBe(textFile.data);
      expect(result.current.attachments[0].data).toMatch(
        /^data:text\/plain;base64,/,
      );
    });

    it("should store data URL for PDF files", async () => {
      const { result } = renderHook(() => useAttachments());

      const pdfFile = {
        path: "/test/document.pdf",
        name: "document.pdf",
        size: 2000000,
        type: "application/pdf",
        data: "data:application/pdf;base64,JVBERi0xLjQK",
      };

      await act(async () => {
        await result.current.addFiles([pdfFile]);
      });

      // EXPECTED TO FAIL on unfixed code: data field doesn't exist or is undefined
      expect(result.current.attachments).toHaveLength(1);
      expect(result.current.attachments[0].data).toBeDefined();
      expect(result.current.attachments[0].data).toBe(pdfFile.data);
      expect(result.current.attachments[0].data).toMatch(
        /^data:application\/pdf;base64,/,
      );
    });

    it("should store data URL for code files", async () => {
      const { result } = renderHook(() => useAttachments());

      const codeFile = {
        path: "/test/main.ts",
        name: "main.ts",
        size: 10000,
        type: "text/typescript",
        data: "data:text/typescript;base64,Y29uc3QgZm9vID0gImJhciI7",
      };

      await act(async () => {
        await result.current.addFiles([codeFile]);
      });

      // EXPECTED TO FAIL on unfixed code: data field doesn't exist or is undefined
      expect(result.current.attachments).toHaveLength(1);
      expect(result.current.attachments[0].data).toBeDefined();
      expect(result.current.attachments[0].data).toBe(codeFile.data);
      expect(result.current.attachments[0].data).toMatch(
        /^data:text\/typescript;base64,/,
      );
    });

    it("should store data URL for multiple non-image files", async () => {
      const { result } = renderHook(() => useAttachments());

      const files = [
        {
          path: "/test/notes.txt",
          name: "notes.txt",
          size: 5000,
          type: "text/plain",
          data: "data:text/plain;base64,SGVsbG8=",
        },
        {
          path: "/test/doc.pdf",
          name: "doc.pdf",
          size: 100000,
          type: "application/pdf",
          data: "data:application/pdf;base64,JVBERi0=",
        },
      ];

      await act(async () => {
        await result.current.addFiles(files);
      });

      // EXPECTED TO FAIL on unfixed code: data field doesn't exist or is undefined
      expect(result.current.attachments).toHaveLength(2);
      expect(result.current.attachments[0].data).toBe(files[0].data);
      expect(result.current.attachments[1].data).toBe(files[1].data);
    });
  });
});

/**
 * Preservation Property Tests
 *
 * Property 2: Preservation - Image Preview and Validation Behavior
 * These tests capture existing behavior that MUST NOT change after the fix
 *
 * EXPECTED: These tests PASS on unfixed code (confirms baseline to preserve)
 */

describe("useAttachments - Preservation Properties", () => {
  describe("Property 2.1: Image Preview Field Population", () => {
    it("should populate preview field for image files", async () => {
      const { result } = renderHook(() => useAttachments());

      const imageFile = {
        path: "/test/photo.jpg",
        name: "photo.jpg",
        size: 1000000,
        type: "image/jpeg",
        data: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
      };

      await act(async () => {
        await result.current.addFiles([imageFile]);
      });

      // This SHOULD PASS on unfixed code - images work
      expect(result.current.attachments).toHaveLength(1);
      expect(result.current.attachments[0].preview).toBeDefined();
      expect(result.current.attachments[0].preview).toBe(imageFile.data);
    });

    it("should populate preview for PNG images", async () => {
      const { result } = renderHook(() => useAttachments());

      const pngFile = {
        path: "/test/screenshot.png",
        name: "screenshot.png",
        size: 500000,
        type: "image/png",
        data: "data:image/png;base64,iVBORw0KGgo=",
      };

      await act(async () => {
        await result.current.addFiles([pngFile]);
      });

      expect(result.current.attachments[0].preview).toBe(pngFile.data);
    });

    it("should NOT populate preview for non-image files", async () => {
      const { result } = renderHook(() => useAttachments());

      const textFile = {
        path: "/test/notes.txt",
        name: "notes.txt",
        size: 5000,
        type: "text/plain",
        data: "data:text/plain;base64,SGVsbG8=",
      };

      await act(async () => {
        await result.current.addFiles([textFile]);
      });

      // Non-images should NOT have preview field
      expect(result.current.attachments[0].preview).toBeUndefined();
    });
  });

  describe("Property 2.2: File Size Validation", () => {
    it("should reject files over 50MB with error", async () => {
      const { result } = renderHook(() => useAttachments());

      const largeFile = {
        path: "/test/huge.zip",
        name: "huge.zip",
        size: 60 * 1024 * 1024, // 60MB
        type: "application/zip",
        data: "data:application/zip;base64,UEsDBBQ=",
      };

      await act(async () => {
        await result.current.addFiles([largeFile]);
      });

      // Should have error field set
      expect(result.current.attachments).toHaveLength(1);
      expect(result.current.attachments[0].error).toBeDefined();
      expect(result.current.attachments[0].error).toContain("50MB");
    });

    it("should accept files under 50MB without error", async () => {
      const { result } = renderHook(() => useAttachments());

      const validFile = {
        path: "/test/document.pdf",
        name: "document.pdf",
        size: 10 * 1024 * 1024, // 10MB
        type: "application/pdf",
        data: "data:application/pdf;base64,JVBERi0=",
      };

      await act(async () => {
        await result.current.addFiles([validFile]);
      });

      expect(result.current.attachments[0].error).toBeUndefined();
    });

    it("should validate each file independently", async () => {
      const { result } = renderHook(() => useAttachments());

      const files = [
        {
          path: "/test/small.txt",
          name: "small.txt",
          size: 1000,
          type: "text/plain",
          data: "data:text/plain;base64,c21hbGw=",
        },
        {
          path: "/test/large.zip",
          name: "large.zip",
          size: 60 * 1024 * 1024,
          type: "application/zip",
          data: "data:application/zip;base64,bGFyZ2U=",
        },
      ];

      await act(async () => {
        await result.current.addFiles(files);
      });

      expect(result.current.attachments).toHaveLength(2);
      expect(result.current.attachments[0].error).toBeUndefined();
      expect(result.current.attachments[1].error).toBeDefined();
    });
  });

  describe("Property 2.3: Attachment Removal", () => {
    it("should remove attachment by ID", async () => {
      const { result } = renderHook(() => useAttachments());

      const file = {
        path: "/test/doc.pdf",
        name: "doc.pdf",
        size: 100000,
        type: "application/pdf",
        data: "data:application/pdf;base64,JVBE=",
      };

      await act(async () => {
        await result.current.addFiles([file]);
      });

      const attachmentId = result.current.attachments[0].id;

      act(() => {
        result.current.removeFile(attachmentId);
      });

      expect(result.current.attachments).toHaveLength(0);
    });

    it("should remove correct attachment from multiple", async () => {
      const { result } = renderHook(() => useAttachments());

      const files = [
        {
          path: "/test/file1.txt",
          name: "file1.txt",
          size: 1000,
          type: "text/plain",
          data: "data:text/plain;base64,ZmlsZTE=",
        },
        {
          path: "/test/file2.txt",
          name: "file2.txt",
          size: 2000,
          type: "text/plain",
          data: "data:text/plain;base64,ZmlsZTI=",
        },
        {
          path: "/test/file3.txt",
          name: "file3.txt",
          size: 3000,
          type: "text/plain",
          data: "data:text/plain;base64,ZmlsZTM=",
        },
      ];

      await act(async () => {
        await result.current.addFiles(files);
      });

      const middleId = result.current.attachments[1].id;

      act(() => {
        result.current.removeFile(middleId);
      });

      expect(result.current.attachments).toHaveLength(2);
      expect(result.current.attachments[0].file.name).toBe("file1.txt");
      expect(result.current.attachments[1].file.name).toBe("file3.txt");
    });

    it("should clear all attachments", async () => {
      const { result } = renderHook(() => useAttachments());

      const files = [
        {
          path: "/test/1.txt",
          name: "1.txt",
          size: 100,
          type: "text/plain",
          data: "data:text/plain;base64,MQ==",
        },
        {
          path: "/test/2.txt",
          name: "2.txt",
          size: 200,
          type: "text/plain",
          data: "data:text/plain;base64,Mg==",
        },
      ];

      await act(async () => {
        await result.current.addFiles(files);
      });

      act(() => {
        result.current.clearFiles();
      });

      expect(result.current.attachments).toHaveLength(0);
      expect(result.current.hasFiles).toBe(false);
    });
  });

  describe("Property 2.4: hasFiles Flag", () => {
    it("should be false when no attachments", () => {
      const { result } = renderHook(() => useAttachments());
      expect(result.current.hasFiles).toBe(false);
    });

    it("should be true when attachments exist", async () => {
      const { result } = renderHook(() => useAttachments());

      await act(async () => {
        await result.current.addFiles([
          {
            path: "/test/file.txt",
            name: "file.txt",
            size: 100,
            type: "text/plain",
            data: "data:text/plain;base64,dGVzdA==",
          },
        ]);
      });

      expect(result.current.hasFiles).toBe(true);
    });
  });
});
