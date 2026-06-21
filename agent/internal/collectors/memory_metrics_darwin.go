//go:build darwin

package collectors

import (
	"fmt"
	"time"
)

const memoryPressureCommandTimeout = 2 * time.Second

func collectMemoryMetrics(metrics *SystemMetrics) {
	if err := collectDarwinPressureAwareMemoryMetrics(metrics); err == nil {
		return
	}
	_ = collectGopsutilMemoryMetrics(metrics)
}

func collectDarwinPressureAwareMemoryMetrics(metrics *SystemMetrics) error {
	out, err := runCollectorOutput(memoryPressureCommandTimeout, "memory_pressure", "-Q")
	if err != nil {
		return fmt.Errorf("memory_pressure failed: %w", err)
	}
	totalBytes, freePercent, err := parseMemoryPressureOutput(string(out))
	if err != nil {
		return err
	}
	applyPressureAwareMemoryMetrics(metrics, totalBytes, freePercent)
	return nil
}
