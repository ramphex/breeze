package desktop

import (
	"time"

	"github.com/breeze-rmm/agent/internal/ipc"
)

// DefaultSessionPolicy returns the baseline policy used by every decoder:
// clipboard permissive in both directions, lifetime timers unset (callers layer
// explicit limits on top). Centralizing this prevents the IPC decoder
// (ResolveSessionPolicyFromIPC) and the map-payload decoder
// (heartbeat.parseDesktopSessionPolicy) from disagreeing on what "default" means.
//
// Note: a zero-value SessionPolicy{} is fail-CLOSED for clipboard (both
// directions disabled) and fail-OPEN for lifetime (both timers disabled), so
// construct via this function rather than the zero value when permissive
// clipboard defaults are intended.
func DefaultSessionPolicy() SessionPolicy {
	return SessionPolicy{
		ClipboardHostToViewer: true,
		ClipboardViewerToHost: true,
	}
}

// clipboardEnabled reports whether the policy permits any clipboard transfer.
func (p SessionPolicy) clipboardEnabled() bool {
	return p.ClipboardHostToViewer || p.ClipboardViewerToHost
}

// shouldStopForLifetime is the pure per-tick decision for the lifetime watchdog.
// It returns true (with a reason) when the session must be torn down because the
// max-duration or idle-timeout threshold has been crossed. A zero threshold
// means "no limit" for that axis; if both are zero the session is never stopped
// on lifetime grounds. Max-duration takes precedence over idle.
//
// `lastInput` is the wall-clock time of the most recent viewer INPUT event
// (mouse/keyboard) — see Session.lastInputUnixNano. Control-channel traffic does
// NOT feed this, so an open-but-unattended viewer still idles out.
func shouldStopForLifetime(now, startWall, lastInput time.Time, policy SessionPolicy) (bool, string) {
	if policy.MaxDuration > 0 && now.Sub(startWall) >= policy.MaxDuration {
		return true, "max_session_duration_exceeded"
	}
	if policy.IdleTimeout > 0 && now.Sub(lastInput) >= policy.IdleTimeout {
		return true, "idle_timeout_exceeded"
	}
	return false, ""
}

// ResolveSessionPolicyFromIPC is the single authoritative decoder that turns an
// ipc.DesktopStartRequest into a SessionPolicy. Callers (the user helper) must
// NOT inline the nil→permissive logic — funnel through here so it can't drift
// from the map-payload decoder (heartbeat.parseDesktopSessionPolicy). Both start
// from DefaultSessionPolicy().
//
//   - nil *bool clipboard fields resolve to the permissive default (true); an
//     explicit false disables that direction.
//   - timeout ints <= 0 mean "no limit" for that axis. Bounds enforcement
//     (negative/over-cap rejection) is the caller's job before calling this
//     (see userhelper.validateDesktopStartRequest); this decoder assumes
//     already-validated input and simply treats <=0 as unset.
func ResolveSessionPolicyFromIPC(r ipc.DesktopStartRequest) SessionPolicy {
	p := DefaultSessionPolicy()
	if r.ClipboardHostToViewer != nil {
		p.ClipboardHostToViewer = *r.ClipboardHostToViewer
	}
	if r.ClipboardViewerToHost != nil {
		p.ClipboardViewerToHost = *r.ClipboardViewerToHost
	}
	if r.IdleTimeoutMinutes > 0 {
		p.IdleTimeout = time.Duration(r.IdleTimeoutMinutes) * time.Minute
	}
	if r.MaxSessionDurationHours > 0 {
		p.MaxDuration = time.Duration(r.MaxSessionDurationHours) * time.Hour
	}
	return p
}
