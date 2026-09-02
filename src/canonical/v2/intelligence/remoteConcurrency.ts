export type RemoteOperationLease = {
  operationId: string;
  release(): void;
};

export class RemoteConcurrencyGuard {
  private active = 0;
  private readonly activeOperationIds = new Set<string>();

  constructor(public readonly maximum: number) {
    if (!Number.isInteger(maximum) || maximum < 1) throw new Error("invalid_remote_concurrency_limit");
  }

  tryAcquire(operationId: string): RemoteOperationLease | null {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(operationId) || this.activeOperationIds.has(operationId)) {
      throw new Error("invalid_or_duplicate_remote_operation");
    }
    if (this.active >= this.maximum) return null;
    this.active += 1;
    this.activeOperationIds.add(operationId);
    let released = false;
    return {
      operationId,
      release: () => {
        if (released) throw new Error("remote_operation_already_released");
        released = true;
        this.active -= 1;
        this.activeOperationIds.delete(operationId);
      },
    };
  }

  snapshot(): { active: number; maximum: number; activeOperationIds: string[] } {
    return { active: this.active, maximum: this.maximum, activeOperationIds: [...this.activeOperationIds].sort() };
  }
}
