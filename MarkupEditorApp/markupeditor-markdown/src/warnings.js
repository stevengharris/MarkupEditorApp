/**
 * Warning collector utility.
 * Returns an object with add(msg) and get() methods.
 */
export function makeWarnings() {
  const list = []
  return {
    add(msg) { list.push(msg) },
    get() { return [...list] }
  }
}
