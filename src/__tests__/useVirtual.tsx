import { render as tlRender, fireEvent } from "@testing-library/react";

import { Options, Return } from "../types";
import { createRo } from "../utils";
import useVirtual from "../useVirtual";

type Props = Partial<Options> & { children: (obj: Return) => null };

const Compo = ({ children, itemCount = 10, ...options }: Props) => {
  const { outerRef, innerRef, items, ...rest } = useVirtual<
    HTMLDivElement,
    HTMLDivElement
  >({ itemCount, ...options });

  return (
    <div ref={outerRef}>
      <div ref={innerRef}>
        {items.map(({ index }) => (
          <div key={index}>{index}</div>
        ))}
        {children({ outerRef, innerRef, items, ...rest })}
      </div>
    </div>
  );
};

const rect = { width: 300, height: 300 };
const mockResizeObserver = createRo(rect);

const render = () => {
  let obj: Return;

  tlRender(
    <Compo>
      {(o) => {
        obj = o;
        return null;
      }}
    </Compo>
  );

  // @ts-expect-error
  return { ...obj, getItems: () => obj.items };
};

describe("useVirtual", () => {
  beforeAll(() => {
    // @ts-expect-error
    // eslint-disable-next-line compat/compat
    window.ResizeObserver = mockResizeObserver;
  });

  describe("items", () => {
    const item = {
      index: 0,
      start: 0,
      size: 50,
      isScrolling: undefined,
      isSticky: undefined,
      width: rect.width,
      measureRef: expect.any(Function),
    };

    it("should return correctly", () => {
      const { items } = render();
      const len = 7;
      expect(items).toHaveLength(len);
      expect(items[0]).toEqual(item);
      expect(items[len - 1]).toEqual({ ...item, index: len - 1, start: 300 });
    });

    it("should return correctly while scrolling", () => {
      const { outerRef, getItems } = render();

      fireEvent.scroll(outerRef.current, { target: { scrollTop: 50 } });
      let len = 8;
      let items = getItems();
      expect(items).toHaveLength(len);
      expect(items[0]).toEqual(item);
      expect(items[len - 1]).toEqual({ ...item, index: len - 1, start: 350 });

      fireEvent.scroll(outerRef.current, { target: { scrollTop: 75 } });
      len = 9;
      items = getItems();
      expect(items).toHaveLength(len);
      expect(items[0]).toEqual(item);
      expect(items[len - 1]).toEqual({ ...item, index: len - 1, start: 400 });

      fireEvent.scroll(outerRef.current, { target: { scrollTop: 200 } });
      len = 7;
      items = getItems();
      expect(items).toHaveLength(len);
      expect(items[0]).toEqual({ ...item, index: 3 });
      expect(items[len - 1]).toEqual({ ...item, index: 9, start: 300 });
    });
  });
});
