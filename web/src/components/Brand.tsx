import type { ElementType } from "react";

// Brand wordmark: "Notes" with the smaller "by Optiq Labs" mark.
// as: heading tag to render (h1/h2/div); withLink wraps Optiq Labs in a
// link to the company site.
export function Brand({
  as: Tag = "div",
  withLink = false,
  className = "",
}: {
  as?: ElementType;
  withLink?: boolean;
  className?: string;
}) {
  return (
    <Tag className={`brand ${className}`.trim()}>
      Notes{" "}
      <span className="brand-sub">
        {withLink ? (
          <>
            by{" "}
            <a href="https://optiqlabs.com" target="_blank" rel="noopener noreferrer">
              Optiq Labs
            </a>
          </>
        ) : (
          "by Optiq Labs"
        )}
      </span>
    </Tag>
  );
}

// The logo mark, served from web/public/logo-mark.svg — the same vector every
// favicon, app icon and social card is generated from (see brand/build-assets.mjs).
// It is deliberately an <img> rather than inlined JSX so there is exactly one
// copy of the artwork: change brand/mark.svg, re-run the generator, and the
// app, the browser tab and the Slack unfurl all move together.
//
// `tile` draws the rounded brand plate behind it (sidebar, landing header);
// without it the mark sits on whatever surface it is placed on, which is what
// the login panel's gradient wants.
/**
 * `size` is the size of the whole plate, not the glyph — the mark is inset so
 * optical weight matches across contexts. Sizing is inline rather than left to
 * per-context CSS, so one prop drives both box and glyph and they can't drift.
 *
 * variant:
 *   "tint"  mark on a themed tint plate — for app surfaces (sidebar, header)
 *   "solid" the full app-icon tile, cream plate included. Required anywhere the
 *           backdrop is brand-coloured: the mark is terracotta, so on the login
 *           panel's terracotta gradient the "tint" plate leaves it invisible.
 *   "bare"  the mark alone, no plate
 */
export function BrandLogo({
  size = 32,
  variant = "tint",
}: {
  size?: number;
  variant?: "tint" | "solid" | "bare";
}) {
  if (variant === "solid") {
    return (
      <img
        src="/logo-tile-light.svg"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        draggable={false}
        style={{ borderRadius: Math.round(size * 0.223), display: "block" }}
      />
    );
  }

  const tint = variant === "tint";
  const glyph = Math.round(size * (tint ? 0.62 : 1));
  return (
    <div
      className={tint ? "brand-logo" : undefined}
      aria-hidden="true"
      style={tint ? { width: size, height: size } : undefined}
    >
      <img src="/logo-mark.svg" alt="" width={glyph} height={glyph} draggable={false} />
    </div>
  );
}
