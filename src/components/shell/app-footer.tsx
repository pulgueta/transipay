import { Link, useLocation } from "@tanstack/react-router";

import { cssVars } from "@/components/landing/css-vars";
import type { AppSession } from "@/lib/auth/guards";

import { footerLinksFor } from "./nav-links";

/** The footer of the app pages. */
const AppFooterBar = ({ session }: { session: AppSession | null }) => (
  <footer className="border-t" data-ui>
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-start md:justify-between">
      <div className="flex max-w-md flex-col gap-1">
        <p className="font-semibold tracking-tight">Transipay</p>
        <p className="text-muted-foreground text-sm">
          Inspección de Tránsito y Transporte de Barrancabermeja (ITTB)
        </p>
        <p className="text-muted-foreground text-sm">
          Transipay no reemplaza al RUNT ni al SIMIT. Wompi procesa los pagos.
        </p>
      </div>
      <nav
        aria-label="Pie de página"
        className="flex flex-wrap gap-x-6 gap-y-2"
      >
        {footerLinksFor(session).map((link) => (
          <Link
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            key={link.to}
            to={link.to}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  </footer>
);

/**
 * The name, one letter on each tab. `height` is the height of the tab in the row.
 * A narrow screen shows the two rows (TRAN, SIPAY). A wide screen puts them on one line.
 */
const MARK_ROWS = [
  [
    { letter: "T", height: "100%" },
    { letter: "r", height: "70%" },
    { letter: "a", height: "88%" },
    { letter: "n", height: "62%" },
  ],
  [
    { letter: "s", height: "94%" },
    { letter: "i", height: "74%" },
    { letter: "p", height: "100%" },
    { letter: "a", height: "66%" },
    { letter: "y", height: "90%" },
  ],
] as const;

const COMMONS = "https://commons.wikimedia.org/wiki/File:";

/** The pictures of the home page. Each licence needs the title, the author, and the two links. */
const CREDITS = [
  {
    shows: "La avenida",
    title: "Avenida del Ferrocarril y Parque Camilo Torres",
    author: "Miguel9201",
    source: `${COMMONS}Avenida_del_Ferrocarril_y_Parque_Camilo_Torres.jpg`,
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/deed.es",
  },
  {
    shows: "El Cristo Petrolero",
    title:
      "Barrancabermeja, Santander Department, Colombia - panoramio - yesid ferney patiño … (1)",
    author: "yesid ferney patiño",
    source: `${COMMONS}Barrancabermeja,_Santander_Department,_Colombia_-_panoramio_-_yesid_ferney_pati%C3%B1o_%E2%80%A6_(1).jpg`,
    licence: "CC BY 3.0",
    licenceUrl: "https://creativecommons.org/licenses/by/3.0/deed.es",
  },
  {
    shows: "La refinería",
    title:
      "Barrancabermeja, Santander Department, Colombia - panoramio - yesid ferney patiño … (3)",
    author: "yesid ferney patiño",
    source: `${COMMONS}Barrancabermeja,_Santander_Department,_Colombia_-_panoramio_-_yesid_ferney_pati%C3%B1o_%E2%80%A6_(3).jpg`,
    licence: "CC BY 3.0",
    licenceUrl: "https://creativecommons.org/licenses/by/3.0/deed.es",
  },
  {
    shows: "El puente",
    title: "Puente-Rio Magdalena",
    author: "Jhon Hegel Gutierrez",
    source: `${COMMONS}Puente-Rio_Magdalena.jpg`,
    licence: "CC BY-SA 2.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0/deed.es",
  },
] as const;

/**
 * The footer of the home page: the name made of tabs, the links of the role, and the picture credits.
 */
const HomeFooter = ({ session }: { session: AppSession | null }) => (
  <footer className="lp lp-footer">
    <p aria-label="Transipay" className="lp-mark-rows">
      {MARK_ROWS.map((row) => (
        <span aria-hidden className="lp-mark-row" key={row[0].letter}>
          {row.map((tab) => (
            <span
              className="lp-letter"
              key={`${tab.letter}${tab.height}`}
              style={cssVars({ "--h": tab.height })}
            >
              {tab.letter}
            </span>
          ))}
        </span>
      ))}
    </p>
    <div className="lp-footer-grid">
      <nav aria-label="Pie de página" className="lp-footer-links">
        {footerLinksFor(session).map((link) => (
          <Link key={link.to} to={link.to}>
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="lp-footer-lines">
        Transipay no reemplaza al RUNT ni al SIMIT. Wompi procesa los pagos.
      </p>
      <div className="lp-credits">
        <p>
          Fotografías de Wikimedia Commons. Transipay las recortó y las puso en
          escala de grises. Cada versión tiene la licencia de su original.
        </p>
        <ul>
          {CREDITS.map((credit) => (
            <li key={credit.source}>
              {credit.shows}: <a href={credit.source}>«{credit.title}»</a>, de{" "}
              {credit.author}, <a href={credit.licenceUrl}>{credit.licence}</a>.
            </li>
          ))}
        </ul>
      </div>
    </div>
    <div className="lp-footer-last">
      <p>Inspección de Tránsito y Transporte de Barrancabermeja (ITTB)</p>
      <span className="lp-btn-wrap">
        <a className="lp-btn" href="#inicio">
          Volver arriba
        </a>
      </span>
    </div>
  </footer>
);

/** The bottom of every page. The home page has its own footer. All other pages have the app footer. */
export const AppFooter = ({ session }: { session: AppSession | null }) => {
  const isHome = useLocation({
    select: (location) => location.pathname === "/",
  });

  return isHome ? (
    <HomeFooter session={session} />
  ) : (
    <AppFooterBar session={session} />
  );
};
