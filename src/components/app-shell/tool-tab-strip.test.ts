import { describe, expect, it } from "vitest"

import { getTabOverflowState } from "@/components/app-shell/tool-tab-strip-model"

describe("getTabOverflowState", () => {
  it("reports no overflow when all tabs fit", () => {
    expect(
      getTabOverflowState({
        clientWidth: 600,
        scrollLeft: 0,
        scrollWidth: 600,
      }),
    ).toEqual({
      hasOverflow: false,
      canScrollLeft: false,
      canScrollRight: false,
    })
  })

  it("enables the appropriate controls across an overflowing tab strip", () => {
    expect(
      getTabOverflowState({
        clientWidth: 400,
        scrollLeft: 0,
        scrollWidth: 1_000,
      }),
    ).toEqual({
      hasOverflow: true,
      canScrollLeft: false,
      canScrollRight: true,
    })

    expect(
      getTabOverflowState({
        clientWidth: 400,
        scrollLeft: 300,
        scrollWidth: 1_000,
      }),
    ).toEqual({
      hasOverflow: true,
      canScrollLeft: true,
      canScrollRight: true,
    })

    expect(
      getTabOverflowState({
        clientWidth: 400,
        scrollLeft: 600,
        scrollWidth: 1_000,
      }),
    ).toEqual({
      hasOverflow: true,
      canScrollLeft: true,
      canScrollRight: false,
    })
  })
})
