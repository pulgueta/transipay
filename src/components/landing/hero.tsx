import { ActionLink } from "./action-link";
import { cssVars } from "./css-vars";
import type { LandingActions } from "./landing-actions";

/** The folders behind the open one, from the back to the front. Each one goes to its section. */
const BACK_FOLDERS = [
  { id: "preguntas", label: "Preguntas" },
  { id: "entidades", label: "Entidades" },
  { id: "pagos", label: "Pagos" },
  { id: "servicios", label: "Servicios" },
] as const;

/**
 * The first screen: the headline and a stack of file folders.
 * The front folder is open. It has the actions, and the section below continues it.
 */
export const Hero = ({ actions }: { actions: LandingActions }) => (
  <section className="lp-hero">
    <div className="lp-hero-text">
      <h1>Pague aquí</h1>
      <p className="lp-hero-lead">
        Consulte sus comparendos y trámites de tránsito de Barrancabermeja.
        Pague en línea con tarjeta, PSE o Nequi.
      </p>
    </div>
    <div className="lp-stack">
      <nav aria-label="Secciones de esta página">
        {BACK_FOLDERS.map((folder, index) => (
          <a
            className="lp-folder lp-tabbed"
            data-layer={index + 1}
            href={`#${folder.id}`}
            key={folder.id}
            style={cssVars({ "--i": index })}
          >
            <span className="lp-tab">{folder.label}</span>
          </a>
        ))}
      </nav>
      <div
        className="lp-folder lp-folder-front lp-tabbed lp-on-field"
        style={cssVars({ "--i": BACK_FOLDERS.length })}
      >
        <a className="lp-tab" href="#comparendos">
          Comparendos
        </a>
        <div className="lp-folder-actions">
          <ActionLink action={actions.primary} look="button" />
          {actions.secondary ? (
            <ActionLink action={actions.secondary} look="link" />
          ) : null}
        </div>
      </div>
    </div>
  </section>
);
