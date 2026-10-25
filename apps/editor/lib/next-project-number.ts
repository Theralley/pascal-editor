/** `Project #n` (or `Projekt #n`, the name a Swedish visitor's button makes): one past the highest number still in use, never below the count. */
export function nextProjectNumber(names: string[]): number {
  const highest = names.reduce((max, name) => {
    const match = /^Proj(?:ect|ekt) #(\d+)$/.exec(name.trim())
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return Math.max(highest, names.length) + 1
}
