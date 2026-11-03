// Only the newest of several overlapping requests may update the screen.
//
// The lore pages reload when GM mode changes. A slow read started while signed
// in as GM (with hidden entries) must not land after a newer signed-out read
// and put hidden lore back on screen (Codex, #42 review).

export interface Latest {
	/** Start a request; returns a check that is true only while it's the newest. */
	begin(): () => boolean;
}

export function latestOnly(): Latest {
	let generation = 0;
	return {
		begin() {
			const mine = ++generation;
			return () => mine === generation;
		}
	};
}
