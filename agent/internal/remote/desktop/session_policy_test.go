package desktop

import (
	"testing"
	"time"
)

func TestDefaultSessionPolicy(t *testing.T) {
	p := DefaultSessionPolicy()
	if !p.ClipboardHostToViewer || !p.ClipboardViewerToHost {
		t.Fatalf("DefaultSessionPolicy clipboard must be permissive in both directions, got %+v", p)
	}
	if p.IdleTimeout != 0 || p.MaxDuration != 0 {
		t.Fatalf("DefaultSessionPolicy lifetime timers must be unset, got %+v", p)
	}
}

func TestClipboardEnabled(t *testing.T) {
	cases := []struct {
		h, v bool
		want bool
	}{
		{false, false, false},
		{true, false, true},
		{false, true, true},
		{true, true, true},
	}
	for _, c := range cases {
		p := SessionPolicy{ClipboardHostToViewer: c.h, ClipboardViewerToHost: c.v}
		if got := p.clipboardEnabled(); got != c.want {
			t.Fatalf("clipboardEnabled(h=%v,v=%v)=%v want %v", c.h, c.v, got, c.want)
		}
	}
}

func TestShouldStopForLifetime(t *testing.T) {
	now := time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name       string
		startWall  time.Time
		lastInput  time.Time
		policy     SessionPolicy
		wantStop   bool
		wantReason string
	}{
		{
			name:      "both zero never stops",
			startWall: now.Add(-100 * time.Hour),
			lastInput: now.Add(-100 * time.Hour),
			policy:    SessionPolicy{},
			wantStop:  false,
		},
		{
			name:       "max duration exceeded",
			startWall:  now.Add(-2 * time.Hour),
			lastInput:  now,
			policy:     SessionPolicy{MaxDuration: time.Hour},
			wantStop:   true,
			wantReason: "max_session_duration_exceeded",
		},
		{
			name:      "max duration not exceeded",
			startWall: now.Add(-30 * time.Minute),
			lastInput: now,
			policy:    SessionPolicy{MaxDuration: time.Hour},
			wantStop:  false,
		},
		{
			name:       "max duration exact boundary stops",
			startWall:  now.Add(-time.Hour),
			lastInput:  now,
			policy:     SessionPolicy{MaxDuration: time.Hour},
			wantStop:   true,
			wantReason: "max_session_duration_exceeded",
		},
		{
			name:      "max duration one ns short does not stop",
			startWall: now.Add(-time.Hour + time.Nanosecond),
			lastInput: now,
			policy:    SessionPolicy{MaxDuration: time.Hour},
			wantStop:  false,
		},
		{
			name:       "idle exceeded",
			startWall:  now.Add(-time.Minute),
			lastInput:  now.Add(-10 * time.Minute),
			policy:     SessionPolicy{IdleTimeout: 5 * time.Minute},
			wantStop:   true,
			wantReason: "idle_timeout_exceeded",
		},
		{
			name:      "idle not exceeded",
			startWall: now.Add(-time.Minute),
			lastInput: now.Add(-2 * time.Minute),
			policy:    SessionPolicy{IdleTimeout: 5 * time.Minute},
			wantStop:  false,
		},
		{
			name:       "idle exact boundary stops",
			startWall:  now.Add(-time.Minute),
			lastInput:  now.Add(-5 * time.Minute),
			policy:     SessionPolicy{IdleTimeout: 5 * time.Minute},
			wantStop:   true,
			wantReason: "idle_timeout_exceeded",
		},
		{
			name:       "max duration takes precedence over idle",
			startWall:  now.Add(-2 * time.Hour),
			lastInput:  now.Add(-10 * time.Minute),
			policy:     SessionPolicy{MaxDuration: time.Hour, IdleTimeout: 5 * time.Minute},
			wantStop:   true,
			wantReason: "max_session_duration_exceeded",
		},
		{
			// Unit correctness: a 5-minute idle threshold must mean 5 minutes,
			// not 5 seconds. After 6 seconds idle the session must NOT be stopped.
			name:      "5 minute idle not triggered after 6 seconds",
			startWall: now.Add(-time.Minute),
			lastInput: now.Add(-6 * time.Second),
			policy:    SessionPolicy{IdleTimeout: 5 * time.Minute},
			wantStop:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stop, reason := shouldStopForLifetime(now, tt.startWall, tt.lastInput, tt.policy)
			if stop != tt.wantStop {
				t.Fatalf("stop=%v want %v (reason=%q)", stop, tt.wantStop, reason)
			}
			if stop && reason != tt.wantReason {
				t.Fatalf("reason=%q want %q", reason, tt.wantReason)
			}
		})
	}
}
