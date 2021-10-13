/* eslint-disable compat/compat */

import { useState } from "react";
import useVirtual from "react-cool-virtual";
import axios from "axios";

import styles from "./styles.module.scss";

const TOTAL_COMMENTS = 500;
const BATCH_COMMENTS = 5;
const isItemLoadedArr: any[] = [];

// eslint-disable-next-line promise/param-names
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const loadData = async ({ loadIndex }: any, setComments: any) => {
  // Set the state of a batch items as `true`
  // to avoid the callback from being invoked repeatedly
  isItemLoadedArr[loadIndex] = true;

  try {
    // Simulating a slow network
    await sleep(2000);

    const { data: comments } = await axios(
      `https://jsonplaceholder.typicode.com/comments?postId=${loadIndex + 1}`
    );

    setComments((prevComments: any) => {
      const nextComments = [...prevComments];

      (comments as any).forEach((comment: any) => {
        nextComments[comment.id - 1] = comment;
      });

      return nextComments;
    });
  } catch (err) {
    // If there's an error set the state back to `false`
    isItemLoadedArr[loadIndex] = false;
    // Then try again
    loadData({ loadIndex }, setComments);
  }
};

export default () => {
  const [comments, setComments] = useState<any[]>([]);
  const { outerRef, innerRef, items } = useVirtual<HTMLDivElement>({
    itemCount: TOTAL_COMMENTS,
    // Estimated item size (with padding)
    itemSize: 122,
    // The number of items that you want to load/or pre-load, it will trigger the `loadMore` callback
    // when the user scrolls within every items, e.g. 1 - 5, 6 - 10, and so on (default = 15)
    loadMoreCount: BATCH_COMMENTS,
    // Provide the loaded state of a batch items to the callback for telling the hook
    // whether the `loadMore` should be triggered or not
    isItemLoaded: (loadIndex) => isItemLoadedArr[loadIndex],
    // We can fetch the data through the callback, it's invoked when more items need to be loaded
    loadMore: (e) => {
      console.log("loadIndex: ", e.loadIndex);
      console.log("Indexes: ", e.startIndex, e.stopIndex);
      loadData(e, setComments);
    },
  });

  return (
    <div
      className={styles.outer}
      style={{ width: "300px", height: "500px", overflow: "auto" }}
      ref={outerRef}
    >
      <div ref={innerRef}>
        {items.map(({ index, measureRef }) => (
          <div
            key={comments[index]?.id || `fb-${index}`}
            className={`${styles.item} ${index % 2 ? styles.dark : ""}`}
            style={{ padding: "16px", minHeight: "122px" }}
            ref={measureRef} // Used to measure the unknown item size
          >
            {comments[index]
              ? `${comments[index].id - 1}. ${comments[index].body}`
              : "⏳ Loading..."}
          </div>
        ))}
      </div>
    </div>
  );
};
