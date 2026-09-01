import { useEffect, useRef, useState, type ReactNode } from "react"

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        d={direction === "left" ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Marquee({
  count,
  children,
  align = "end",
  heading,
}: {
  count: number
  children: ReactNode
  align?: "start" | "end"
  heading?: ReactNode
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useRef({ startX: 0, startLeft: 0, moved: false })
  const [dragging, setDragging] = useState(false)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)
  const scrollable = !(atStart && atEnd)

  useEffect(() => {
    const element: HTMLDivElement | null = scroller.current
    if (element === null) return
    const node: HTMLDivElement = element

    function update() {
      const remaining = node.scrollWidth - node.clientWidth
      setAtStart(node.scrollLeft <= 1)
      setAtEnd(remaining <= 1 || node.scrollLeft >= remaining - 1)
    }

    update()
    node.addEventListener("scroll", update, { passive: true })
    // The scroller's own box never changes when cards or images resize, so each
    // card is observed too.
    const observer = new ResizeObserver(update)
    observer.observe(node)
    for (const child of node.children) observer.observe(child)
    return () => {
      node.removeEventListener("scroll", update)
      observer.disconnect()
    }
  }, [count])

  useEffect(() => {
    if (!dragging) return
    const element: HTMLDivElement | null = scroller.current
    if (element === null) return
    const node: HTMLDivElement = element

    function onMove(event: MouseEvent) {
      const delta = event.clientX - drag.current.startX
      if (Math.abs(delta) > 4) drag.current.moved = true
      node.scrollLeft = drag.current.startLeft - delta
    }
    function onUp() {
      setDragging(false)
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [dragging])

  function step(direction: 1 | -1) {
    const element = scroller.current
    if (!element) return
    const items = element.querySelectorAll<HTMLElement>(".marquee-item")
    const stride =
      items.length > 1
        ? items[1].offsetLeft - items[0].offsetLeft
        : (items[0]?.offsetWidth ?? element.clientWidth)
    const perPage = Math.max(1, Math.floor(element.clientWidth / stride))
    element.scrollBy({ left: direction * stride * perPage, behavior: "smooth" })
  }

  const arrows = scrollable ? (
    <div className="marquee-controls flex shrink-0 gap-2">
      <button
        type="button"
        aria-label="Scroll left"
        disabled={atStart}
        onClick={() => step(-1)}
        className="marquee-arrow"
      >
        <Chevron direction="left" />
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        disabled={atEnd}
        onClick={() => step(1)}
        className="marquee-arrow"
      >
        <Chevron direction="right" />
      </button>
    </div>
  ) : null

  return (
    <>
      {heading ? (
        <div className="section-heading">
          {heading}
          {arrows}
        </div>
      ) : (
        arrows && <div className="flex justify-end">{arrows}</div>
      )}

      <div className="-mx-4 mt-6 sm:-mx-8">
        <div
          ref={scroller}
          className={`marquee-scroll flex overflow-x-auto px-4 pt-3 pb-8 sm:px-8 ${
            align === "start" ? "items-start" : "items-end"
          }${scrollable ? " is-scrollable" : ""}${dragging ? " is-dragging" : ""}${
            atStart ? "" : " fade-left"
          }${atEnd ? "" : " fade-right"}`}
          onMouseDown={(event) => {
            if (event.button !== 0 || !scrollable) return
            const element = scroller.current
            if (!element) return
            event.preventDefault()
            drag.current = {
              startX: event.clientX,
              startLeft: element.scrollLeft,
              moved: false,
            }
            setDragging(true)
          }}
          onClickCapture={(event) => {
            if (!drag.current.moved) return
            event.preventDefault()
            event.stopPropagation()
            drag.current.moved = false
          }}
        >
          {children}
        </div>
      </div>
    </>
  )
}
