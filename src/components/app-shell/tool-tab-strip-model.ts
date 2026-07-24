type TabOverflowState = {
  hasOverflow: boolean
  canScrollLeft: boolean
  canScrollRight: boolean
}

type ScrollMetrics = Pick<
  HTMLElement,
  "clientWidth" | "scrollLeft" | "scrollWidth"
>

const scrollEdgeTolerance = 1

export function getTabOverflowState({
  clientWidth,
  scrollLeft,
  scrollWidth,
}: ScrollMetrics): TabOverflowState {
  const maximumScrollLeft = Math.max(0, scrollWidth - clientWidth)

  return {
    hasOverflow: maximumScrollLeft > scrollEdgeTolerance,
    canScrollLeft: scrollLeft > scrollEdgeTolerance,
    canScrollRight:
      scrollLeft < maximumScrollLeft - scrollEdgeTolerance,
  }
}

export const initialTabOverflowState: TabOverflowState = {
  hasOverflow: false,
  canScrollLeft: false,
  canScrollRight: false,
}
