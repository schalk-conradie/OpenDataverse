import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  getTabOverflowState,
  initialTabOverflowState,
} from "@/components/app-shell/tool-tab-strip-model"
import {
  getEnvironmentById,
  type AppConfig,
  type ToolWindow,
} from "@/core/dataverse/schemas"
import { cn } from "@/lib/utils"
import { getToolDefinition } from "@/modules/tool-registry"

type ToolTabStripProps = {
  activeWindowId?: string
  config: AppConfig
  openWindows: ToolWindow[]
  onActivateWindow: (windowId: string) => void
  onCloseWindow: (windowId: string) => void
}

export function ToolTabStrip({
  activeWindowId,
  config,
  openWindows,
  onActivateWindow,
  onCloseWindow,
}: ToolTabStripProps) {
  const tabListRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)
  const [overflowState, setOverflowState] = useState(initialTabOverflowState)

  const updateOverflowState = useCallback(() => {
    const tabList = tabListRef.current
    if (!tabList) {
      return
    }

    setOverflowState(getTabOverflowState(tabList))
  }, [])

  useEffect(() => {
    const tabList = tabListRef.current
    if (!tabList) {
      return
    }

    const resizeObserver = new ResizeObserver(updateOverflowState)
    resizeObserver.observe(tabList)
    updateOverflowState()

    return () => resizeObserver.disconnect()
  }, [updateOverflowState])

  useEffect(() => {
    const tabList = tabListRef.current
    const activeTab = activeTabRef.current
    if (!tabList || !activeTab) {
      updateOverflowState()
      return
    }

    const tabStart = activeTab.offsetLeft
    const tabEnd = tabStart + activeTab.offsetWidth
    const visibleStart = tabList.scrollLeft
    const visibleEnd = visibleStart + tabList.clientWidth

    if (tabStart < visibleStart) {
      tabList.scrollTo({ left: tabStart })
    } else if (tabEnd > visibleEnd) {
      tabList.scrollTo({ left: tabEnd - tabList.clientWidth })
    }

    updateOverflowState()
  }, [activeWindowId, openWindows, updateOverflowState])

  function scrollTabs(direction: -1 | 1) {
    const tabList = tabListRef.current
    if (!tabList) {
      return
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches

    tabList.scrollBy({
      left: direction * Math.max(160, tabList.clientWidth * 0.7),
      behavior: reduceMotion ? "auto" : "smooth",
    })
  }

  return (
    <div className="flex h-10 min-w-0 items-end border-b border-border bg-background">
      {overflowState.hasOverflow && (
        <div className="flex h-full shrink-0 items-center border-r border-border px-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Scroll tabs left"
            title="Scroll tabs left"
            disabled={!overflowState.canScrollLeft}
            onClick={() => scrollTabs(-1)}
          >
            <ChevronLeft />
          </Button>
        </div>
      )}

      <div
        ref={tabListRef}
        className="flex min-w-0 flex-1 items-end overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={updateOverflowState}
      >
        {openWindows.map((window) => {
          const tool = getToolDefinition(window.toolId)
          const windowEnvironment = getEnvironmentById(
            config,
            window.environmentId ?? config.currentEnvironmentId,
          )
          const active = window.id === activeWindowId

          return (
            <button
              ref={active ? activeTabRef : undefined}
              key={window.id}
              className={cn(
                "group/tab relative flex h-9 max-w-64 shrink-0 items-center gap-2 rounded-t-md border border-b-0 px-3 text-left text-xs transition-all",
                active
                  ? "z-10 bg-muted text-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              type="button"
              onClick={() => onActivateWindow(window.id)}
            >
              {active && (
                <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" />
              )}
              <tool.icon className="size-3.5 shrink-0 text-muted-foreground group-hover/tab:text-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {window.title}
                {windowEnvironment ? ` - ${windowEnvironment.name}` : ""}
              </span>
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted-foreground/20 hover:text-foreground"
                role="button"
                tabIndex={0}
                aria-label="Close tab"
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseWindow(window.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.stopPropagation()
                    onCloseWindow(window.id)
                  }
                }}
              >
                <X className="size-3" />
              </span>
            </button>
          )
        })}
      </div>

      {overflowState.hasOverflow && (
        <div className="flex h-full shrink-0 items-center border-l border-border px-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Scroll tabs right"
            title="Scroll tabs right"
            disabled={!overflowState.canScrollRight}
            onClick={() => scrollTabs(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  )
}
