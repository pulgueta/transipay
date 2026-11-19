import { ActionLink } from "./action-link";
import { CourseCalculator } from "./course-calculator";
import type { LandingAction } from "./landing-actions";
import { AVENIDA, Photo } from "./photo";

interface CourseSectionProps {
  /** The link to the courses, or null for a role that cannot read them. */
  coursesAction: LandingAction | null;
  initialPesos?: number;
  initialPercent?: number;
}

/** The open folder of the first screen continues here, with the course discount calculator. */
export const CourseSection = ({
  coursesAction,
  initialPesos,
  initialPercent,
}: CourseSectionProps) => (
  <section className="lp-open lp-on-field" id="comparendos">
    <div className="lp-open-grid">
      <div className="lp-open-copy">
        <h2 data-reveal>Un curso baja el valor</h2>
        <p data-reveal>
          Un CEA publica el descuento de cada sesión de curso. Inscríbase y
          asista. El descuento se aplica una sola vez, a un comparendo
          pendiente.
        </p>
        {coursesAction ? (
          <p data-reveal>
            <ActionLink action={coursesAction} look="link" />
          </p>
        ) : null}
      </div>
      <CourseCalculator
        initialPercent={initialPercent}
        initialPesos={initialPesos}
      />
      <figure className="lp-figure lp-open-figure lp-tabbed">
        <figcaption className="lp-tab">Avenida del Ferrocarril</figcaption>
        <Photo
          alt="La Avenida del Ferrocarril en Barrancabermeja, con motos parqueadas junto al Parque Camilo Torres"
          photo={AVENIDA}
          sizes="(min-width: 900px) 27vw, 100vw"
        />
      </figure>
    </div>
  </section>
);
