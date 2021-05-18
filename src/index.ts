import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
} from "react";

import {
  Align,
  Data,
  Item,
  ItemSize,
  Measure,
  OnScroll,
  Options,
  Return,
  ScrollEasingFunction,
  ScrollTo,
  ScrollToOptions,
  ScrollToItem,
  ScrollToItemOptions,
} from "./types";
import {
  createIndexes,
  easeInOutCubic,
  findNearestBinarySearch,
  invariant,
  isNumber,
  now,
  useAnimDebounce,
  // useIsoLayoutEffect,
  useLatest,
  useResizeEffect,
} from "./utils";

const DEFAULT_ITEM_SIZE = 50;

const useVirtual = <
  O extends HTMLElement = HTMLElement,
  I extends HTMLElement = HTMLElement,
  D extends Data = Data
>({
  itemData,
  itemCount,
  itemSize = DEFAULT_ITEM_SIZE,
  horizontal,
  overscanCount = 1,
  useIsScrolling,
  scrollDuration = 500,
  scrollEasingFunction = easeInOutCubic,
  onScroll,
}: Options<D>): Return<O, I, D> => {
  const [items, setItems] = useState<Item<D>[]>([]);
  const offsetRef = useRef(0);
  const outerRef = useRef<O>(null);
  const innerRef = useRef<I>(null);
  const dataRef = useRef<D[] | undefined>(itemData);
  const outerSizeRef = useRef(0);
  const measuresRef = useRef<Measure[]>([]);
  const userScrollRef = useRef(true);
  const scrollRafRef = useRef<number>();
  const easingFnRef = useLatest<ScrollEasingFunction>(scrollEasingFunction);
  const itemSizeRef = useLatest<ItemSize>(itemSize);
  const onScrollRef = useLatest<OnScroll | undefined>(onScroll);
  const sizeKey = !horizontal ? "height" : "width";
  const observerSizeKey = !horizontal ? "blockSize" : "inlineSize";
  const marginKey = !horizontal ? "marginTop" : "marginLeft";
  const scrollKey = !horizontal ? "scrollTop" : "scrollLeft";
  const directionDR = !horizontal ? "down" : "right";
  const directionUL = !horizontal ? "up" : "left";
  itemCount = isNumber(itemCount) ? itemCount : itemData?.length;

  const getItemSize = useCallback(
    (idx: number) => {
      if (measuresRef.current[idx]) return measuresRef.current[idx].size;

      let { current: size } = itemSizeRef;
      size = isNumber(size) ? size : size(idx);

      return size ?? DEFAULT_ITEM_SIZE;
    },
    [itemSizeRef]
  );

  const getMeasures = useCallback(() => {
    if (!itemCount) return [];

    const measures: Measure[] = [];

    for (let i = 0; i < itemCount; i += 1) {
      const start = i ? measures[i - 1].end : 0;
      const size = getItemSize(i);

      measures[i] = { idx: i, start, end: start + size, size };
    }

    return measures;
  }, [getItemSize, itemCount]);

  const getCalcData = useCallback(
    (offset: number) => {
      const { current: measures } = measuresRef;
      const startIdx = findNearestBinarySearch(
        0,
        measures.length,
        offset,
        measuresRef.current.map(({ start }) => start)
      );
      let endIdx = startIdx;

      while (
        endIdx < measures.length &&
        measures[endIdx].start < offset + outerSizeRef.current
      )
        endIdx += 1;

      const start = Math.max(startIdx - overscanCount, 0);
      const margin = measures[start].start;

      return {
        startIdx,
        endIdx: endIdx - 1,
        start,
        end: Math.min(endIdx + overscanCount, measures.length) - 1,
        margin,
        innerSize: measures[measures.length - 1].end - margin,
      };
    },
    [overscanCount]
  );

  const [resetIsScrolling, cancelResetIsScrolling] = useAnimDebounce(
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    () => updateItems(offsetRef.current, false),
    200
  );

  const [resetUserScroll, cancelResetUserScroll] = useAnimDebounce(
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    () => {
      userScrollRef.current = true;
    },
    200
  );

  const updateItems = useCallback(
    (offset: number, isScrolling = true) => {
      const { current: inner } = innerRef;

      if (!inner) return;

      const { startIdx, endIdx, start, end, margin, innerSize } =
        getCalcData(offset);

      inner.style[marginKey] = `${margin}px`;
      inner.style[sizeKey] = `${innerSize}px`;

      const nextItems: Item<D>[] = [];
      let shouldRecalc = false;

      for (let i = start; i <= end; i += 1)
        nextItems[i] = {
          data: Array.isArray(dataRef.current) ? dataRef.current[i] : undefined,
          index: i,
          size: measuresRef.current[i].size,
          outerSize: outerSizeRef.current,
          isScrolling: useIsScrolling ? isScrolling : undefined,
          // eslint-disable-next-line no-loop-func
          measureRef: (el) => {
            if (!el) return;

            // eslint-disable-next-line compat/compat
            let observer: ResizeObserver | null = new ResizeObserver(
              ([{ borderBoxSize }]) => {
                const { [observerSizeKey]: size } = borderBoxSize[0];

                if (size !== measuresRef.current[i].size) {
                  measuresRef.current[i].size = size;
                  shouldRecalc = true;
                }

                if (i === end && shouldRecalc) {
                  measuresRef.current = getMeasures();
                  updateItems(offset, isScrolling);
                }

                observer?.disconnect();
                observer = null;
              }
            );

            observer.observe(el);
          },
        };

      setItems(nextItems);

      if (isScrolling) {
        if (onScrollRef.current)
          onScrollRef.current({
            overscanIndexes: createIndexes(start, end),
            itemIndexes: createIndexes(startIdx, endIdx),
            offset,
            direction: offset > offsetRef.current ? directionDR : directionUL,
            userScroll: userScrollRef.current,
          });

        if (useIsScrolling) resetIsScrolling();
        if (!userScrollRef.current) resetUserScroll();
      }

      offsetRef.current = offset;
    },
    [
      directionDR,
      directionUL,
      getCalcData,
      getMeasures,
      marginKey,
      observerSizeKey,
      onScrollRef,
      resetIsScrolling,
      resetUserScroll,
      sizeKey,
      useIsScrolling,
    ]
  );

  const scrollTo = useCallback<ScrollTo>(
    (value, cb) => {
      if (!outerRef.current) return;

      const { offset, smooth }: ScrollToOptions = isNumber(value)
        ? { offset: value }
        : value;
      const prevOffset = offsetRef.current;

      if (!isNumber(offset) || offset === prevOffset) return;

      userScrollRef.current = false;

      if (!smooth) {
        outerRef.current[scrollKey] = offset;
        if (cb) cb();
        return;
      }

      const start = now();

      const scroll = () => {
        const time = Math.min((now() - start) / scrollDuration, 1);

        outerRef.current![scrollKey] =
          easingFnRef.current(time) * (offset - prevOffset) + prevOffset;

        if (time < 1) {
          scrollRafRef.current = requestAnimationFrame(scroll);
        } else if (cb) {
          cb();
        }
      };

      scrollRafRef.current = requestAnimationFrame(scroll);
    },
    [easingFnRef, scrollDuration, scrollKey]
  );

  const scrollToItem = useCallback<ScrollToItem>(
    (value, cb) => {
      if (!itemCount) return;

      const {
        index,
        align = Align.auto,
        smooth,
        autoCorrect,
      }: ScrollToItemOptions = isNumber(value) ? { index: value } : value;

      if (!isNumber(index)) return;

      const measure =
        measuresRef.current[Math.max(0, Math.min(index, itemCount - 1))];

      if (!measure) return;

      const { start, end, size } = measure;
      const { current: outerSize } = outerSizeRef;
      let offset = offsetRef.current;

      if (autoCorrect && offset <= start && offset + outerSize >= end && cb) {
        cb();
        return;
      }

      const endPos = start - outerSize + size;

      switch (align) {
        case Align.start:
          offset = start;
          break;
        case Align.center:
          offset = start - outerSize / 2 + size / 2;
          break;
        case Align.end:
          offset = endPos;
          break;
        default:
          if (offset >= start) {
            offset = start;
          } else if (offset + outerSize <= end) {
            offset = endPos;
          }
      }

      scrollTo({ offset, smooth }, () => {
        if (!autoCorrect) {
          if (cb) cb();
        } else if (offset >= start || offset + outerSize <= end) {
          setTimeout(() => scrollToItem(value, cb), 50);
        }
      });
    },
    [itemCount, scrollTo]
  );

  useResizeEffect<O>(
    outerRef,
    (rect) => {
      outerSizeRef.current = rect[sizeKey];
      measuresRef.current = getMeasures();

      if (itemCount) updateItems(offsetRef.current, false);
    },
    itemCount
  );

  useLayoutEffect(() => {
    const { current: outer } = outerRef;

    invariant(!outer, "Outer error");
    invariant(!innerRef.current, "Inner error");
    invariant(itemCount === undefined, "Item count error");

    const handleScroll = ({ target }: Event) =>
      updateItems((target as O)[scrollKey]);

    outer!.addEventListener("scroll", handleScroll);

    return () => outer!.removeEventListener("scroll", handleScroll);
  }, [itemCount, scrollKey, updateItems]);

  useEffect(
    () => () => {
      cancelResetIsScrolling();
      cancelResetUserScroll();
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = undefined;
      }
    },
    [cancelResetIsScrolling, cancelResetUserScroll]
  );

  return { outerRef, innerRef, items, scrollTo, scrollToItem };
};

export default useVirtual;
