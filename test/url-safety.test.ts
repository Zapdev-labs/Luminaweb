import { describe, expect, test } from "bun:test";
import {
  filterAllowedUploadUrls,
  filterSafeExternalUrls,
  isAllowedUploadUrl,
  isSafeExternalUrl,
  isValidSkillUrl,
} from "@/lib/url-safety";

describe("url-safety", () => {
  test("blocks metadata and private hosts", () => {
    expect(isSafeExternalUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isSafeExternalUrl("https://127.0.0.1/admin")).toBe(false);
    expect(isSafeExternalUrl("https://10.0.0.1/internal")).toBe(false);
  });

  test("allows public https URLs", () => {
    expect(isSafeExternalUrl("https://example.com/docs")).toBe(true);
  });

  test("restricts skill URLs to allowlisted domains", () => {
    expect(isValidSkillUrl("https://raw.githubusercontent.com/org/repo/main/SKILL.md")).toBe(true);
    expect(isValidSkillUrl("https://evil.com/skill.md")).toBe(false);
  });

  test("allows uploadthing CDN URLs only", () => {
    expect(isAllowedUploadUrl("https://utfs.io/f/abc123")).toBe(true);
    expect(isAllowedUploadUrl("https://evil.com/file.pdf")).toBe(false);
  });

  test("filter helpers drop unsafe URLs", () => {
    expect(
      filterSafeExternalUrls([
        "https://example.com",
        "https://127.0.0.1",
      ])
    ).toEqual(["https://example.com"]);

    expect(
      filterAllowedUploadUrls([
        "https://utfs.io/f/x",
        "https://attacker.com/x.pdf",
      ])
    ).toEqual(["https://utfs.io/f/x"]);
  });
});
