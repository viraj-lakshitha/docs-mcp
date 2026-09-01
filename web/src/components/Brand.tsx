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

export function BrandLogo({ size = 28 }: { size?: number }) {
  return (
    <div className="brand-logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8M8 17h5" />
      </svg>
    </div>
  );
}
