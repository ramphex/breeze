const windowsVersionBuildSuffix = /\s+\d+\.\d+\.\d+(?:\.\d+)?(?:\s+Build\s+\d+(?:\.\d+)*)?\s*$/i;

export function formatDeviceOsVersion(
  osType: string | null | undefined,
  osVersion: string | null | undefined,
): string {
  const raw = osVersion?.trim() ?? '';
  if (!raw) return '';

  if (osType?.toLowerCase() === 'windows') {
    const withoutBuild = raw.replace(windowsVersionBuildSuffix, '').trim();
    return withoutBuild || raw;
  }

  // Strip kernel name prefix (e.g. "darwin 26.3.1" -> "26.3.1")
  return raw.replace(/^(darwin|linux)\s+/i, '');
}
