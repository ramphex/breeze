const windowsVersionBuildSuffix = /\s+\d+\.\d+\.\d+(?:\.\d+)?(?:\s+Build\s+\d+(?:\.\d+)*)?\s*$/i;

const osTypeLabels: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
};

const linuxNameOverrides: Record<string, string> = {
  bazzite: 'Bazzite',
  centos: 'CentOS',
  debian: 'Debian',
  fedora: 'Fedora',
  linux: 'Linux',
  opensuse: 'openSUSE',
  os: 'OS',
  raspbian: 'Raspbian',
  rhel: 'RHEL',
  ubuntu: 'Ubuntu',
};

function normalizeLinuxDistroName(value: string): string {
  const withoutKernelPrefix = value.replace(/^linux\s+/i, '').trim();
  return withoutKernelPrefix.replace(/^[a-z][a-z0-9]*(?:[ -][a-z][a-z0-9]*)*/i, (name) =>
    name
      .split(/([ -])/)
      .map((part) => {
        if (part === ' ' || part === '-') return part;
        const override = linuxNameOverrides[part.toLowerCase()];
        return override ?? `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
      })
      .join('')
  );
}

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

  if (osType?.toLowerCase() === 'macos') {
    if (/^macos\b/i.test(raw)) return raw.replace(/^macos\b/i, 'macOS');

    const withoutDarwin = raw.replace(/^darwin\s+/i, '').trim();
    return withoutDarwin ? `macOS ${withoutDarwin}` : 'macOS';
  }

  if (osType?.toLowerCase() === 'linux') {
    return normalizeLinuxDistroName(raw);
  }

  return raw;
}

export function formatDeviceDetailOsVersion(
  osType: string | null | undefined,
  osVersion: string | null | undefined,
): string {
  const formatted = formatDeviceOsVersion(osType, osVersion);
  if (osType?.toLowerCase() !== 'macos') return formatted;

  return formatted.replace(/^macOS\s*/i, '').trim();
}

export function formatDeviceSummaryOs(
  osType: string | null | undefined,
  osVersion: string | null | undefined,
): string {
  const type = osType?.toLowerCase() ?? '';
  const label = osTypeLabels[type] ?? osType ?? '';
  const version = formatDeviceOsVersion(osType, osVersion);

  if (!version) return label || 'Unknown OS';
  if (type === 'windows') return /\bwindows\b/i.test(version) ? version : `Windows ${version}`;
  if (type === 'macos') return /^macOS\b/.test(version) ? version : `macOS ${version}`;
  if (type === 'linux') return /^Linux\b/.test(version) ? version : `Linux ${version}`;
  return label ? `${label} ${version}` : version;
}
