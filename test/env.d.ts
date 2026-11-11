// Vite's `?raw` imports return the file contents as a string.
declare module "*?raw" {
  const source: string
  export default source
}
