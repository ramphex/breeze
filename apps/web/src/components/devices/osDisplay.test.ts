import { describe, expect, it } from 'vitest';

import { formatDeviceDetailOsVersion, formatDeviceOsVersion, formatDeviceSummaryOs } from './osDisplay';

describe('device OS display formatting', () => {
  it('leaves Windows OS versions untouched', () => {
    expect(
      formatDeviceOsVersion('windows', 'Microsoft Windows 11 Home 10.0.26200.8655 Build 26200.8655'),
    ).toBe('Microsoft Windows 11 Home 10.0.26200.8655 Build 26200.8655');
  });

  it('only treats Darwin as macOS when the OS type is macos', () => {
    expect(formatDeviceOsVersion('macos', 'darwin 26.5.1')).toBe('macOS 26.5.1');
    expect(formatDeviceOsVersion('macos', 'darwin')).toBe('macOS');
    expect(formatDeviceOsVersion('darwin', 'darwin 26.5.1')).toBe('darwin 26.5.1');
  });

  it('omits the redundant macOS label for detail OS version rows', () => {
    expect(formatDeviceDetailOsVersion('macos', 'darwin 26.5.1')).toBe('26.5.1');
    expect(formatDeviceDetailOsVersion('macos', 'macOS 26.5.1')).toBe('26.5.1');
  });

  it('capitalizes Linux distro names in OS versions', () => {
    expect(formatDeviceOsVersion('linux', 'raspbian 13.5')).toBe('Raspbian 13.5');
    expect(formatDeviceOsVersion('linux', 'bazzite 44')).toBe('Bazzite 44');
    expect(formatDeviceOsVersion('linux', 'debian 13.5')).toBe('Debian 13.5');
  });

  it('includes the OS type for the device summary', () => {
    expect(formatDeviceSummaryOs('linux', 'raspbian 13.5')).toBe('Linux Raspbian 13.5');
    expect(formatDeviceSummaryOs('macos', 'darwin 26.5.1')).toBe('macOS 26.5.1');
  });
});
