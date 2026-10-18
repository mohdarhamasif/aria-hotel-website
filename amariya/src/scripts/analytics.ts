// Page events as DOM events ('amariya:<name>'), for whichever analytics the owner plugs in. Never personal data.
export function track(name: string, data?: Record<string, string | number | boolean | null>) {
  document.dispatchEvent(new CustomEvent(`amariya:${name}`, { detail: data ?? {} }));
}
