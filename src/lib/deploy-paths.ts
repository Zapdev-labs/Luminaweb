const UNSAFE_PATH_PATTERN = /(^|\/)\.\.(\/|$)|^\//;

export function sanitizeDeployFiles(
  files: Record<string, string>
): Record<string, string> | null {
  for (const filePath of Object.keys(files)) {
    if (!filePath || filePath.includes("\0") || UNSAFE_PATH_PATTERN.test(filePath)) {
      return null;
    }
  }
  return files;
}
