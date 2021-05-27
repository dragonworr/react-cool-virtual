import { useCallback, useRef, useState } from "react";

import {
  Align,
  Item,
  IsItemLoaded,
  ItemSize,
  KeyExtractor,
  LoadMore,
  Measure,
  OnScroll,
  Options,
  Return,
  ScrollEasingFunction,
  ScrollTo,
  ScrollToOptions,
  ScrollToItem,
  ScrollToItemOptions,
  SsrItemCount,
} from "./types";
import {
  easeInOutCubic,
  findNearestBinarySearch,
  isNumber,
  now,
  shouldUpdate,
  useDebounce,
  useIsoLayoutEffect,
  useLatest,
  useResizeEffect,
} from "./utils";

const DEFAULT_ITEM_SIZE = 50;
const DEBOUNCE_INTERVAL = 200;
const AUTO_CORRECT_LIMIT = 10;

const getInitItems = (
  ssrItemCount?: SsrItemCount,
  keyExtractor?: KeyExtractor
) => {
  if (ssrItemCount === undefined) return [];

  const [idx, len] = isNumber(ssrItemCount)
    ? [0, ssrItemCount - 1]
    : ssrItemCount;
  const ssrItems = [];

  for (let i = idx; i <= len; i += 1) {
    const ssrItem = {
      index: i,
      start: 0,
      size: 0,
      width: 0,
      measureRef: () => null,
    };
    if (keyExtractor) (ssrItem as any).key = keyExtractor(i);
    ssrItems.push(ssrItem);
  }

  return ssrItems;
};

export default <
  O extends HTMLElement = HTMLElement,
  I extends HTMLElement = HTMLElement
>({
  itemCount,
  ssrItemCount,
  itemSize = DEFAULT_ITEM_SIZE,
  horizontal,
  overscanCount = 1,
  useIsScrolling,
  scrollDuration = 500,
  scrollEasingFunction = easeInOutCubic,
  keyExtractor,
  onScroll,
  loadMoreThreshold = 15,
  isItemLoaded,
  loadMore,
}: Options): Return<O, I> => {
  const [items, setItems] = useState<Item[]>(() =>
    getInitItems(ssrItemCount, keyExtractor)
  );
  const hasLoadMoreOnMountRef = useRef(false);
  const shouldCheckBsHighRef = useRef(false);
  const autoCorrectTimesRef = useRef(0);
  const rosRef = useRef<Map<Element, ResizeObserver>>(new Map());
  const offsetRef = useRef(0);
  const vStopRef = useRef<number>();
  const outerRef = useRef<O>(null);
  const innerRef = useRef<I>(null);
  const outerRectRef = useRef({ width: 0, height: 0 });
  const msDataRef = useRef<Measure[]>([]);
  const userScrollRef = useRef(true);
  const scrollRafRef = useRef<number>();
  const easingFnRef = useLatest<ScrollEasingFunction>(scrollEasingFunction);
  const keyExtractorRef = useLatest<KeyExtractor | undefined>(keyExtractor);
  const itemSizeRef = useLatest<ItemSize>(itemSize);
  const onScrollRef = useLatest<OnScroll | undefined>(onScroll);
  const isItemLoadedRef = useRef<IsItemLoaded | undefined>(isItemLoaded);
  const loadMoreRef = useLatest<LoadMore | undefined>(loadMore);
  const sizeKey = !horizontal ? "height" : "width";
  const itemSizeKey = !horizontal ? "blockSize" : "inlineSize";
  const marginKey = !horizontal ? "marginTop" : "marginLeft";
  const scrollKey = !horizontal ? "scrollTop" : "scrollLeft";

  const getItemSize = useCallback(
    (idx: number) => {
      let { current: size } = itemSizeRef;
      size = isNumber(size) ? size : size(idx, outerRectRef.current.width);

      return size ?? DEFAULT_ITEM_SIZE;
    },
    [itemSizeRef]
  );

  const getMeasure = useCallback(
    (idx: number, size: number) => {
      const start = msDataRef.current[idx - 1]
        ? msDataRef.current[idx - 1].end
        : 0;
      const ms: Measure = { idx, start, end: start + size, size };

      if (keyExtractorRef.current) ms.key = keyExtractorRef.current(idx);

      return ms;
    },
    [keyExtractorRef]
  );

  const getCalcData = useCallback(
    (offset: number) => {
      const { current: msData } = msDataRef;
      let high = 0;

      if (shouldCheckBsHighRef.current)
        for (let i = 1; i < msData.length; i += 1) {
          if (msData[i - 1].start >= msData[i].start) break;
          high += 1;
        }

      const vStart = findNearestBinarySearch(
        0,
        high || msData.length,
        offset,
        (idx) => msData[idx].start
      );
      let vStop = vStart;
      let currStart = msData[vStop].start;

      while (
        vStop < msData.length &&
        currStart < offset + outerRectRef.current[sizeKey]
      ) {
        vStop += 1;
        currStart += msData[vStop]?.size || 0;
      }

      const oStart = Math.max(vStart - overscanCount, 0);
      const margin = msData[oStart].start;

      return {
        oStart,
        oStop: Math.min(vStop + overscanCount, msData.length) - 1,
        vStart,
        vStop: vStop - 1,
        margin,
        innerSize: msData[msData.length - 1].end - margin,
      };
    },
    [overscanCount, sizeKey]
  );

  const [resetIsScrolling, cancelResetIsScrolling] = useDebounce(
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    () => handleScroll(offsetRef.current),
    DEBOUNCE_INTERVAL
  );

  const [resetOthers, cancelResetOthers] = useDebounce(() => {
    userScrollRef.current = true;

    const len = rosRef.current.size - msDataRef.current.length;
    const iter = rosRef.current[Symbol.iterator]();
    for (let i = 0; i < len; i += 1)
      rosRef.current.delete(iter.next().value[0]);
  }, DEBOUNCE_INTERVAL);

  const handleScroll = useCallback(
    (offset: number, isScrolling = false) => {
      if (!innerRef.current) return;

      if (
        !hasLoadMoreOnMountRef.current &&
        loadMoreRef.current &&
        !(isItemLoadedRef.current && isItemLoadedRef.current(0))
      )
        loadMoreRef.current({
          startIndex: 0,
          stopIndex: loadMoreThreshold - 1,
          loadIndex: 0,
          scrollOffset: offset,
          userScroll: userScrollRef.current,
        });

      hasLoadMoreOnMountRef.current = true;

      if (!itemCount) {
        setItems([]);
        return;
      }

      const { oStart, oStop, vStart, vStop, margin, innerSize } =
        getCalcData(offset);

      innerRef.current.style[marginKey] = `${margin}px`;
      innerRef.current.style[sizeKey] = `${innerSize}px`;

      const nextItems: Item[] = [];

      for (let i = oStart; i <= oStop; i += 1) {
        const { current: msData } = msDataRef;
        const { key, start, size } = msData[i];

        nextItems.push({
          key,
          index: i,
          start: start - margin,
          size,
          width: outerRectRef.current.width,
          isScrolling: useIsScrolling ? isScrolling : undefined,
          measureRef: (el) => {
            if (!el) return;

            // eslint-disable-next-line compat/compat
            new ResizeObserver(([{ borderBoxSize, target }], ro) => {
              const { [itemSizeKey]: measuredSize } = borderBoxSize[0];

              if (!measuredSize) {
                ro.disconnect();
                return;
              }

              if (
                measuredSize !== size ||
                (msData[i - 1] && msData[i - 1].end !== start)
              ) {
                msDataRef.current[msData.length - 1].end += measuredSize - size;
                msDataRef.current[i] = getMeasure(i, measuredSize);
                handleScroll(offset, isScrolling);
              }

              rosRef.current.get(target)?.disconnect();
              rosRef.current.set(target, ro);

              shouldCheckBsHighRef.current = true;
            }).observe(el);
          },
        });
      }

      setItems((prevItems) =>
        shouldUpdate(prevItems, nextItems, { measureRef: true })
          ? nextItems
          : prevItems
      );

      if (!isScrolling) return;

      if (onScrollRef.current)
        onScrollRef.current({
          overscanStartIndex: oStart,
          overscanStopIndex: oStop,
          visibleStartIndex: vStart,
          visibleStopIndex: vStop,
          scrollOffset: offset,
          scrollForward: offset > offsetRef.current,
          userScroll: userScrollRef.current,
        });

      const loadIndex = Math.floor((vStop + 1) / loadMoreThreshold);
      const startIndex = loadIndex * loadMoreThreshold;

      if (
        vStop !== vStopRef.current &&
        loadMoreRef.current &&
        !(isItemLoadedRef.current && isItemLoadedRef.current(loadIndex))
      )
        loadMoreRef.current({
          startIndex,
          stopIndex: startIndex + loadMoreThreshold - 1,
          loadIndex,
          scrollOffset: offset,
          userScroll: userScrollRef.current,
        });

      vStopRef.current = vStop;
      offsetRef.current = offset;

      if (useIsScrolling) resetIsScrolling();
      resetOthers();
    },
    [
      getCalcData,
      getMeasure,
      itemCount,
      itemSizeKey,
      loadMoreRef,
      loadMoreThreshold,
      marginKey,
      onScrollRef,
      resetIsScrolling,
      resetOthers,
      sizeKey,
      useIsScrolling,
    ]
  );

  const scrollTo = useCallback<ScrollTo>(
    (val, cb) => {
      if (!outerRef.current) return;

      const { offset, smooth }: ScrollToOptions = isNumber(val)
        ? { offset: val }
        : val;
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
    (val, cb) => {
      const {
        index,
        align = Align.auto,
        smooth,
        autoCorrect,
      }: ScrollToItemOptions = isNumber(val) ? { index: val } : val;

      if (!isNumber(index)) return;

      const ms = msDataRef.current[Math.max(0, Math.min(index, itemCount - 1))];

      if (!ms) return;

      const { start, end, size } = ms;
      const { [sizeKey]: outerSize } = outerRectRef.current;
      let { current: offset } = offsetRef;

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
        } else if (
          autoCorrectTimesRef.current <= AUTO_CORRECT_LIMIT &&
          (offset >= start || offset + outerSize <= end)
        ) {
          setTimeout(() => scrollToItem(val, cb));
          autoCorrectTimesRef.current += 1;
        } else {
          if (cb) cb();
          autoCorrectTimesRef.current = 0;
        }
      });
    },
    [itemCount, scrollTo, sizeKey]
  );

  useResizeEffect<O>(
    outerRef,
    (rect) => {
      const isSameWidth = outerRectRef.current.width === rect.width;
      const { current: prevMsData } = msDataRef;

      outerRectRef.current = rect;

      for (let i = 0; i < itemCount; i += 1)
        msDataRef.current[i] = getMeasure(i, getItemSize(i));

      handleScroll(offsetRef.current);

      const { current: msData } = msDataRef;
      const ratio =
        !isSameWidth &&
        prevMsData.length &&
        msData[msData.length - 1].end / prevMsData[prevMsData.length - 1].end;

      if (ratio) scrollTo(offsetRef.current * ratio);
    },
    [getItemSize, getMeasure, handleScroll, itemCount, scrollTo]
  );

  useIsoLayoutEffect(() => {
    const { current: outer } = outerRef;

    if (!outer) return () => null;

    const scrollHandler = ({ target }: Event) =>
      handleScroll((target as O)[scrollKey], true);

    outer.addEventListener("scroll", scrollHandler, { passive: true });

    const ros = rosRef.current;

    return () => {
      cancelResetIsScrolling();
      cancelResetOthers();
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = undefined;
      }

      outer.removeEventListener("scroll", scrollHandler);

      ros.forEach((ro) => ro.disconnect());
      ros.clear();
    };
  }, [cancelResetIsScrolling, cancelResetOthers, handleScroll, scrollKey]);

  return { outerRef, innerRef, items, scrollTo, scrollToItem };
};
