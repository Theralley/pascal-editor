/**
 * What something was last made from, as numbers and object identities, compared in place: `begin`,
 * then `put` / `ref` each input in the same order, then `end` says whether any differed from the
 * last time. Nothing is allocated once the record is big enough, so it can be read every frame.
 */
export class ChangeRecord {
  private values = new Float64Array(64)
  private refs: unknown[] = []
  private at = 1
  private refAt = 0
  private differs = true

  begin(): void {
    this.at = 1
    this.refAt = 0
    this.differs = false
  }

  put(value: number): void {
    if (this.at >= this.values.length) {
      const grown = new Float64Array(this.values.length * 2)
      grown.set(this.values)
      this.values = grown
      this.differs = true
    }
    if (this.values[this.at] !== value) {
      this.values[this.at] = value
      this.differs = true
    }
    this.at++
  }

  ref(object: unknown): void {
    if (this.refs[this.refAt] !== object) {
      this.refs[this.refAt] = object
      this.differs = true
    }
    this.refAt++
  }

  /** Whether anything put since `begin` differs from the last record, or there are more or fewer. */
  end(): boolean {
    if (this.values[0] !== this.at) {
      this.values[0] = this.at
      this.differs = true
    }
    if (this.refs.length !== this.refAt) {
      this.refs.length = this.refAt
      this.differs = true
    }
    return this.differs
  }
}
