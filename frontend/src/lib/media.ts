// Matches Tailwind's `md` breakpoint, where the layout switches to sidebar + map.
export const isDesktopLayout = () => window.matchMedia('(min-width: 768px)').matches
