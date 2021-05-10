declare module "react-cool-virtual" {
  import { RefObject } from "react";

  type Data = Record<string, any>;

  interface Item<D> {
    data?: D;
    readonly index: number;
    readonly size: number;
    readonly outerSize: number;
    measureRef: (el: HTMLElement | null) => void;
  }

  export type ItemSize = number | ((index: number) => number) | undefined;

  export interface OnScroll {
    (options: {
      startIndex: number;
      endIndex: number;
      offset: number;
      direction: string;
      userScroll: boolean;
    }): void;
  }

  export type Options<D extends Data = Data> = Partial<{
    itemData: D[];
    itemCount: number;
    itemSize: ItemSize;
    defaultItemSize: number;
    horizontal: boolean;
    overscanCount: number;
    onScroll: OnScroll;
  }>;

  export interface Return<
    O extends HTMLElement = HTMLElement,
    I extends HTMLElement = HTMLElement,
    D extends Data = Data
  > {
    outerRef: RefObject<O>;
    innerRef: RefObject<I>;
    items: Item<D>[];
  }

  export default function useVirtual<
    O extends HTMLElement = HTMLElement,
    I extends HTMLElement = HTMLElement,
    D extends Data = Data
  >(config: Options<D>): Return<O, I, D>;
}
