import * as React from "react";

const DEFAULT_MOBILE_BREAKPOINT = 768;

function getMql(query: string): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  return window.matchMedia(query);
}

function subscribeToMql(mql: MediaQueryList, onChange: () => void) {
  // دعم المتصفحات القديمة
  if ("addEventListener" in mql) {
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  } else {
    // @ts-expect-error: legacy Safari/old Chromium
    mql.addListener?.(onChange);
    // @ts-expect-error
    return () => mql.removeListener?.(onChange);
  }
}

/**
 * useMediaQuery — هوك عام وآمن مع SSR
 * @param query  مثال: "(max-width: 767px)"
 * @param initialValue قيمة افتراضية للـSSR لمنع اختلاف الـhydration (اختياري)
 */
export function useMediaQuery(query: string, initialValue?: boolean): boolean {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      const mql = getMql(query);
      if (!mql) return () => {};
      return subscribeToMql(mql, onStoreChange);
    },
    [query]
  );

  const getSnapshot = React.useCallback(() => {
    const mql = getMql(query);
    return mql ? mql.matches : !!initialValue;
  }, [query, initialValue]);

  // لقيم SSR: استخدم initialValue (إن لم تُمرَّر فالقيمة false)
  const getServerSnapshot = React.useCallback(() => {
    return !!initialValue;
  }, [initialValue]);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * useIsMobile — يحدّد إن كان العرض أقل من breakpoint
 * @param breakpoint القيمة الافتراضية 768
 * @param initialValue قيمة افتراضية للـSSR لمنع اختلاف الـhydration (اختياري)
 */
export function useIsMobile(
  breakpoint: number = DEFAULT_MOBILE_BREAKPOINT,
  initialValue?: boolean
): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;
  return useMediaQuery(query, initialValue);
}

