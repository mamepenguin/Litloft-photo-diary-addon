# North-up map code review

Reviewed fixed commit `671ef22d3cc8403f12364f0243c834b7998d9934` against `ab9d24d`, including the approved SPEC-PD-014 and its Checked, no action section. Read the core process, design and frontend rules, testing-and-comments guidance, review contract and PROJECT.md. Also reviewed the core's uncommitted keyboard-shortcuts documentation change as requested.

Threat model: personal home-LAN tool, first-party addons, no adversary; normal-use silent failures are in scope. This change adds no input, network, authentication, storage or drive-boundary surface.

Reported classifier risk: HIGH (score 6; no protected paths or risk modifiers). Review confidence: 90%.

No actionable findings.

The production changes implement the approved behavior directly. Bearing starts at zero; drag rotation is disabled at construction; touch and keyboard rotation are disabled through methods present in the bundled MapLibre 6.16.0 runtime. Inspection of that runtime confirms touch rotation is disabled independently of touch zoom, while keyboard rotation suppression clears bearing and pitch deltas without clearing pan or zoom deltas. The handlers are initialized during construction before the added calls execute. The existing center/bounds paths do not override bearing or dragRotate. Theme, pause and resume retain the same map; recreation reapplies initialization.

The browser tests send real mouse, keyboard and CDP two-contact touch events to the bundled library and inspect its resulting camera state. Their wrapper exposes the real map instance without replacing gesture handling. They cover each requested rotation input, preserved mouse/keyboard pan and zoom, pinch zoom, controls, and lifecycle transitions. The supplied RED results demonstrate that the rotation assertions detect the previous behavior; preservation cases passing before the change are appropriate regression checks. The reported 44 browser passes, 40 map unit passes and targeted type/lint checks were supplied evidence, not independently rerun during this read-only review.

The README and core keyboard-shortcuts addition accurately describe the changed operations. No change reaches beyond the declared touch points, and no new setting or rotation-reset listener was added. No specification divergence or unspecified behavior was identified.

Not verified: physical mobile devices and other browser engines; full deployed-app integration; independent execution of the supplied verification commands. No mutation review was performed for this small read-only review.

Additional supplied verification: root precheck passed, with the frontend gate skipping this addon-only change. The focused browser test typecheck passed with Node types. The full existing E2E typecheck has baseline Node-type and mapPolish.spec failures; this review did not independently reproduce or resolve those failures.

TOTAL: 0 findings
