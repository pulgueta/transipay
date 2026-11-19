import { Link } from "@tanstack/react-router";

import type { LandingAction } from "./landing-actions";

interface ActionLinkProps {
  action: LandingAction;
  /** `button` is the filled tab. `link` is a text link. */
  look: "button" | "link";
}

/** A link for an action of the home page. A `sign-in` action opens the sign-in page first. */
export const ActionLink = ({ action, look }: ActionLinkProps) => {
  const className = look === "button" ? "lp-btn" : "lp-link";
  const link =
    action.kind === "sign-in" ? (
      <Link
        className={className}
        search={{ redirect: action.redirect }}
        to="/sign-in"
      >
        {action.label}
      </Link>
    ) : (
      <Link className={className} to={action.to}>
        {action.label}
      </Link>
    );

  // The wrap draws the focus outline of a button, because the tab shape cuts its own outline.
  return look === "button" ? <span className="lp-btn-wrap">{link}</span> : link;
};
