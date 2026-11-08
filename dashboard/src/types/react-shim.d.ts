declare namespace React {
  export type ReactNode = string | number | boolean | null | undefined | JSX.Element | ReactNode[];
  export interface FormEvent<T = Element> {
    preventDefault(): void;
    currentTarget: T;
  }
  export interface ChangeEvent<T = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> {
    target: T & { value: string; checked?: boolean };
  }
  export type FC<P = Record<string, never>> = (props: P) => JSX.Element | null;
  export function useState<S>(initialState: S | (() => S)): [S, (newState: S | ((prev: S) => S)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]): T;
  export function createElement(...args: unknown[]): JSX.Element;
}

declare module "react" {
  export = React;
}

declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [elemName: string]: Record<string, unknown>;
  }
}
