export type ReturnTypeOrNull<T extends (...args: any[]) => any> = ReturnType<T> | null;
