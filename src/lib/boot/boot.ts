// The boot sequence shown each time the app opens (#101). One place to change it.

/** How long the full sequence runs, in ms. The owner may shorten it later. */
export const BOOT_MS = 3000;

/** localStorage key a browser test sets to see the boot sequence. */
export const FORCE_BOOT_KEY = 'cybrdek:force-boot';

/**
 * Whether to play it on this load. Not with reduced motion. Not under test
 * automation either, which would otherwise wait out 3 s on every page load,
 * unless a test asks for it.
 */
export function shouldBoot(): boolean {
	if (typeof window === 'undefined') return false;
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
	if (navigator.webdriver) {
		try {
			return localStorage.getItem(FORCE_BOOT_KEY) === '1';
		} catch {
			return false;
		}
	}
	return true;
}
